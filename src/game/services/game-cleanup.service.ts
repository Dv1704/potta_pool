import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { WalletService } from '../../wallet/wallet.service.js';

@Injectable()
export class GameCleanupService {
    private readonly logger = new Logger(GameCleanupService.name);

    constructor(
        private prisma: PrismaService,
        private walletService: WalletService
    ) { }

    /**
     * Runs every 60 seconds to clean up expired games
     */
    @Cron(CronExpression.EVERY_MINUTE)
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
                            } catch (error: any) {
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
                } catch (error: any) {
                    this.logger.error(`Error cleaning up game ${game.id}:`, error.message);
                }
            }
        } catch (error: any) {
            this.logger.error('Error in game cleanup cron:', error.message);
        }
    }

    /**
     * Also clean up very old ACTIVE games that don't have expiresAt set
     * (games created before the schema update)
     */
    @Cron(CronExpression.EVERY_5_MINUTES)
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
                            } catch (error: any) {
                                this.logger.error(`Failed to refund player ${playerId} for orphaned game ${game.id}:`, error.message);
                            }
                        }
                    }

                    await this.prisma.game.update({
                        where: { id: game.id },
                        data: { status: 'CANCELLED_BY_TIMEOUT' }
                    });

                    this.logger.log(`Orphaned game ${game.id} cleaned up`);
                } catch (error: any) {
                    this.logger.error(`Error cleaning up orphaned game ${game.id}:`, error.message);
                }
            }
        } catch (error: any) {
            this.logger.error('Error in orphaned game cleanup:', error.message);
        }
    }
}
