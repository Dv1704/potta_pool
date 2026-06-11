import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MatchmakingService } from '../matchmaking/matchmaking.service.js';
import { GameService } from '../services/game.service.js';
import { v4 as uuidv4 } from 'uuid';
import { WalletService } from '../../wallet/wallet.service.js';
import { BadRequestException, Inject, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FraudService } from '../../fraud/fraud.service.js';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service.js';
import jwt from 'jsonwebtoken';

@WebSocketGateway({
    cors: {
        origin: (origin, callback) => {
            // Allow all origins
            callback(null, true);
        },
        credentials: true,
        methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling']
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server!: Server;

    private lastShotTime: Map<string, number> = new Map();
    private readyPlayers: Map<string, Set<string>> = new Map();
    private privateRooms: Map<string, { mode: 'speed' | 'turn'; stake: number; creatorId: string; creatorSocketId: string }> = new Map();

    constructor(
        @Inject(MatchmakingService) private matchmakingService: MatchmakingService,
        @Inject(GameService) private gameService: GameService,
        @Inject(WalletService) private walletService: WalletService,
        @Inject(PrismaService) private prisma: PrismaService,
        @Inject(FraudService) private fraudService: FraudService,
        @Inject(ConfigService) private configService: ConfigService,
        @Inject(UsersService) private usersService: UsersService,
    ) {
        // Periodic check for timeouts (every 1 second for Speed Mode responsiveness)
        setInterval(async () => {
            try {
                const { endedGames, updatedGames } = await this.gameService.checkAllTimeouts();
                
                for (const { gameId, winnerId, gameState } of endedGames) {
                    const game = await this.gameService.getGame(gameId);
                    const playerIds = game ? game.players : [winnerId || ''];
                    const players = await Promise.all(playerIds.map(async (pId) => {
                        const user = await this.prisma.user.findUnique({
                            where: { id: pId },
                            select: { id: true, name: true, email: true }
                        });
                        return {
                            id: pId,
                            name: user?.name || user?.email?.split('@')[0] || 'Player'
                        };
                    }));
                    const winnerUser = players.find(p => p.id === winnerId);
                    const winnerName = winnerUser ? winnerUser.name : 'Unknown';

                    this.server.to(gameId).emit('gameEnded', {
                        message: `Game over! Winner: ${winnerName}`,
                        winnerId: winnerId,
                        gameState: {
                            ...gameState,
                            players,
                            stake: game?.stake || 0,
                            betAmount: game?.stake || 0
                        }
                    });
                }

                for (const { gameId, gameState } of updatedGames) {
                    const game = await this.gameService.getGame(gameId);
                    if (game) {
                        const players = await Promise.all(game.players.map(async (pId) => {
                            const user = await this.prisma.user.findUnique({
                                where: { id: pId },
                                select: { id: true, name: true, email: true }
                            });
                            return {
                                id: pId,
                                name: user?.name || user?.email?.split('@')[0] || 'Player'
                            };
                        }));
                        this.server.to(gameId).emit('gameState', {
                            ...gameState,
                            players,
                            stake: game.stake,
                            betAmount: game.stake
                        });
                    }
                }
            } catch (err) {
                console.error('[TimeoutScanner] Error checking timeouts:', err);
            }
        }, 1000);
    }

    private getAuthToken(client: Socket): string | null {
        const authHeader = client.handshake.headers?.authorization as string | undefined;
        if (authHeader?.startsWith('Bearer ')) {
            return authHeader.slice(7).trim();
        }
        if (client.handshake.auth?.token) {
            return client.handshake.auth.token as string;
        }
        if (client.handshake.query?.token) {
            return client.handshake.query.token as string;
        }
        return null;
    }

    private assertPositiveInteger(value: unknown, field: string) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
            throw new BadRequestException(`${field} must be a positive integer`);
        }
    }

    private assertMode(mode: unknown) {
        if (mode !== 'speed' && mode !== 'turn') {
            throw new BadRequestException('mode must be either "speed" or "turn"');
        }
    }

    private async authenticateSocket(client: Socket) {
        if (client.data.userId) {
            return client.data.userId as string;
        }

        const token = this.getAuthToken(client);
        if (!token) {
            throw new UnauthorizedException('Socket authentication required');
        }

        const secret = this.configService.get<string>('JWT_SECRET') || 'secretKey';
        let payload: any;
        try {
            payload = jwt.verify(token, secret);
        } catch (err) {
            throw new UnauthorizedException('Invalid authentication token');
        }

        if (!payload || typeof payload.sub !== 'string') {
            throw new UnauthorizedException('Invalid authentication payload');
        }

        const user = await this.usersService.findById(payload.sub);
        if (!user || user.isBanned) {
            throw new UnauthorizedException('User not authorized');
        }

        client.data.userId = user.id;
        client.data.userEmail = user.email;
        return user.id;
    }

    private getClientUserId(client: Socket, payloadUserId?: string) {
        const actualUserId = client.data.userId as string | undefined;
        if (!actualUserId && payloadUserId) {
            return payloadUserId;
        }
        return actualUserId || payloadUserId;
    }

    async handleConnection(client: Socket) {
        console.log(`Client connected: ${client.id}`);
        try {
            const userId = await this.authenticateSocket(client);
            const ip = client.handshake.headers['x-forwarded-for'] || client.handshake.address;
            const ipStr = Array.isArray(ip) ? ip[0] : ip;
            if (typeof ipStr === 'string') {
                await this.fraudService.trackUserConnection(userId, ipStr);
            }
        } catch (error: any) {
            console.warn(`[Connection] Rejected client ${client.id}: ${error.message}`);
            client.emit('error', { message: error.message || 'Authentication failed' });
            client.disconnect(true);
        }
    }

    handleDisconnect(client: Socket) {
        console.log(`Client disconnected: ${client.id}`);
        const userId = client.data.userId as string | undefined;
        if (userId) {
            this.matchmakingService.removeFromQueue(userId);
        }
    }

    @SubscribeMessage('joinQueue')
    async handleJoinQueue(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId?: string; stake: number; mode: 'speed' | 'turn' },
    ) {
        const userId = await this.authenticateSocket(client);
        if (data.userId && data.userId !== userId) {
            client.emit('error', { message: 'Payload userId does not match authenticated user' });
            return;
        }
        this.assertPositiveInteger(data.stake, 'stake');
        this.assertMode(data.mode);

        console.log(`[JoinQueue] Request from ${userId} (Socket: ${client.id}) for stake ${data.stake}`);

        try {
            const balance = await this.walletService.getBalance(userId);
            console.log(`[JoinQueue] User ${userId} balance: ${balance.available}`);

            if (balance.available < data.stake) {
                console.warn(`[JoinQueue] Insufficient funds for ${userId}: ${balance.available} < ${data.stake}`);
                client.emit('error', { message: 'Insufficient funds for this stake' });
                return;
            }

            const match = await this.matchmakingService.addToQueue({
                userId,
                socketId: client.id,
                stake: data.stake,
                mode: data.mode,
            });

            if (match) {
                console.log(`[JoinQueue] Match found for ${userId}! Creating game...`);
                const gameId = uuidv4();
                const playerIds = match.map((p: any) => p.userId);

                // Run matchmaking fraud check
                const clientIps: Record<string, string> = {};
                for (const p of match) {
                    const socket = this.server.sockets.sockets.get(p.socketId);
                    if (socket) {
                        const ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
                        const ipStr = Array.isArray(ip) ? ip[0] : ip;
                        if (typeof ipStr === 'string') {
                            clientIps[p.userId] = ipStr;
                        }
                    }
                }
                await this.fraudService.checkMatchmakingFraud(playerIds, clientIps);

                try {
                    await this.gameService.createGame(gameId, playerIds, data.mode, data.stake);
                    const game = await this.gameService.getGame(gameId);

                    // Fetch opponent names and all players data from database
                    const players = await Promise.all(playerIds.map(async (pId: string) => {
                        const user = await this.prisma.user.findUnique({
                            where: { id: pId },
                            select: { id: true, name: true, email: true }
                        });
                        return {
                            id: pId,
                            name: user?.name || user?.email?.split('@')[0] || 'Player'
                        };
                    }));

                    for (const p of match) {
                        const socket = this.server.sockets.sockets.get(p.socketId);
                        if (socket) {
                            socket.join(gameId);
                            console.log(`[JoinQueue] Socket ${p.socketId} joined room ${gameId}`);
                        }

                        const opponentId = playerIds.find((id: string) => id !== p.userId);
                        const opponent = players.find(pl => pl.id === opponentId);

                        this.server.to(p.socketId).emit('matchFound', {
                            gameId,
                            opponentId,
                            opponentName: opponent?.name || 'Player',
                            mode: data.mode,
                            stake: data.stake,
                            gameState: {
                                ...game?.mode.getGameState(),
                                players,
                                stake: game?.stake || 0,
                                betAmount: game?.stake || 0
                            }
                        });
                    }
                    console.log(`[JoinQueue] Game ${gameId} created successfully.`);
                } catch (error: any) {
                    console.error(`[JoinQueue] Failed to create game: ${error.message}`);
                    match.forEach((p: any) => {
                        this.server.to(p.socketId).emit('error', { message: 'Failed to create game: ' + error.message });
                    });
                }
            } else {
                console.log(`[JoinQueue] No match found immediately. User ${userId} added to queue.`);
                client.emit('waitingInQueue', { message: 'Searching for opponent...' });
            }
        } catch (error: any) {
            console.error(`[JoinQueue] Error handling join queue: ${error.message}`);
            client.emit('error', { message: error.message || 'An unexpected error occurred' });
        }
    }

    @SubscribeMessage('takeShot')
    async handleTakeShot(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { gameId: string; userId?: string; angle: number; power: number; sideSpin: number; backSpin: number; cueBallX?: number; cueBallY?: number },
    ) {
        const userId = await this.authenticateSocket(client);
        if (data.userId && data.userId !== userId) {
            client.emit('error', { message: 'Payload userId does not match authenticated user' });
            return;
        }
        if (typeof data.angle !== 'number' || !Number.isFinite(data.angle)) {
            throw new BadRequestException('angle must be a valid number');
        }
        if (typeof data.power !== 'number' || !Number.isFinite(data.power) || data.power < 0) {
            throw new BadRequestException('power must be a non-negative number');
        }
        if (typeof data.sideSpin !== 'number' || !Number.isFinite(data.sideSpin)) {
            throw new BadRequestException('sideSpin must be a valid number');
        }
        if (typeof data.backSpin !== 'number' || !Number.isFinite(data.backSpin)) {
            throw new BadRequestException('backSpin must be a valid number');
        }

        console.log(`[TakeShot] Request from ${userId} for game ${data.gameId}`);
        const lastShot = this.lastShotTime.get(userId) || 0;
        const now = Date.now();
        if (now - lastShot < 1000) {
            return;
        }
        this.lastShotTime.set(userId, now);

        try {
            client.broadcast.to(data.gameId).emit('opponentShotStart', {
                playerId: userId,
                vector: {
                    angle: data.angle,
                    power: data.power,
                    sideSpin: data.sideSpin || 0,
                    backSpin: data.backSpin || 0
                }
            });

            // 2. SERVER CALCULATION (The "Truth")
            // This runs the authoritative physics engine
            const gameBeforeShot = await this.gameService.getGame(data.gameId);
            if (!gameBeforeShot) {
                throw new Error('Game not found');
            }
            if (!gameBeforeShot.players.includes(userId)) {
                throw new Error('Player not authorized in this game');
            }
            const { players: playerIds, stake } = gameBeforeShot;

            // Enrich with player names
            const players = await Promise.all(playerIds.map(async (pId) => {
                const user = await this.prisma.user.findUnique({
                    where: { id: pId },
                    select: { id: true, name: true, email: true }
                });
                return {
                    id: pId,
                    name: user?.name || user?.email?.split('@')[0] || 'Player'
                };
            }));

            process.stdout.write(`[TakeShot] Starting simulation for ${data.gameId}...\n`);
            const shotInfo = await this.gameService.handleShot(
                data.gameId,
                userId,
                data.angle,
                data.power,
                data.sideSpin || 0,
                data.backSpin || 0,
                data.cueBallX,
                data.cueBallY
            );
            process.stdout.write(`[TakeShot] Simulation complete for ${data.gameId}.\n`);

            const { result, gameState, isFinished, winner } = shotInfo;

            // 3. BROADCAST RESULT (The "Correction")
            // Send the final resting positions to everyone for verification
            this.server.to(data.gameId).emit('shotResult', {
                shooterId: userId,
                shotResult: result,
                gameState: {
                    ...gameState,
                    players,
                    stake: stake,
                    betAmount: stake
                }
            });

            if (isFinished) {
                const winnerUser = players.find(p => p.id === winner);
                const winnerName = winnerUser ? winnerUser.name : 'Unknown';
                // Wait 12 seconds for the client to complete the shot/roll animation before redirecting
                setTimeout(() => {
                    this.server.to(data.gameId).emit('gameEnded', {
                        message: `Game over! Winner: ${winnerName}`,
                        winnerId: winner
                    });
                }, 12000);
            }

        } catch (error: any) {
            console.error(`[TakeShot] Error from user ${userId}: ${error.message}`);
            client.emit('error', { message: error.message });
        }
    }

    @SubscribeMessage('gameChat')
    async handleGameChat(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { gameId: string; userId?: string; messageId: string; text: string },
    ) {
        const userId = await this.authenticateSocket(client);
        if (data.userId && data.userId !== userId) {
            client.emit('error', { message: 'Payload userId does not match authenticated user' });
            return;
        }

        try {
            const game = await this.gameService.getGame(data.gameId);
            if (!game || !game.players.includes(userId)) {
                client.emit('error', { message: 'Unable to send chat to this game.' });
                return;
            }

            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, name: true, email: true }
            });

            const senderName = user?.name || user?.email?.split('@')[0] || 'Player';
            const timestamp = Date.now();

            this.server.to(data.gameId).emit('gameChat', {
                messageId: data.messageId,
                userId,
                senderName,
                text: data.text,
                timestamp,
            });
        } catch (error: any) {
            console.error(`[GameChat] Error from user ${userId}: ${error?.message}`);
            client.emit('error', { message: error?.message || 'Failed to send chat message' });
        }
    }

    @SubscribeMessage('voiceOffer')
    async handleVoiceOffer(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { gameId: string; senderId?: string; offer: any },
    ) {
        const userId = await this.authenticateSocket(client);
        if (data.senderId && data.senderId !== userId) {
            client.emit('error', { message: 'Payload senderId does not match authenticated user' });
            return;
        }

        try {
            const game = await this.gameService.getGame(data.gameId);
            if (!game || !game.players.includes(userId)) {
                client.emit('error', { message: 'Unable to send voice offer for this game.' });
                return;
            }

            this.server.to(data.gameId).emit('voiceOffer', {
                gameId: data.gameId,
                senderId: userId,
                offer: data.offer,
            });
        } catch (error: any) {
            console.error(`[VoiceOffer] Error from user ${userId}: ${error?.message}`);
            client.emit('error', { message: error?.message || 'Failed to forward voice offer' });
        }
    }

    @SubscribeMessage('voiceAnswer')
    async handleVoiceAnswer(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { gameId: string; senderId?: string; answer: any },
    ) {
        const userId = await this.authenticateSocket(client);
        if (data.senderId && data.senderId !== userId) {
            client.emit('error', { message: 'Payload senderId does not match authenticated user' });
            return;
        }

        try {
            const game = await this.gameService.getGame(data.gameId);
            if (!game || !game.players.includes(userId)) {
                client.emit('error', { message: 'Unable to send voice answer for this game.' });
                return;
            }

            this.server.to(data.gameId).emit('voiceAnswer', {
                gameId: data.gameId,
                senderId: userId,
                answer: data.answer,
            });
        } catch (error: any) {
            console.error(`[VoiceAnswer] Error from user ${userId}: ${error?.message}`);
            client.emit('error', { message: error?.message || 'Failed to forward voice answer' });
        }
    }

    @SubscribeMessage('voiceCandidate')
    async handleVoiceCandidate(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { gameId: string; senderId?: string; candidate: any },
    ) {
        const userId = await this.authenticateSocket(client);
        if (data.senderId && data.senderId !== userId) {
            client.emit('error', { message: 'Payload senderId does not match authenticated user' });
            return;
        }

        try {
            const game = await this.gameService.getGame(data.gameId);
            if (!game || !game.players.includes(userId)) {
                client.emit('error', { message: 'Unable to send ICE candidate for this game.' });
                return;
            }

            this.server.to(data.gameId).emit('voiceCandidate', {
                gameId: data.gameId,
                senderId: userId,
                candidate: data.candidate,
            });
        } catch (error: any) {
            console.error(`[VoiceCandidate] Error from user ${userId}: ${error?.message}`);
            client.emit('error', { message: error?.message || 'Failed to forward ICE candidate' });
        }
    }

    @SubscribeMessage('voiceHangup')
    async handleVoiceHangup(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { gameId: string; senderId?: string },
    ) {
        const userId = await this.authenticateSocket(client);
        if (data.senderId && data.senderId !== userId) {
            client.emit('error', { message: 'Payload senderId does not match authenticated user' });
            return;
        }

        try {
            const game = await this.gameService.getGame(data.gameId);
            if (!game || !game.players.includes(userId)) {
                client.emit('error', { message: 'Unable to send voice hangup for this game.' });
                return;
            }

            this.server.to(data.gameId).emit('voiceHangup', {
                gameId: data.gameId,
                senderId: userId,
            });
        } catch (error: any) {
            console.error(`[VoiceHangup] Error from user ${userId}: ${error?.message}`);
            client.emit('error', { message: error?.message || 'Failed to forward voice hangup' });
        }
    }

    @SubscribeMessage('joinGame')
    async handleJoinGame(@ConnectedSocket() client: Socket, @MessageBody() data: { gameId: string }) {
        const userId = await this.authenticateSocket(client);
        const game = await this.gameService.getGame(data.gameId);
        if (!game || !game.players.includes(userId)) {
            client.emit('error', { message: 'Unable to join this game.' });
            return { error: 'Unable to join this game.' };
        }
        client.join(data.gameId);
        return { ok: true };
    }

    @SubscribeMessage('playerReady')
    async handlePlayerReady(@ConnectedSocket() client: Socket, @MessageBody() data: { gameId: string, userId?: string }) {
        const userId = await this.authenticateSocket(client);
        if (data.userId && data.userId !== userId) {
            client.emit('error', { message: 'Payload userId does not match authenticated user' });
            return;
        }

        console.log(`[PlayerReady] User ${userId} is ready for game ${data.gameId}`);

        const game = await this.gameService.getGame(data.gameId);

        // 1. Recovery: If game started, just send them the state immediately.
        if (game && game.mode.isStarted()) {
            console.log(`[PlayerReady] Game ${data.gameId} already started. Sending state to ${userId}`);
            // Ensure the client is in the room before sending so they can receive future broadcasts
            client.join(data.gameId);
            client.emit('startMatch', {
                gameId: data.gameId,
                startTime: Date.now(),
                gameState: game.mode.getGameState()
            });
            return;
        }

        if (!game || !game.players.includes(userId)) {
            client.emit('error', { message: 'Unable to mark ready for this game.' });
            return;
        }

        // Ensure the socket is in the game room before we potentially emit startMatch.
        // joinGame also does this, but it runs concurrently and may not have completed yet.
        client.join(data.gameId);

        if (!this.readyPlayers.has(data.gameId)) {
            this.readyPlayers.set(data.gameId, new Set());
        }

        const readySet = this.readyPlayers.get(data.gameId)!;
        readySet.add(userId);

        console.log(`[PlayerReady] Game ${data.gameId} Ready Count: ${readySet.size}/${game?.players.length}`);

        // Check if all players are ready
        if (game && readySet.size >= game.players.length) {
            console.log(`[PlayerReady] All players ready for game ${data.gameId}. Starting...`);
            const state = await this.gameService.startGame(data.gameId);

            this.server.to(data.gameId).emit('startMatch', {
                gameId: data.gameId,
                startTime: Date.now(),
                gameState: state
            });

            // Clean up ready set
            this.readyPlayers.delete(data.gameId);
        }
    }

    @SubscribeMessage('stickMove')
    handleStickMove(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { gameId: string; userId: string; angle: number },
    ): void {
        client.to(data.gameId).emit('opponentStickMove', { angle: data.angle });
    }

    @SubscribeMessage('leaveQueue')
    async handleLeaveQueue(@ConnectedSocket() client: Socket) {
        const userId = await this.authenticateSocket(client);
        await this.matchmakingService.removeFromQueue(userId);
    }

    @SubscribeMessage('lookupRoom')
    async handleLookupRoom(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { code: string },
    ) {
        await this.authenticateSocket(client);
        const code = (data.code || '').toUpperCase().trim();
        const room = this.privateRooms.get(code);

        if (!room) {
            client.emit('roomLookup', { found: false });
            return;
        }

        const creator = await this.prisma.user.findUnique({
            where: { id: room.creatorId },
            select: { name: true, email: true },
        });

        client.emit('roomLookup', {
            found: true,
            code,
            mode: room.mode,
            stake: room.stake,
            creatorName: creator?.name || creator?.email?.split('@')[0] || 'Player',
        });
    }

    @SubscribeMessage('createPrivateRoom')
    async handleCreatePrivateRoom(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { mode: 'speed' | 'turn'; stake?: number },
    ) {
        const userId = await this.authenticateSocket(client);
        this.assertMode(data.mode);
        const stake = data.stake ?? 0;
        if (stake > 0 && stake < 10) {
            client.emit('error', { message: 'Minimum stake is GH₵10.' });
            return;
        }

        // Cancel any existing private room this user created
        for (const [code, room] of this.privateRooms.entries()) {
            if (room.creatorId === userId) this.privateRooms.delete(code);
        }

        // Generate unique 6-char alphanumeric code
        let code: string;
        do {
            code = Math.random().toString(36).slice(2, 8).toUpperCase();
        } while (this.privateRooms.has(code));

        this.privateRooms.set(code, { mode: data.mode, stake, creatorId: userId, creatorSocketId: client.id });
        // Auto-expire after 15 minutes
        setTimeout(() => this.privateRooms.delete(code), 15 * 60 * 1000);

        console.log(`[PrivateRoom] ${userId} created room ${code} (mode=${data.mode}, stake=${stake})`);
        client.emit('roomCreated', { code, mode: data.mode, stake });
    }

    @SubscribeMessage('joinPrivateRoom')
    async handleJoinPrivateRoom(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { code: string },
    ) {
        const userId = await this.authenticateSocket(client);
        const code = (data.code || '').toUpperCase().trim();
        const room = this.privateRooms.get(code);

        if (!room) {
            client.emit('error', { message: 'Room not found. Check the code and try again.' });
            return;
        }
        if (room.creatorId === userId) {
            client.emit('error', { message: 'You cannot join your own room.' });
            return;
        }

        this.privateRooms.delete(code);

        const playerIds = [room.creatorId, userId];
        const gameId = uuidv4();

        console.log(`[PrivateRoom] ${userId} joined room ${code}. Creating game ${gameId}...`);

        try {
            await this.gameService.createGame(gameId, playerIds, room.mode, room.stake);
            const game = await this.gameService.getGame(gameId);

            const players = await Promise.all(playerIds.map(async (pId) => {
                const user = await this.prisma.user.findUnique({
                    where: { id: pId },
                    select: { id: true, name: true, email: true }
                });
                return { id: pId, name: user?.name || user?.email?.split('@')[0] || 'Player' };
            }));

            const participants = [
                { userId: room.creatorId, socketId: room.creatorSocketId },
                { userId, socketId: client.id },
            ];

            for (const p of participants) {
                const sock = this.server.sockets.sockets.get(p.socketId);
                if (sock) sock.join(gameId);

                const opponentId = playerIds.find(id => id !== p.userId);
                const opponent = players.find(pl => pl.id === opponentId);

                this.server.to(p.socketId).emit('matchFound', {
                    gameId,
                    opponentId,
                    opponentName: opponent?.name || 'Player',
                    mode: room.mode,
                    stake: room.stake,
                    gameState: {
                        ...game?.mode.getGameState(),
                        players,
                        stake: room.stake,
                        betAmount: room.stake,
                    },
                });
            }
            console.log(`[PrivateRoom] Game ${gameId} started (${room.mode}, stake=${room.stake}).`);
        } catch (error: any) {
            console.error(`[PrivateRoom] Failed to create game: ${error.message}`);
            client.emit('error', { message: 'Failed to start game: ' + error.message });
            this.server.to(room.creatorSocketId).emit('error', { message: 'Friend match failed to start.' });
        }
    }

    @SubscribeMessage('getGameState')
    async handleGetGameState(@ConnectedSocket() client: Socket, @MessageBody() data: { gameId: string }) {
        const userId = await this.authenticateSocket(client);
        const game = await this.gameService.getGame(data.gameId);
        if (!game || !game.players.includes(userId)) {
            client.emit('error', { message: 'Unable to retrieve state for this game.' });
            return;
        }

        const state = game.mode.getGameState();

        const players = await Promise.all(game.players.map(async (pId) => {
            const user = await this.prisma.user.findUnique({
                where: { id: pId },
                select: { id: true, name: true, email: true }
            });
            return {
                id: pId,
                name: user?.name || user?.email?.split('@')[0] || 'Player'
            };
        }));

        client.emit('gameState', {
            ...state,
            players,
            stake: game.stake,
            betAmount: game.stake
        });
    }
}
