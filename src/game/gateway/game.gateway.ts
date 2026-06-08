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
import { BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FraudService } from '../../fraud/fraud.service.js';

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

    constructor(
        @Inject(MatchmakingService) private matchmakingService: MatchmakingService,
        @Inject(GameService) private gameService: GameService,
        @Inject(WalletService) private walletService: WalletService,
        @Inject(PrismaService) private prisma: PrismaService,
        @Inject(FraudService) private fraudService: FraudService,
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

    async handleConnection(client: Socket) {
        console.log(`Client connected: ${client.id}`);
        const userId = client.handshake.query.userId as string;
        if (userId) {
            const ip = client.handshake.headers['x-forwarded-for'] || client.handshake.address;
            const ipStr = Array.isArray(ip) ? ip[0] : ip;
            if (typeof ipStr === 'string') {
                await this.fraudService.trackUserConnection(userId, ipStr);
            }
        }
    }

    handleDisconnect(client: Socket) {
        console.log(`Client disconnected: ${client.id}`);
        const userId = client.handshake.query.userId as string;
        if (userId) {
            this.matchmakingService.removeFromQueue(userId);
        }
    }

    @SubscribeMessage('joinQueue')
    async handleJoinQueue(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId: string; stake: number; mode: 'speed' | 'turn' },
    ) {
        console.log(`[JoinQueue] Request from ${data.userId} (Socket: ${client.id}) for stake ${data.stake}`);

        try {
            // 1. Insufficient Funds Guard
            const balance = await this.walletService.getBalance(data.userId);
            console.log(`[JoinQueue] User ${data.userId} balance: ${balance.available}`);

            if (balance.available < data.stake) {
                console.warn(`[JoinQueue] Insufficient funds for ${data.userId}: ${balance.available} < ${data.stake}`);
                client.emit('error', { message: 'Insufficient funds for this stake' });
                return;
            }

            const match = await this.matchmakingService.addToQueue({
                userId: data.userId,
                socketId: client.id,
                stake: data.stake,
                mode: data.mode,
            });

            if (match) {
                console.log(`[JoinQueue] Match found for ${data.userId}! Creating game...`);
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
                console.log(`[JoinQueue] No match found immediately. User ${data.userId} added to queue.`);
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
        @MessageBody() data: { gameId: string; userId: string; angle: number; power: number; sideSpin: number; backSpin: number; cueBallX?: number; cueBallY?: number },
    ) {
        console.log(`[TakeShot] Request from ${data.userId} for game ${data.gameId}`);
        // Input Throttling
        const lastShot = this.lastShotTime.get(data.userId) || 0;
        const now = Date.now();
        if (now - lastShot < 1000) { // 1 second throttle
            return;
        }
        this.lastShotTime.set(data.userId, now);

        try {
            // 1. INSTANT RELAY (The "iMessage" Feel)
            // Tell the opponent to start simulating immediately.
            // We exclude the sender because they are already simulating locally.
            client.broadcast.to(data.gameId).emit('opponentShotStart', {
                playerId: data.userId,
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
                data.userId,
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
                shooterId: data.userId,
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
            console.error(`[TakeShot] Error from user ${data.userId}: ${error.message}`);
            client.emit('error', { message: error.message });
        }
    }

    @SubscribeMessage('gameChat')
    async handleGameChat(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { gameId: string; userId: string; messageId: string; text: string },
    ) {
        try {
            const game = await this.gameService.getGame(data.gameId);
            if (!game || !game.players.includes(data.userId)) {
                client.emit('error', { message: 'Unable to send chat to this game.' });
                return;
            }

            const user = await this.prisma.user.findUnique({
                where: { id: data.userId },
                select: { id: true, name: true, email: true }
            });

            const senderName = user?.name || user?.email?.split('@')[0] || 'Player';
            const timestamp = Date.now();

            this.server.to(data.gameId).emit('gameChat', {
                messageId: data.messageId,
                userId: data.userId,
                senderName,
                text: data.text,
                timestamp,
            });
        } catch (error: any) {
            console.error(`[GameChat] Error from user ${data.userId}: ${error?.message}`);
            client.emit('error', { message: error?.message || 'Failed to send chat message' });
        }
    }

    @SubscribeMessage('joinGame')
    handleJoinGame(@ConnectedSocket() client: Socket, @MessageBody() data: { gameId: string }) {
        client.join(data.gameId);
    }

    @SubscribeMessage('playerReady')
    async handlePlayerReady(@ConnectedSocket() client: Socket, @MessageBody() data: { gameId: string, userId: string }) {
        console.log(`[PlayerReady] User ${data.userId} is ready for game ${data.gameId}`);

        const game = await this.gameService.getGame(data.gameId);

        // 1. Recovery: If game started, just send them the state immediately.
        if (game && game.mode.isStarted()) {
            console.log(`[PlayerReady] Game ${data.gameId} already started. Sending state to ${data.userId}`);
            client.emit('startMatch', {
                gameId: data.gameId,
                startTime: Date.now(),
                gameState: game.mode.getGameState()
            });
            return;
        }

        if (!this.readyPlayers.has(data.gameId)) {
            this.readyPlayers.set(data.gameId, new Set());
        }

        const readySet = this.readyPlayers.get(data.gameId)!;
        readySet.add(data.userId);

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

    @SubscribeMessage('leaveQueue')
    async handleLeaveQueue(@MessageBody() data: { userId: string }) {
        await this.matchmakingService.removeFromQueue(data.userId);
    }

    @SubscribeMessage('getGameState')
    async handleGetGameState(@ConnectedSocket() client: Socket, @MessageBody() data: { gameId: string }) {
        const game = await this.gameService.getGame(data.gameId);
        if (game) {
            const state = game.mode.getGameState();

            // Enrich state with player names
            const players = await Promise.all(game.players.map(async (pId, index) => {
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
                betAmount: game.stake // alias for compatibility
            });
        }
    }
}
