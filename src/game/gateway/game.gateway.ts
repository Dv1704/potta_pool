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
import { BadRequestException } from '@nestjs/common';
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
        private matchmakingService: MatchmakingService,
        private gameService: GameService,
        private walletService: WalletService,
        private prisma: PrismaService,
        private fraudService: FraudService,
    ) {
        // Periodic check for timeouts (every 5 seconds)
        setInterval(async () => {
            const finishedGames = await this.gameService.checkAllTimeouts();
            for (const gameId of finishedGames) {
                this.server.to(gameId).emit('gameEnded', {
                    message: 'Game ended due to timeout'
                });
            }
        }, 5000);
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

                    // Fetch opponent names from database
                    for (const p of match) {
                        const socket = this.server.sockets.sockets.get(p.socketId);
                        if (socket) {
                            socket.join(gameId);
                            console.log(`[JoinQueue] Socket ${p.socketId} joined room ${gameId}`);
                        }

                        const opponentId = playerIds.find((id: string) => id !== p.userId);
                        const opponent = await this.prisma.user.findUnique({
                            where: { id: opponentId },
                            select: { name: true, email: true }
                        });

                        this.server.to(p.socketId).emit('matchFound', {
                            gameId,
                            opponentId,
                            opponentName: opponent?.name || opponent?.email?.split('@')[0] || 'Player',
                            mode: data.mode,
                            stake: data.stake,
                            gameState: game?.mode.getGameState()
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
        @MessageBody() data: { gameId: string; userId: string; angle: number; power: number; sideSpin: number; backSpin: number },
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
            process.stdout.write(`[TakeShot] Starting simulation for ${data.gameId}...\n`);
            const result = await this.gameService.handleShot(
                data.gameId,
                data.userId,
                data.angle,
                data.power,
                data.sideSpin || 0,
                data.backSpin || 0
            );
            process.stdout.write(`[TakeShot] Simulation complete for ${data.gameId}.\n`);


            // 3. BROADCAST RESULT (The "Correction")
            // Send the final resting positions to everyone for verification
            const game = await this.gameService.getGame(data.gameId);
            if (game) {
                // Enrich with player names
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

                const state = game.mode.getGameState();
                this.server.to(data.gameId).emit('shotResult', {
                    shooterId: data.userId,
                    shotResult: result,
                    gameState: {
                        ...state,
                        players,
                        stake: game.stake,
                        betAmount: game.stake
                    }
                });
            }
        } catch (error: any) {
            console.error(`[TakeShot] Error from user ${data.userId}: ${error.message}`);
            client.emit('error', { message: error.message });
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
