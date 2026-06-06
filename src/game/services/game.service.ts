import { Injectable, OnModuleInit } from '@nestjs/common';
import { GameMode } from '../modes/GameMode.js';
import { SpeedMode } from '../modes/SpeedMode.js';
import { TurnMode } from '../modes/TurnMode.js';
import { WalletService } from '../../wallet/wallet.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Redis } from 'ioredis';
import { Inject } from '@nestjs/common';
import { FraudService } from '../../fraud/fraud.service.js';

@Injectable()
export class GameService implements OnModuleInit {
    constructor(
        @Inject(WalletService) private walletService: WalletService,
        @Inject(PrismaService) private prisma: PrismaService,
        @Inject('REDIS_CLIENT') private readonly redis: Redis,
        @Inject(FraudService) private fraudService: FraudService,
    ) { }

    async onModuleInit() {
        await this.recoverCrashedGames();
    }

    private async recoverCrashedGames() {
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
                } catch (error: any) {
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

    private getGameKey(gameId: string) {
        return `game:active:${gameId}`;
    }

    async saveGame(gameId: string, game: { mode: GameMode, stake: number, players: string[] }) {
        const state = {
            modeType: (game.mode instanceof SpeedMode) ? 'speed' : 'turn',
            stake: game.stake,
            players: game.players,
            data: game.mode.serialize()
        };
        await this.redis.set(this.getGameKey(gameId), JSON.stringify(state), 'EX', 3600); // 1 hour expiry
    }

    async loadGame(gameId: string): Promise<{ mode: GameMode, stake: number, players: string[] } | null> {
        const data = await this.redis.get(this.getGameKey(gameId));
        if (!data) return null;

        const state = JSON.parse(data);
        let mode: GameMode;
        if (state.modeType === 'speed') {
            mode = new SpeedMode(state.players);
        } else {
            mode = new TurnMode(state.players);
        }

        mode.hydrate(state.data);

        return { mode, stake: state.stake, players: state.players };
    }

    async createGame(gameId: string, players: string[], mode: 'speed' | 'turn', stake: number) {
        console.log(`[CreateGame] Starting creation for game ${gameId} with players ${players.join(', ')}`);

        try {
            console.log(`[CreateGame] Creating DB entry...`);

            // Determine if any player was referred by an influencer and attach influencerId
            const playersUsers = await this.prisma.user.findMany({
                where: { id: { in: players } },
                include: { referredBy: true }
            });

            let influencerId: string | null = null;
            for (const u of playersUsers) {
                if (u.referredBy && u.referredBy.role === 'INFLUENCER') {
                    influencerId = u.referredBy.id;
                    break; // attach first influencer found
                }
            }

            await this.prisma.game.create({
                data: { id: gameId, mode, stake, players, status: 'ACTIVE', influencerId: influencerId || null }
            });
            console.log(`[CreateGame] DB entry created.`);

            let gameMode: GameMode;
            if (mode === 'speed') {
                gameMode = new SpeedMode(players);
            } else {
                gameMode = new TurnMode(players);
            }

            console.log(`[CreateGame] Locking funds...`);
            await this.walletService.lockFundsForMatch(players, stake, gameId);
            console.log(`[CreateGame] Funds locked.`);

            console.log(`[CreateGame] Saving game state to Redis...`);
            await this.saveGame(gameId, { mode: gameMode, stake, players });
            console.log(`[CreateGame] Game saved to Redis. Done.`);
        } catch (error: any) {
            console.error(`[CreateGame] Error: ${error.message}`);
            throw error;
        }
    }

    async getGame(gameId: string) {
        return this.loadGame(gameId);
    }

    async handleShot(gameId: string, playerId: string, angle: number, power: number, sideSpin: number, backSpin: number, cueBallX?: number, cueBallY?: number) {
        const game = await this.loadGame(gameId);
        if (!game) throw new Error('Game not found');

        const result = game.mode.handleShot(playerId, angle, power, sideSpin, backSpin, cueBallX, cueBallY);
        const gameState = game.mode.getGameState();
        const isFinished = game.mode.isFinished();
        const winner = game.mode.getWinner();

        if (isFinished) {
            await this.saveGame(gameId, game);
            await this.endGame(gameId);
        } else {
            await this.saveGame(gameId, game);
        }

        return { result, gameState, isFinished, winner };
    }


    async startGame(gameId: string) {
        const game = await this.loadGame(gameId);
        if (!game) throw new Error('Game not found');

        game.mode.startGame();
        await this.saveGame(gameId, game);
        return game.mode.getGameState();
    }

    async endGame(gameId: string) {
        const game = await this.loadGame(gameId);
        if (!game) return;

        const winnerId = game.mode.getWinner();

        if (winnerId) {
            const totalPot = game.stake * 2;
            const loserIds = game.players.filter(id => id !== winnerId);
            
            if (totalPot > 0) {
                // Atomic game completion + payout inside processPayout transaction
                await this.walletService.processPayout(gameId, winnerId, loserIds, totalPot);
            } else {
                // Atomic status change for zero-stake games
                await this.prisma.game.updateMany({
                    where: { id: gameId, status: 'ACTIVE' },
                    data: { status: 'COMPLETED', winnerId }
                });
            }
        } else {
            // No winner - update status directly
            await this.prisma.game.updateMany({
                where: { id: gameId, status: 'ACTIVE' },
                data: { status: 'COMPLETED', winnerId: null }
            });
        }

        // Run game payout fraud check
        try {
            await this.fraudService.checkGamePayoutFraud(gameId);
        } catch (err) {
            // Suppress errors to avoid blocking the core game resolution
        }

        await this.redis.del(this.getGameKey(gameId));
    }

    async checkAllTimeouts(): Promise<{
        endedGames: { gameId: string; winnerId: string | null; gameState: any }[];
        updatedGames: { gameId: string; gameState: any }[];
    }> {
        // Distributed Lock to prevent multiple nodes from scanning Redis at same time
        const lockKey = 'game:checkTimeouts:lock';
        const lock = await this.redis.set(lockKey, '1', 'EX', 2, 'NX');
        if (!lock) return { endedGames: [], updatedGames: [] };

        const endedGames: { gameId: string; winnerId: string | null; gameState: any }[] = [];
        const updatedGames: { gameId: string; gameState: any }[] = [];
        const keys = await this.redis.keys('game:active:*');

        for (const key of keys) {
            const gameId = key.replace('game:active:', '');
            const game = await this.loadGame(gameId);
            if (game) {
                const hadChanges = game.mode.updateStatus();
                if (game.mode.isFinished()) {
                    const gameState = game.mode.getGameState();
                    const winnerId = game.mode.getWinner();
                    await this.saveGame(gameId, game);
                    await this.endGame(gameId);
                    endedGames.push({ gameId, winnerId, gameState });
                } else if (hadChanges) {
                    const gameState = game.mode.getGameState();
                    await this.saveGame(gameId, game);
                    updatedGames.push({ gameId, gameState });
                }
            }
        }
        return { endedGames, updatedGames };
    }

    async handleDisconnectionBeforeMatch(userId: string, stake: number, matchId?: string) {
        if (matchId) {
            await this.walletService.rollbackLock(userId, stake, matchId);
        }
    }

    async removeGame(gameId: string) {
        await this.redis.del(this.getGameKey(gameId));
    }
}
