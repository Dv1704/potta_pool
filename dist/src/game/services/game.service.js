var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable } from '@nestjs/common';
import { SpeedMode } from '../modes/SpeedMode';
import { TurnMode } from '../modes/TurnMode';
import { WalletService } from '../../wallet/wallet.service';
import { PrismaService } from '../../prisma/prisma.service';
let GameService = class GameService {
    walletService;
    prisma;
    activeGames = new Map();
    constructor(walletService, prisma) {
        this.walletService = walletService;
        this.prisma = prisma;
    }
    async createGame(gameId, players, mode, stake) {
        let gameMode;
        if (mode === 'speed') {
            gameMode = new SpeedMode(players);
        }
        else {
            gameMode = new TurnMode(players);
        }
        // Lock funds for both players atomically
        await this.walletService.lockFundsForMatch(players, stake, gameId);
        this.activeGames.set(gameId, { mode: gameMode, stake, players });
    }
    getGame(gameId) {
        return this.activeGames.get(gameId);
    }
    async handleShot(gameId, playerId, angle, power, sideSpin, backSpin) {
        const game = this.activeGames.get(gameId);
        if (!game)
            throw new Error('Game not found');
        const result = game.mode.handleShot(playerId, angle, power, sideSpin, backSpin);
        if (game.mode.isFinished()) {
            await this.endGame(gameId);
        }
        return result;
    }
    async endGame(gameId) {
        const game = this.activeGames.get(gameId);
        if (!game)
            return;
        const winnerId = game.mode.getWinner();
        if (winnerId) {
            const totalPot = game.stake * 2;
            const loserIds = game.players.filter(id => id !== winnerId);
            await this.walletService.processPayout(gameId, winnerId, loserIds, totalPot);
            console.log(`Game ${gameId} ended. Winner: ${winnerId}, Total Pot: ${totalPot}`);
        }
        this.activeGames.delete(gameId);
    }
    async checkAllTimeouts() {
        const timedOutGames = [];
        for (const [gameId, game] of this.activeGames.entries()) {
            game.mode.updateStatus();
            if (game.mode.isFinished()) {
                await this.endGame(gameId);
                timedOutGames.push(gameId);
            }
        }
        return timedOutGames;
    }
    async handleDisconnectionBeforeMatch(userId, stake, matchId) {
        if (matchId) {
            await this.walletService.rollbackLock(userId, stake, matchId);
        }
    }
    removeGame(gameId) {
        this.activeGames.delete(gameId);
    }
};
GameService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [WalletService,
        PrismaService])
], GameService);
export { GameService };
