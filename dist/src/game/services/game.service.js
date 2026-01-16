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
import { Injectable } from '@nestjs/common';
import { SpeedMode } from '../modes/SpeedMode.js';
import { TurnMode } from '../modes/TurnMode.js';
import { WalletService } from '../../wallet/wallet.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Redis } from 'ioredis';
import { Inject } from '@nestjs/common';
let GameService = class GameService {
    walletService;
    prisma;
    redis;
    constructor(walletService, prisma, redis) {
        this.walletService = walletService;
        this.prisma = prisma;
        this.redis = redis;
    }
    async onModuleInit() {
        await this.recoverCrashedGames();
    }
    async recoverCrashedGames() {
        // Find games that are stuck in ACTIVE state but server restarted (memory empty)
        // We assume all ACTIVE games in DB are from a previous crash since we just started.
        const crashedGames = await this.prisma.game.findMany({
            where: { status: 'ACTIVE' }
        });
        console.log(`[CrashRecovery] Found ${crashedGames.length} crashed games to refund.`);
        for (const game of crashedGames) {
            console.log(`[CrashRecovery] Refunding Game ${game.id}...`);
            // Only refund players that actually exist
            const validPlayers = game.players.filter(p => p && p.trim() !== '');
            for (const playerId of validPlayers) {
                try {
                    await this.walletService.rollbackLock(playerId, Number(game.stake), game.id);
                    console.log(`[CrashRecovery] Refunded ${game.stake} GHS to player ${playerId}`);
                }
                catch (error) {
                    console.error(`[CrashRecovery] Failed to refund player ${playerId}:`, error.message);
                    // Continue with other players even if one fails
                }
            }
            await this.prisma.game.update({
                where: { id: game.id },
                data: { status: 'CANCELLED_BY_CRASH' }
            });
            console.log(`[CrashRecovery] Game ${game.id} refunded and cancelled.`);
        }
    }
    getGameKey(gameId) {
        return `game:active:${gameId}`;
    }
    async saveGame(gameId, game) {
        const state = {
            modeType: (game.mode instanceof SpeedMode) ? 'speed' : 'turn',
            stake: game.stake,
            players: game.players,
            data: game.mode.serialize()
        };
        await this.redis.set(this.getGameKey(gameId), JSON.stringify(state), 'EX', 3600); // 1 hour expiry
    }
    async loadGame(gameId) {
        const data = await this.redis.get(this.getGameKey(gameId));
        if (!data)
            return null;
        const state = JSON.parse(data);
        let mode;
        if (state.modeType === 'speed') {
            mode = new SpeedMode(state.players);
        }
        else {
            mode = new TurnMode(state.players);
        }
        mode.hydrate(state.data);
        return { mode, stake: state.stake, players: state.players };
    }
    async createGame(gameId, players, mode, stake) {
        console.log(`[CreateGame] Starting creation for game ${gameId} with players ${players.join(', ')}`);
        try {
            console.log(`[CreateGame] Creating DB entry...`);
            await this.prisma.game.create({
                data: { id: gameId, mode, stake, players, status: 'ACTIVE' }
            });
            console.log(`[CreateGame] DB entry created.`);
            let gameMode;
            if (mode === 'speed') {
                gameMode = new SpeedMode(players);
            }
            else {
                gameMode = new TurnMode(players);
            }
            console.log(`[CreateGame] Locking funds...`);
            await this.walletService.lockFundsForMatch(players, stake, gameId);
            console.log(`[CreateGame] Funds locked.`);
            console.log(`[CreateGame] Saving game state to Redis...`);
            await this.saveGame(gameId, { mode: gameMode, stake, players });
            console.log(`[CreateGame] Game saved to Redis. Done.`);
        }
        catch (error) {
            console.error(`[CreateGame] Error: ${error.message}`);
            throw error;
        }
    }
    async getGame(gameId) {
        return this.loadGame(gameId);
    }
    async handleShot(gameId, playerId, angle, power, sideSpin, backSpin) {
        const game = await this.loadGame(gameId);
        if (!game)
            throw new Error('Game not found');
        const result = game.mode.handleShot(playerId, angle, power, sideSpin, backSpin);
        if (game.mode.isFinished()) {
            await this.endGame(gameId);
        }
        else {
            await this.saveGame(gameId, game);
        }
        return result;
    }
    async endGame(gameId) {
        const game = await this.loadGame(gameId);
        if (!game)
            return;
        const winnerId = game.mode.getWinner();
        // 1. ATOMIC STATUS CHANGE (Locking the win on DB level)
        const updateResult = await this.prisma.game.updateMany({
            where: { id: gameId, status: 'ACTIVE' },
            data: { status: 'COMPLETED', winnerId: winnerId || null }
        });
        if (updateResult.count === 0) {
            // Another server node already ended this game
            await this.redis.del(this.getGameKey(gameId));
            return;
        }
        if (winnerId) {
            const totalPot = game.stake * 2;
            const loserIds = game.players.filter(id => id !== winnerId);
            await this.walletService.processPayout(gameId, winnerId, loserIds, totalPot);
        }
        await this.redis.del(this.getGameKey(gameId));
    }
    async checkAllTimeouts() {
        // Distributed Lock to prevent multiple nodes from scanning Redis at same time
        const lockKey = 'game:checkTimeouts:lock';
        const lock = await this.redis.set(lockKey, '1', 'EX', 5, 'NX');
        if (!lock)
            return [];
        const timedOutGames = [];
        const keys = await this.redis.keys('game:active:*');
        for (const key of keys) {
            const gameId = key.replace('game:active:', '');
            const game = await this.loadGame(gameId);
            if (game) {
                game.mode.updateStatus();
                if (game.mode.isFinished()) {
                    await this.endGame(gameId);
                    timedOutGames.push(gameId);
                }
                else {
                    await this.saveGame(gameId, game);
                }
            }
        }
        return timedOutGames;
    }
    async handleDisconnectionBeforeMatch(userId, stake, matchId) {
        if (matchId) {
            await this.walletService.rollbackLock(userId, stake, matchId);
        }
    }
    async removeGame(gameId) {
        await this.redis.del(this.getGameKey(gameId));
    }
};
GameService = __decorate([
    Injectable(),
    __param(2, Inject('REDIS_CLIENT')),
    __metadata("design:paramtypes", [WalletService,
        PrismaService,
        Redis])
], GameService);
export { GameService };
