var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var GameCleanupService_1;
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { WalletService } from '../../wallet/wallet.service.js';
let GameCleanupService = GameCleanupService_1 = class GameCleanupService {
    prisma;
    walletService;
    logger = new Logger(GameCleanupService_1.name);
    constructor(prisma, walletService) {
        this.prisma = prisma;
        this.walletService = walletService;
    }
    /**
     * Runs every 60 seconds to clean up expired games
     */
    async handleExpiredGames() {
        try {
            const now = new Date();
            // Find all ACTIVE games that have expired
            const expiredGames = await this.prisma.game.findMany({
                where: {
                    status: 'ACTIVE',
                    expiresAt: {
                        lte: now
                    }
                }
            });
            if (expiredGames.length === 0) {
                return; // No expired games
            }
            this.logger.log(`Found ${expiredGames.length} expired games to clean up`);
            for (const game of expiredGames) {
                try {
                    this.logger.log(`Cleaning up expired game ${game.id} (Mode: ${game.mode})`);
                    // Refund all players
                    const stake = Number(game.stake);
                    for (const playerId of game.players) {
                        if (playerId && playerId.trim() !== '') {
                            try {
                                await this.walletService.rollbackLock(playerId, stake, game.id);
                                this.logger.log(`Refunded ${stake} GHS to player ${playerId} for expired game ${game.id}`);
                            }
                            catch (error) {
                                this.logger.error(`Failed to refund player ${playerId} for game ${game.id}:`, error.message);
                            }
                        }
                    }
                    // Mark game as cancelled by timeout
                    await this.prisma.game.update({
                        where: { id: game.id },
                        data: { status: 'CANCELLED_BY_TIMEOUT' }
                    });
                    this.logger.log(`Game ${game.id} marked as CANCELLED_BY_TIMEOUT`);
                }
                catch (error) {
                    this.logger.error(`Error cleaning up game ${game.id}:`, error.message);
                }
            }
        }
        catch (error) {
            this.logger.error('Error in game cleanup cron:', error.message);
        }
    }
    /**
     * Also clean up very old ACTIVE games that don't have expiresAt set
     * (games created before the schema update)
     */
    async handleOrphanedGames() {
        try {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            const orphanedGames = await this.prisma.game.findMany({
                where: {
                    status: 'ACTIVE',
                    expiresAt: null, // Old games without expiry
                    createdAt: {
                        lte: fiveMinutesAgo
                    }
                }
            });
            if (orphanedGames.length === 0) {
                return;
            }
            this.logger.warn(`Found ${orphanedGames.length} orphaned games (>5min old, no expiry)`);
            for (const game of orphanedGames) {
                try {
                    const stake = Number(game.stake);
                    for (const playerId of game.players) {
                        if (playerId && playerId.trim() !== '') {
                            try {
                                await this.walletService.rollbackLock(playerId, stake, game.id);
                                this.logger.log(`Refunded ${stake} GHS to player ${playerId} for orphaned game ${game.id}`);
                            }
                            catch (error) {
                                this.logger.error(`Failed to refund player ${playerId} for orphaned game ${game.id}:`, error.message);
                            }
                        }
                    }
                    await this.prisma.game.update({
                        where: { id: game.id },
                        data: { status: 'CANCELLED_BY_TIMEOUT' }
                    });
                    this.logger.log(`Orphaned game ${game.id} cleaned up`);
                }
                catch (error) {
                    this.logger.error(`Error cleaning up orphaned game ${game.id}:`, error.message);
                }
            }
        }
        catch (error) {
            this.logger.error('Error in orphaned game cleanup:', error.message);
        }
    }
};
__decorate([
    Cron(CronExpression.EVERY_MINUTE),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GameCleanupService.prototype, "handleExpiredGames", null);
__decorate([
    Cron(CronExpression.EVERY_5_MINUTES),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GameCleanupService.prototype, "handleOrphanedGames", null);
GameCleanupService = GameCleanupService_1 = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [PrismaService,
        WalletService])
], GameCleanupService);
export { GameCleanupService };
