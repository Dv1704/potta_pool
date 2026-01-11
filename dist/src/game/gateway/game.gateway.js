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
let GameGateway = class GameGateway {
    matchmakingService;
    gameService;
    walletService;
    server;
    lastShotTime = new Map();
    constructor(matchmakingService, gameService, walletService) {
        this.matchmakingService = matchmakingService;
        this.gameService = gameService;
        this.walletService = walletService;
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
        // 1. Insufficient Funds Guard
        const balance = await this.walletService.getBalance(data.userId);
        if (balance.available < data.stake) {
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
            const gameId = uuidv4();
            const playerIds = match.map((p) => p.userId);
            try {
                await this.gameService.createGame(gameId, playerIds, data.mode, data.stake);
                const game = await this.gameService.getGame(gameId);
                match.forEach((p) => {
                    this.server.to(p.socketId).emit('matchFound', {
                        gameId,
                        opponentId: playerIds.find((id) => id !== p.userId),
                        mode: data.mode,
                        stake: data.stake,
                        gameState: game?.mode.getGameState()
                    });
                });
            }
            catch (error) {
                match.forEach((p) => {
                    this.server.to(p.socketId).emit('error', { message: 'Failed to create game: ' + error.message });
                });
            }
        }
        else {
            client.emit('waitingInQueue', { message: 'Searching for opponent...' });
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
    SubscribeMessage('getGameState'),
    __param(0, ConnectedSocket()),
    __param(1, MessageBody()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Socket, Object]),
    __metadata("design:returntype", Promise)
], GameGateway.prototype, "handleGetGameState", null);
GameGateway = __decorate([
    WebSocketGateway({ cors: { origin: '*' } }),
    __metadata("design:paramtypes", [MatchmakingService,
        GameService,
        WalletService])
], GameGateway);
export { GameGateway };
