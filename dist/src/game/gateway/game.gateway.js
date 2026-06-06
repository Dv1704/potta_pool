var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket, } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MatchmakingService } from '../matchmaking/matchmaking.service.js';
import { GameService } from '../services/game.service.js';
import { v4 as uuidv4 } from 'uuid';
import { WalletService } from '../../wallet/wallet.service.js';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FraudService } from '../../fraud/fraud.service.js';
let GameGateway = class GameGateway {
    matchmakingService;
    gameService;
    walletService;
    prisma;
    fraudService;
    server;
    lastShotTime = new Map();
    readyPlayers = new Map();
    constructor(matchmakingService, gameService, walletService, prisma, fraudService) {
        this.matchmakingService = matchmakingService;
        this.gameService = gameService;
        this.walletService = walletService;
        this.prisma = prisma;
        this.fraudService = fraudService;
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
            }
            catch (err) {
                console.error('[TimeoutScanner] Error checking timeouts:', err);
            }
        }, 1000);
    }
    async handleConnection(client) {
        console.log(`Client connected: ${client.id}`);
        const userId = client.handshake.query.userId;
        if (userId) {
            const ip = client.handshake.headers['x-forwarded-for'] || client.handshake.address;
            const ipStr = Array.isArray(ip) ? ip[0] : ip;
            if (typeof ipStr === 'string') {
                await this.fraudService.trackUserConnection(userId, ipStr);
            }
        }
    }
    handleDisconnect(client) {
        console.log(`Client disconnected: ${client.id}`);
        const userId = client.handshake.query.userId;
        if (userId) {
            this.matchmakingService.removeFromQueue(userId);
        }
    }
    async handleJoinQueue(client, data) {
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
                const playerIds = match.map((p) => p.userId);
                // Run matchmaking fraud check
                const clientIps = {};
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
                        const opponentId = playerIds.find((id) => id !== p.userId);
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
                }
                catch (error) {
                    console.error(`[JoinQueue] Failed to create game: ${error.message}`);
                    match.forEach((p) => {
                        this.server.to(p.socketId).emit('error', { message: 'Failed to create game: ' + error.message });
                    });
                }
            }
            else {
                console.log(`[JoinQueue] No match found immediately. User ${data.userId} added to queue.`);
                client.emit('waitingInQueue', { message: 'Searching for opponent...' });
            }
        }
        catch (error) {
            console.error(`[JoinQueue] Error handling join queue: ${error.message}`);
            client.emit('error', { message: error.message || 'An unexpected error occurred' });
        }
    }
    async handleTakeShot(client, data) {
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
            const shotInfo = await this.gameService.handleShot(data.gameId, data.userId, data.angle, data.power, data.sideSpin || 0, data.backSpin || 0, data.cueBallX, data.cueBallY);
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
        }
        catch (error) {
            console.error(`[TakeShot] Error from user ${data.userId}: ${error.message}`);
            client.emit('error', { message: error.message });
        }
    }
    handleJoinGame(client, data) {
        client.join(data.gameId);
    }
    async handlePlayerReady(client, data) {
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
        const readySet = this.readyPlayers.get(data.gameId);
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
    async handleLeaveQueue(data) {
        await this.matchmakingService.removeFromQueue(data.userId);
    }
    async handleGetGameState(client, data) {
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
};
__decorate([
    WebSocketServer(),
    __metadata("design:type", Server)
], GameGateway.prototype, "server", void 0);
__decorate([
    SubscribeMessage('joinQueue'),
    __param(0, ConnectedSocket()),
    __param(1, MessageBody()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Socket, Object]),
    __metadata("design:returntype", Promise)
], GameGateway.prototype, "handleJoinQueue", null);
__decorate([
    SubscribeMessage('takeShot'),
    __param(0, ConnectedSocket()),
    __param(1, MessageBody()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Socket, Object]),
    __metadata("design:returntype", Promise)
], GameGateway.prototype, "handleTakeShot", null);
__decorate([
    SubscribeMessage('joinGame'),
    __param(0, ConnectedSocket()),
    __param(1, MessageBody()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Socket, Object]),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "handleJoinGame", null);
__decorate([
    SubscribeMessage('playerReady'),
    __param(0, ConnectedSocket()),
    __param(1, MessageBody()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Socket, Object]),
    __metadata("design:returntype", Promise)
], GameGateway.prototype, "handlePlayerReady", null);
__decorate([
    SubscribeMessage('leaveQueue'),
    __param(0, MessageBody()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GameGateway.prototype, "handleLeaveQueue", null);
__decorate([
    SubscribeMessage('getGameState'),
    __param(0, ConnectedSocket()),
    __param(1, MessageBody()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Socket, Object]),
    __metadata("design:returntype", Promise)
], GameGateway.prototype, "handleGetGameState", null);
GameGateway = __decorate([
    WebSocketGateway({
        cors: {
            origin: (origin, callback) => {
                // Allow all origins
                callback(null, true);
            },
            credentials: true,
            methods: ['GET', 'POST'],
        },
        transports: ['websocket', 'polling']
    }),
    __param(0, Inject(MatchmakingService)),
    __param(1, Inject(GameService)),
    __param(2, Inject(WalletService)),
    __param(3, Inject(PrismaService)),
    __param(4, Inject(FraudService)),
    __metadata("design:paramtypes", [MatchmakingService,
        GameService,
        WalletService,
        PrismaService,
        FraudService])
], GameGateway);
export { GameGateway };
