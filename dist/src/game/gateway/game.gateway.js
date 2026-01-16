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
import { PrismaService } from '../../prisma/prisma.service.js';
let GameGateway = class GameGateway {
    matchmakingService;
    gameService;
    walletService;
    prisma;
    server;
    lastShotTime = new Map();
    constructor(matchmakingService, gameService, walletService, prisma) {
        this.matchmakingService = matchmakingService;
        this.gameService = gameService;
        this.walletService = walletService;
        this.prisma = prisma;
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
    handleConnection(client) {
        console.log(`Client connected: ${client.id}`);
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
                try {
                    await this.gameService.createGame(gameId, playerIds, data.mode, data.stake);
                    const game = await this.gameService.getGame(gameId);
                    // Fetch opponent names from database
                    for (const p of match) {
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
        // 2. Input Throttling
        const lastShot = this.lastShotTime.get(data.userId) || 0;
        const now = Date.now();
        if (now - lastShot < 1000) { // 1 second throttle
            // client.emit('error', { message: 'Shooting too fast' }); // Optional: don't spam error
            return;
        }
        this.lastShotTime.set(data.userId, now);
        try {
            const result = await this.gameService.handleShot(data.gameId, data.userId, data.angle, data.power, data.sideSpin || 0, data.backSpin || 0);
            const game = await this.gameService.getGame(data.gameId);
            if (game) {
                this.server.to(data.gameId).emit('shotResult', {
                    shotResult: result,
                    gameState: game.mode.getGameState()
                });
            }
        }
        catch (error) {
            client.emit('error', { message: error.message });
        }
    }
    handleJoinGame(client, data) {
        client.join(data.gameId);
    }
    async handleLeaveQueue(data) {
        await this.matchmakingService.removeFromQueue(data.userId);
    }
    async handleGetGameState(client, data) {
        const game = await this.gameService.getGame(data.gameId);
        if (game) {
            const state = game.mode.getGameState();
            client.emit('gameState', state);
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
    __metadata("design:paramtypes", [MatchmakingService,
        GameService,
        WalletService,
        PrismaService])
], GameGateway);
export { GameGateway };
