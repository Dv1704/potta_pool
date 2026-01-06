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
import { PrismaService } from '../prisma/prisma.service.js';
import { FXService } from './fx.service.js';
import * as crypto from 'crypto';
const SYSTEM_EMAIL = 'system@pottagame.com';
let WalletService = class WalletService {
    prisma;
    fxService;
    constructor(prisma, fxService) {
        this.prisma = prisma;
        this.fxService = fxService;
    }
    async getSystemWallet(tx) {
        let systemUser = await tx.user.findUnique({
            where: { email: SYSTEM_EMAIL },
            include: { wallet: true },
        });
        if (!systemUser) {
            systemUser = await tx.user.create({
                data: {
                    email: SYSTEM_EMAIL,
                    password: crypto.randomBytes(32).toString('hex'), // Not used
                    name: 'System Account',
                    role: 'ADMIN',
                    wallet: { create: { availableBalance: 0 } },
                },
                include: { wallet: true },
            });
        }
        else if (!systemUser.wallet) {
            const wallet = await tx.wallet.create({
                data: { userId: systemUser.id, availableBalance: 0 }
            });
            systemUser.wallet = wallet;
        }
        return systemUser.wallet;
    }
    /**
     * Get user balance
     */
    async getBalance(userId) {
        const wallet = await this.prisma.wallet.findUnique({
            where: { userId },
        });
        if (!wallet)
            throw new NotFoundException('Wallet not found');
        return { available: wallet.availableBalance, locked: wallet.lockedBalance, currency: wallet.currency };
    }
    /**
     * Deposit funds with FX conversion and min limit.
     */
    async deposit(userId, amount, currency = 'GHS') {
        const { ghsAmount, rate } = await this.fxService.convertToGHS(amount, currency);
        if (ghsAmount < 10) {
            throw new BadRequestException('Minimum deposit is 10 GHS equivalent');
        }
        const tid = crypto.randomUUID();
        return await this.prisma.$transaction(async (tx) => {
            const wallet = await tx.wallet.update({
                where: { userId },
                data: {
                    availableBalance: { increment: ghsAmount },
                    version: { increment: 1 },
                },
            });
            const systemWallet = await this.getSystemWallet(tx);
            // Double Entry: 
            // 1. Credit User Wallet (increase liability)
            // 2. Debit System Offset (track incoming cash)
            await tx.ledger.createMany({
                data: [
                    {
                        transactionId: tid,
                        walletId: wallet.id,
                        amount: ghsAmount,
                        type: 'DEPOSIT',
                        currency: 'GHS',
                        originalAmount: amount,
                        originalCurrency: currency,
                        fxRate: rate,
                        description: `Deposit: User received ${ghsAmount} GHS from ${amount} ${currency} `,
                    },
                    {
                        transactionId: tid,
                        walletId: systemWallet.id,
                        amount: -ghsAmount,
                        type: 'DEPOSIT_OFFSET',
                        currency: 'GHS',
                        description: `Deposit Offset: Received ${ghsAmount} GHS for User ${userId}`,
                    }
                ]
            });
            return wallet;
        });
    }
    /**
     * Lock funds for multiple players atomically at the start of a match.
     */
    async lockFundsForMatch(playerIds, amount, matchId) {
        if (amount <= 0)
            throw new BadRequestException('Amount must be positive');
        const tid = crypto.randomUUID();
        return await this.prisma.$transaction(async (tx) => {
            for (const userId of playerIds) {
                const wallet = await tx.wallet.findUnique({ where: { userId } });
                if (!wallet)
                    throw new NotFoundException(`Wallet not found for user ${userId}`);
                if (wallet.availableBalance < amount) {
                    throw new BadRequestException(`Insufficient funds for user ${userId}. Available: ${wallet.availableBalance}`);
                }
                await tx.wallet.update({
                    where: { userId },
                    data: {
                        availableBalance: { decrement: amount },
                        lockedBalance: { increment: amount },
                        version: { increment: 1 },
                    },
                });
                await tx.ledger.create({
                    data: {
                        transactionId: tid,
                        walletId: wallet.id,
                        amount: -amount,
                        type: 'LOCK',
                        referenceId: matchId,
                        description: `Locked ${amount} GHS for match ${matchId}`,
                    },
                });
            }
        });
    }
    /**
     * Lock funds for a single player (legacy/retained for individual locks if needed).
     */
    async lockFunds(userId, amount, matchId) {
        return this.lockFundsForMatch([userId], amount, matchId);
    }
    /**
     * Process Payout for a match
     */
    async processPayout(matchId, winnerId, loserIds, totalPot) {
        const COMMISSION_RATE = 0.1;
        const WINNER_RATE = 0.9;
        const commission = totalPot * COMMISSION_RATE;
        const winnerWinnings = totalPot * WINNER_RATE;
        const stake = totalPot / (loserIds.length + 1);
        const tid = crypto.randomUUID();
        return await this.prisma.$transaction(async (tx) => {
            // Unlock losers
            for (const loserId of loserIds) {
                await tx.wallet.update({
                    where: { userId: loserId },
                    data: {
                        lockedBalance: { decrement: stake },
                        version: { increment: 1 },
                    },
                });
                // Optional: add debit ledger for stake being removed/lost
            }
            // Winner: Unlock stake and add net winnings
            const winnerWallet = await tx.wallet.update({
                where: { userId: winnerId },
                data: {
                    lockedBalance: { decrement: stake },
                    availableBalance: { increment: winnerWinnings },
                    version: { increment: 1 },
                },
            });
            const systemWallet = await this.getSystemWallet(tx);
            // Commission to System
            await tx.wallet.update({
                where: { id: systemWallet.id },
                data: {
                    availableBalance: { increment: commission },
                    version: { increment: 1 },
                },
            });
            // Double Entry Ledgers
            await tx.ledger.createMany({
                data: [
                    {
                        transactionId: tid,
                        walletId: winnerWallet.id,
                        amount: winnerWinnings,
                        type: 'PAYOUT',
                        referenceId: matchId,
                        description: `Won ${winnerWinnings} GHS in match ${matchId} `,
                    },
                    {
                        transactionId: tid,
                        walletId: systemWallet.id,
                        amount: commission,
                        type: 'COMMISSION',
                        referenceId: matchId,
                        description: `Commission ${commission} GHS from match ${matchId} `,
                    }
                ]
            });
            return { winnerWinnings, commission };
        });
    }
    /**
     * Revert lock
     */
    async rollbackLock(userId, amount, matchId) {
        const tid = crypto.randomUUID();
        return await this.prisma.$transaction(async (tx) => {
            const wallet = await tx.wallet.update({
                where: { userId },
                data: {
                    lockedBalance: { decrement: amount },
                    availableBalance: { increment: amount },
                    version: { increment: 1 },
                },
            });
            await tx.ledger.create({
                data: {
                    transactionId: tid,
                    walletId: wallet.id,
                    amount: amount,
                    type: 'ROLLBACK',
                    referenceId: matchId,
                    description: `Rollback of ${amount} GHS for match ${matchId}`,
                },
            });
            return wallet;
        });
    }
};
WalletService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [PrismaService,
        FXService])
], WalletService);
export { WalletService };
