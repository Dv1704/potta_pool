import { Injectable, OnModuleInit } from '@nestjs/common';
import { GameMode } from '../modes/GameMode.js';
import { SpeedMode } from '../modes/SpeedMode.js';
import { TurnMode } from '../modes/TurnMode.js';
import { WalletService } from '../../wallet/wallet.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Redis } from 'ioredis';
import { Inject } from '@nestjs/common';

@Injectable()
export class GameService implements OnModuleInit {
    constructor(
        private walletService: WalletService,
        private prisma: PrismaService,
        @Inject('REDIS_CLIENT') private readonly redis: Redis
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
            await this.prisma.game.create({
                data: { id: gameId, mode, stake, players, status: 'ACTIVE' }
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

    async handleShot(gameId: string, playerId: string, angle: number, power: number, sideSpin: number, backSpin: number) {
        const game = await this.loadGame(gameId);
        if (!game) throw new Error('Game not found');

        const result = game.mode.handleShot(playerId, angle, power, sideSpin, backSpin);

        if (game.mode.isFinished()) {
            await this.endGame(gameId);
        } else {
            await this.saveGame(gameId, game);
        }

        return result;
    }

    async endGame(gameId: string) {
        const game = await this.loadGame(gameId);
        if (!game) return;

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

    async checkAllTimeouts(): Promise<string[]> {
        // Distributed Lock to prevent multiple nodes from scanning Redis at same time
        const lockKey = 'game:checkTimeouts:lock';
        const lock = await this.redis.set(lockKey, '1', 'EX', 5, 'NX');
        if (!lock) return [];

        const timedOutGames: string[] = [];
        const keys = await this.redis.keys('game:active:*');

        for (const key of keys) {
            const gameId = key.replace('game:active:', '');
            const game = await this.loadGame(gameId);
            if (game) {
                game.mode.updateStatus();
                if (game.mode.isFinished()) {
                    await this.endGame(gameId);
                    timedOutGames.push(gameId);
                } else {
                    await this.saveGame(gameId, game);
                }
            }
        }
        return timedOutGames;
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
