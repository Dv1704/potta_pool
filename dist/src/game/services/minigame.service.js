var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { WalletService } from '../../wallet/wallet.service.js';
import { randomUUID } from 'crypto';
import { Prisma } from '../../generated/client/client.js';
let MiniGameService = class MiniGameService {
    prisma;
    walletService;
    constructor(prisma, walletService) {
        this.prisma = prisma;
        this.walletService = walletService;
    }
    // --- Dice Game ---
    async playDice(userId, stake) {
        if (stake < 10)
            throw new BadRequestException('Minimum stake is 10 GHS');
        const balance = await this.walletService.getBalance(userId);
        if (balance.available < stake)
            throw new BadRequestException('Insufficient funds');
        let gameId = null;
        try {
            gameId = randomUUID();
            await this.prisma.game.create({
                data: {
                    id: gameId,
                    mode: 'speed',
                    stake: stake,
                    players: [userId],
                    status: 'ACTIVE'
                }
            });
            await this.walletService.lockFundsForMatch([userId], stake, gameId);
            const userRoll = Math.floor(Math.random() * 6) + 1;
            const systemRoll = Math.floor(Math.random() * 6) + 1;
            const won = userRoll > systemRoll;
            const multiplier = 1.95;
            const payout = won ? stake * multiplier : 0;
            await this.prisma.$transaction(async (tx) => {
                try {
                    await this.handleInstantGameSettlement(userId, gameId, stake, payout, tx);
                    await tx.game.update({
                        where: { id: gameId },
                        data: { status: 'COMPLETED', winnerId: won ? userId : null }
                    });
                }
                catch (txError) {
                    console.error(`[MiniGame Tx Error] Game: ${gameId}, Error:`, txError.message);
                    throw txError;
                }
            });
            return { won, userRoll, systemRoll, payout };
        }
        catch (error) {
            await this.rollbackGame(userId, stake, gameId);
            throw error;
        }
    }
    // --- Coin Flip ---
    async playCoin(userId, stake, choice) {
        if (stake < 10)
            throw new BadRequestException('Minimum stake is 10 GHS');
        const balance = await this.walletService.getBalance(userId);
        if (balance.available < stake)
            throw new BadRequestException('Insufficient funds');
        let gameId = null;
        try {
            gameId = randomUUID();
            await this.prisma.game.create({
                data: {
                    id: gameId,
                    mode: 'speed',
                    stake: stake,
                    players: [userId],
                    status: 'ACTIVE'
                }
            });
            await this.walletService.lockFundsForMatch([userId], stake, gameId);
            const result = Math.random() > 0.5 ? 'heads' : 'tails';
            const won = choice === result;
            const multiplier = 1.95;
            const payout = won ? stake * multiplier : 0;
            await this.prisma.$transaction(async (tx) => {
                try {
                    await this.handleInstantGameSettlement(userId, gameId, stake, payout, tx);
                    await tx.game.update({
                        where: { id: gameId },
                        data: { status: 'COMPLETED', winnerId: won ? userId : null }
                    });
                }
                catch (txError) {
                    console.error(`[MiniGame Tx Error] Game: ${gameId}, Error:`, txError.message);
                    throw txError;
                }
            });
            return { won, choice, result, payout };
        }
        catch (error) {
            await this.rollbackGame(userId, stake, gameId);
            throw error;
        }
    }
    // --- Number Rush (1-10) ---
    async playNumber(userId, stake, guess) {
        if (stake < 10)
            throw new BadRequestException('Minimum stake is 10 GHS');
        if (guess < 1 || guess > 10)
            throw new BadRequestException('Guess must be between 1 and 10');
        const balance = await this.walletService.getBalance(userId);
        if (balance.available < stake)
            throw new BadRequestException('Insufficient funds');
        let gameId = null;
        try {
            gameId = randomUUID();
            await this.prisma.game.create({
                data: { id: gameId, mode: 'speed', stake, players: [userId], status: 'ACTIVE' }
            });
            await this.walletService.lockFundsForMatch([userId], stake, gameId);
            const result = Math.floor(Math.random() * 10) + 1;
            const won = guess === result;
            const multiplier = 9.5;
            const payout = won ? stake * multiplier : 0;
            await this.prisma.$transaction(async (tx) => {
                try {
                    await this.handleInstantGameSettlement(userId, gameId, stake, payout, tx);
                    await tx.game.update({
                        where: { id: gameId },
                        data: { status: 'COMPLETED', winnerId: won ? userId : null }
                    });
                }
                catch (txError) {
                    console.error(`[MiniGame Tx Error] Game: ${gameId}, Error:`, txError.message);
                    throw txError;
                }
            });
            return { won, guess, result, payout };
        }
        catch (error) {
            await this.rollbackGame(userId, stake, gameId);
            throw error;
        }
    }
    // --- Lucky Wheel (Colors) ---
    async playWheel(userId, stake, choice) {
        const colors = ['red', 'blue', 'green', 'yellow'];
        if (!colors.includes(choice))
            throw new BadRequestException('Invalid color choice');
        if (stake < 10)
            throw new BadRequestException('Minimum stake is 10 GHS');
        const balance = await this.walletService.getBalance(userId);
        if (balance.available < stake)
            throw new BadRequestException('Insufficient funds');
        let gameId = null;
        try {
            gameId = randomUUID();
            await this.prisma.game.create({
                data: { id: gameId, mode: 'speed', stake, players: [userId], status: 'ACTIVE' }
            });
            await this.walletService.lockFundsForMatch([userId], stake, gameId);
            const result = colors[Math.floor(Math.random() * colors.length)];
            const won = choice === result;
            const multiplier = 3.5;
            const payout = won ? stake * multiplier : 0;
            await this.prisma.$transaction(async (tx) => {
                try {
                    await this.handleInstantGameSettlement(userId, gameId, stake, payout, tx);
                    await tx.game.update({
                        where: { id: gameId },
                        data: { status: 'COMPLETED', winnerId: won ? userId : null }
                    });
                }
                catch (txError) {
                    console.error(`[MiniGame Tx Error] Game: ${gameId}, Error:`, txError.message);
                    throw txError;
                }
            });
            return { won, choice, result, payout };
        }
        catch (error) {
            await this.rollbackGame(userId, stake, gameId);
            throw error;
        }
    }
    // --- Card Flip (High/Low) ---
    async playCard(userId, stake) {
        if (stake < 10)
            throw new BadRequestException('Minimum stake is 10 GHS');
        const balance = await this.walletService.getBalance(userId);
        if (balance.available < stake)
            throw new BadRequestException('Insufficient funds');
        const cards = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        let gameId = null;
        try {
            gameId = randomUUID();
            await this.prisma.game.create({
                data: { id: gameId, mode: 'speed', stake, players: [userId], status: 'ACTIVE' }
            });
            await this.walletService.lockFundsForMatch([userId], stake, gameId);
            const userCard = cards[Math.floor(Math.random() * cards.length)];
            const systemCard = cards[Math.floor(Math.random() * cards.length)];
            const won = cards.indexOf(userCard) > cards.indexOf(systemCard);
            const multiplier = 1.95;
            const payout = won ? stake * multiplier : 0;
            await this.prisma.$transaction(async (tx) => {
                try {
                    await this.handleInstantGameSettlement(userId, gameId, stake, payout, tx);
                    await tx.game.update({
                        where: { id: gameId },
                        data: { status: 'COMPLETED', winnerId: won ? userId : null }
                    });
                }
                catch (txError) {
                    console.error(`[MiniGame Tx Error] Game: ${gameId}, Error:`, txError.message);
                    throw txError;
                }
            });
            return { won, userCard, systemCard, payout };
        }
        catch (error) {
            await this.rollbackGame(userId, stake, gameId);
            throw error;
        }
    }
    // --- Color Match (3 Slots) ---
    async playColor(userId, stake) {
        if (stake < 10)
            throw new BadRequestException('Minimum stake is 10 GHS');
        const balance = await this.walletService.getBalance(userId);
        if (balance.available < stake)
            throw new BadRequestException('Insufficient funds');
        const colors = ['red', 'blue', 'green'];
        let gameId = null;
        try {
            gameId = randomUUID();
            await this.prisma.game.create({
                data: { id: gameId, mode: 'speed', stake, players: [userId], status: 'ACTIVE' }
            });
            await this.walletService.lockFundsForMatch([userId], stake, gameId);
            const result = [
                colors[Math.floor(Math.random() * colors.length)],
                colors[Math.floor(Math.random() * colors.length)],
                colors[Math.floor(Math.random() * colors.length)]
            ];
            const won = result[0] === result[1] && result[1] === result[2];
            const multiplier = 5.0;
            const payout = won ? stake * multiplier : 0;
            await this.prisma.$transaction(async (tx) => {
                try {
                    await this.handleInstantGameSettlement(userId, gameId, stake, payout, tx);
                    await tx.game.update({
                        where: { id: gameId },
                        data: { status: 'COMPLETED', winnerId: won ? userId : null }
                    });
                }
                catch (txError) {
                    console.error(`[MiniGame Tx Error] Game: ${gameId}, Error:`, txError.message);
                    throw txError;
                }
            });
            return { won, colors: result, payout };
        }
        catch (error) {
            await this.rollbackGame(userId, stake, gameId);
            throw error;
        }
    }
    // --- Pool Master (High/Low balls) ---
    async playPool(userId, stake) {
        if (stake < 10)
            throw new BadRequestException('Minimum stake is 10 GHS');
        const balance = await this.walletService.getBalance(userId);
        if (balance.available < stake)
            throw new BadRequestException('Insufficient funds');
        let gameId = null;
        try {
            gameId = randomUUID();
            await this.prisma.game.create({
                data: { id: gameId, mode: 'speed', stake, players: [userId], status: 'ACTIVE' }
            });
            await this.walletService.lockFundsForMatch([userId], stake, gameId);
            const userBalls = Math.floor(Math.random() * 8) + 1;
            const opponentBalls = Math.floor(Math.random() * 8) + 1;
            const won = userBalls > opponentBalls;
            const multiplier = 1.85;
            const payout = won ? stake * multiplier : 0;
            await this.prisma.$transaction(async (tx) => {
                try {
                    await this.handleInstantGameSettlement(userId, gameId, stake, payout, tx);
                    await tx.game.update({
                        where: { id: gameId },
                        data: { status: 'COMPLETED', winnerId: won ? userId : null }
                    });
                }
                catch (txError) {
                    console.error(`[MiniGame Tx Error] Game: ${gameId}, Error:`, txError.message);
                    throw txError;
                }
            });
            return { won, userBalls, opponentBalls, payout };
        }
        catch (error) {
            await this.rollbackGame(userId, stake, gameId);
            throw error;
        }
    }
    // --- Aviator (Crash) ---
    async placeAviatorBet(userId, stake) {
        if (stake < 1)
            throw new BadRequestException('Minimum stake is 1');
        const balance = await this.walletService.getBalance(userId);
        if (balance.available < stake)
            throw new BadRequestException('Insufficient funds');
        let gameId = null;
        try {
            const r = Math.random();
            const crashPoint = Math.floor(100 / (1 - r)) / 100;
            const finalCrash = Math.min(Math.max(1.00, crashPoint), 1000.00);
            gameId = randomUUID();
            const startTime = Date.now();
            const expiresAt = new Date(startTime + 60000);
            await this.prisma.game.create({
                data: {
                    id: gameId,
                    mode: 'speed',
                    stake,
                    players: [userId],
                    status: 'ACTIVE',
                    crashPoint: finalCrash,
                    expiresAt
                }
            });
            await this.walletService.lockFundsForMatch([userId], stake, gameId);
            this.activeCrashGames.set(gameId, { crashPoint: finalCrash, userId, stake, startTime });
            return { gameId, stake, startTime };
        }
        catch (error) {
            await this.rollbackGame(userId, stake, gameId);
            throw error;
        }
    }
    async cashOutAviator(userId, gameId, stoppedAtMultiplier) {
        try {
            const game = await this.prisma.game.findUnique({ where: { id: gameId } });
            if (!game)
                throw new NotFoundException('Game not found');
            if (game.status !== 'ACTIVE')
                throw new BadRequestException('Game is not active');
            const crashPoint = Number(game.crashPoint);
            const stake = Number(game.stake);
            const won = stoppedAtMultiplier <= crashPoint;
            const payout = won ? stake * stoppedAtMultiplier : 0;
            await this.prisma.$transaction(async (tx) => {
                await this.handleInstantGameSettlement(userId, gameId, stake, payout, tx);
                await tx.game.update({
                    where: { id: gameId },
                    data: { status: 'COMPLETED', winnerId: won ? userId : undefined }
                });
            });
            this.activeCrashGames.delete(gameId);
            return { won, payout, crashPoint, stoppedAt: stoppedAtMultiplier };
        }
        catch (error) {
            console.error(`[Aviator] Error cashing out game ${gameId}:`, error.message);
            throw error;
        }
    }
    // --- Helpers ---
    async rollbackGame(userId, stake, gameId) {
        if (!gameId)
            return;
        try {
            await this.walletService.rollbackLock(userId, stake, gameId);
            await this.prisma.game.updateMany({
                where: { id: gameId },
                data: { status: 'CANCELLED_BY_ERROR' }
            });
        }
        catch (e) {
            console.error(`Rollback failed for ${gameId}:`, e.message);
        }
    }
    async handleInstantGameSettlement(userId, gameId, stake, payout, tx) {
        const stakeDecimal = new Prisma.Decimal(stake);
        const payoutDecimal = new Prisma.Decimal(payout);
        const wallet = await tx.wallet.findUnique({ where: { userId } });
        await tx.wallet.update({
            where: { userId },
            data: {
                lockedBalance: { decrement: stakeDecimal },
                availableBalance: { increment: payoutDecimal }
            }
        });
        if (payout > 0) {
            await tx.ledger.create({
                data: {
                    id: randomUUID(),
                    walletId: wallet.id,
                    type: 'PAYOUT',
                    amount: payout,
                    referenceId: gameId,
                    description: `Win from Game ${gameId}`
                }
            });
        }
    }
    activeCrashGames = new Map();
};
MiniGameService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [PrismaService,
        WalletService])
], MiniGameService);
export { MiniGameService };
