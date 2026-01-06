import { Injectable } from '@nestjs/common';
import { GameMode } from '../modes/GameMode';
import { SpeedMode } from '../modes/SpeedMode';
import { TurnMode } from '../modes/TurnMode';
import { WalletService } from '../../wallet/wallet.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GameService {
    private activeGames: Map<string, { mode: GameMode, stake: number, players: string[] }> = new Map();

    constructor(
        private walletService: WalletService,
        private prisma: PrismaService
    ) { }

    async createGame(gameId: string, players: string[], mode: 'speed' | 'turn', stake: number) {
        let gameMode: GameMode;
        if (mode === 'speed') {
            gameMode = new SpeedMode(players);
        } else {
            gameMode = new TurnMode(players);
        }

        // Lock funds for both players atomically
        await this.walletService.lockFundsForMatch(players, stake, gameId);

        this.activeGames.set(gameId, { mode: gameMode, stake, players });
    }

    getGame(gameId: string) {
        return this.activeGames.get(gameId);
    }

    async handleShot(gameId: string, playerId: string, angle: number, power: number, sideSpin: number, backSpin: number) {
        const game = this.activeGames.get(gameId);
        if (!game) throw new Error('Game not found');

        const result = game.mode.handleShot(playerId, angle, power, sideSpin, backSpin);

        if (game.mode.isFinished()) {
            await this.endGame(gameId);
        }

        return result;
    }

    async endGame(gameId: string) {
        const game = this.activeGames.get(gameId);
        if (!game) return;

        const winnerId = game.mode.getWinner();
        if (winnerId) {
            const totalPot = game.stake * 2;
            const loserIds = game.players.filter(id => id !== winnerId);

            await this.walletService.processPayout(gameId, winnerId, loserIds, totalPot);

            console.log(`Game ${gameId} ended. Winner: ${winnerId}, Total Pot: ${totalPot}`);
        }

        this.activeGames.delete(gameId);
    }

    async checkAllTimeouts(): Promise<string[]> {
        const timedOutGames: string[] = [];
        for (const [gameId, game] of this.activeGames.entries()) {
            game.mode.updateStatus();
            if (game.mode.isFinished()) {
                await this.endGame(gameId);
                timedOutGames.push(gameId);
            }
        }
        return timedOutGames;
    }

    async handleDisconnectionBeforeMatch(userId: string, stake: number, matchId?: string) {
        if (matchId) {
            await this.walletService.rollbackLock(userId, stake, matchId);
        }
    }

    removeGame(gameId: string) {
        this.activeGames.delete(gameId);
    }
}
