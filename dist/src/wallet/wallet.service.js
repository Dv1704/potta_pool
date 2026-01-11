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
import { Prisma } from '../generated/client/client.js';
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
                    password: crypto.randomBytes(32).toString('hex'),
                    name: 'System Account',
                    referralCode: 'SYSTEM',
                    role: 'ADMIN',
                    wallet: { create: { availableBalance: new Prisma.Decimal(0) } },
                },
                include: { wallet: true },
            });
        }
        else if (!systemUser.wallet) {
            const wallet = await tx.wallet.create({
                data: { userId: systemUser.id, availableBalance: new Prisma.Decimal(0) }
            });
            systemUser.wallet = wallet;
        }
        return systemUser.wallet;
    }
    async getBalance(userId) {
        const wallet = await this.prisma.wallet.findUnique({
            where: { userId },
        });
        if (!wallet)
            throw new NotFoundException('Wallet not found');
        return {
            available: wallet.availableBalance.toNumber(),
            locked: wallet.lockedBalance.toNumber(),
            currency: wallet.currency
        };
    }
    async deposit(userId, amount, currency = 'GHS') {
        const { ghsAmount, rate } = await this.fxService.convertToGHS(amount, currency);
        // Use Decimal for precision check (though ghsAmount is number from FX service, we convert safely)
        const depositAmount = new Prisma.Decimal(ghsAmount);
        if (depositAmount.lessThan(10)) {
            throw new BadRequestException('Minimum deposit is 10 GHS equivalent');
        }
        const tid = crypto.randomUUID();
        return await this.prisma.$transaction(async (tx) => {
            const wallet = await tx.wallet.update({
                where: { userId },
                data: {
                    availableBalance: { increment: depositAmount },
                    version: { increment: 1 },
                },
            });
            const systemWallet = await this.getSystemWallet(tx);
            await tx.ledger.createMany({
                data: [
                    {
                        transactionId: tid,
                        walletId: wallet.id,
                        amount: depositAmount,
                        type: 'DEPOSIT',
                        currency: 'GHS',
                        originalAmount: new Prisma.Decimal(amount),
                        originalCurrency: currency,
                        fxRate: new Prisma.Decimal(rate),
                        description: `Deposit: User received ${ghsAmount} GHS from ${amount} ${currency} `,
                    },
                    {
                        transactionId: tid,
                        walletId: systemWallet.id,
                        amount: depositAmount.negated(),
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
     * Refund System Wallet (Rollback for failed admin withdrawal)
     */
    async refundSystemWithdrawal(amount, reason) {
        if (amount <= 0)
            throw new BadRequestException('Amount must be positive');
        const refundAmount = new Prisma.Decimal(amount);
        const tid = crypto.randomUUID();
        return await this.prisma.$transaction(async (tx) => {
            const systemWallet = await this.getSystemWallet(tx);
            await tx.wallet.update({
                where: { id: systemWallet.id },
                data: {
                    availableBalance: { increment: refundAmount },
                    version: { increment: 1 }
                }
            });
            await tx.ledger.create({
                data: {
                    transactionId: tid,
                    walletId: systemWallet.id,
                    amount: refundAmount,
                    type: 'SYSTEM_REFUND',
                    currency: 'GHS',
                    description: `System Refund: ${reason}`
                }
            });
            return systemWallet;
        });
    }
    // Atomic Lock with Guarded Update
    async lockFundsForMatch(playerIds, amount, matchId) {
        if (amount <= 0)
            throw new BadRequestException('Amount must be positive');
        const lockAmount = new Prisma.Decimal(amount);
        const tid = crypto.randomUUID();
        return await this.prisma.$transaction(async (tx) => {
            for (const userId of playerIds) {
                // GUARDED UPDATE: Only update if availableBalance >= amount
                // This prevents race conditions (Double Spend)
                const result = await tx.wallet.updateMany({
                    where: {
                        userId: userId,
                        availableBalance: { gte: lockAmount }
                    },
                    data: {
                        availableBalance: { decrement: lockAmount },
                        lockedBalance: { increment: lockAmount },
                        version: { increment: 1 },
                    }
                });
                if (result.count === 0) {
                    // Check if user exists to give better error
                    const wallet = await tx.wallet.findUnique({ where: { userId } });
                    if (!wallet)
                        throw new NotFoundException(`Wallet not found for user ${userId}`);
                    throw new BadRequestException(`Insufficient funds for user ${userId}.`);
                }
                // If update succeeded, record ledger
                const wallet = await tx.wallet.findUnique({ where: { userId } });
                if (!wallet)
                    throw new NotFoundException(`Wallet not found for user ${userId}`);
                await tx.ledger.create({
                    data: {
                        transactionId: tid,
                        walletId: wallet.id,
                        amount: lockAmount.negated(),
                        type: 'LOCK',
                        referenceId: matchId,
                        description: `Locked ${amount} GHS for match ${matchId}`,
                    },
                });
            }
        });
    }
    async lockFunds(userId, amount, matchId) {
        return this.lockFundsForMatch([userId], amount, matchId);
    }
    async processPayout(matchId, winnerId, loserIds, totalPot) {
        const COMMISSION_RATE = new Prisma.Decimal(0.1);
        const WINNER_RATE = new Prisma.Decimal(0.9);
        const potDecimal = new Prisma.Decimal(totalPot);
        const commission = potDecimal.mul(COMMISSION_RATE);
        const winnerWinnings = potDecimal.mul(WINNER_RATE);
        const stake = potDecimal.div(loserIds.length + 1);
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
            return { winnerWinnings: winnerWinnings.toNumber(), commission: commission.toNumber() };
        });
    }
    async rollbackLock(userId, amount, matchId) {
        const tid = crypto.randomUUID();
        const rollbackAmount = new Prisma.Decimal(amount);
        return await this.prisma.$transaction(async (tx) => {
            const wallet = await tx.wallet.update({
                where: { userId: userId },
                data: {
                    lockedBalance: { decrement: rollbackAmount },
                    availableBalance: { increment: rollbackAmount },
                    version: { increment: 1 },
                },
            });
            await tx.ledger.create({
                data: {
                    transactionId: tid,
                    walletId: wallet.id,
                    amount: rollbackAmount,
                    type: 'ROLLBACK',
                    referenceId: matchId,
                    description: `Rollback of ${amount} GHS for match ${matchId}`,
                },
            });
            return wallet;
        });
    }
    /**
     * Check withdrawal velocity (Max 3 per 24h)
     */
    async checkWithdrawalVelocity(userId, tx) {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        // Find user wallet id first
        const wallet = await tx.wallet.findUnique({ where: { userId } });
        if (!wallet)
            throw new NotFoundException('Wallet not found');
        const count = await tx.ledger.count({
            where: {
                walletId: wallet.id,
                type: 'WITHDRAWAL',
                createdAt: { gte: oneDayAgo }
            }
        });
        if (count >= 3) {
            throw new BadRequestException('Daily withdrawal limit reached (Max 3)');
        }
    }
    /**
     * Secure System/Admin Withdrawal
     */
    async withdrawSystemFunds(amount) {
        if (amount <= 0)
            throw new BadRequestException('Amount must be positive');
        const withdrawAmount = new Prisma.Decimal(amount);
        const tid = crypto.randomUUID();
        return await this.prisma.$transaction(async (tx) => {
            const systemWallet = await this.getSystemWallet(tx);
            // Atomic check
            if (systemWallet.availableBalance.lessThan(withdrawAmount)) {
                throw new BadRequestException('Insufficient system funds');
            }
            // Update System Wallet
            await tx.wallet.update({
                where: { id: systemWallet.id },
                data: {
                    availableBalance: { decrement: withdrawAmount },
                    version: { increment: 1 }
                }
            });
            // Audit Log
            await tx.ledger.create({
                data: {
                    transactionId: tid,
                    walletId: systemWallet.id,
                    amount: withdrawAmount.negated(),
                    type: 'SYSTEM_WITHDRAWAL',
                    currency: 'GHS',
                    description: `Admin Cashout: ${amount} GHS`
                }
            });
            return systemWallet;
        });
    }
    // Atomic Guarded Withdrawal
    async withdraw(userId, amount, currency = 'GHS', referenceId) {
        if (amount <= 0)
            throw new BadRequestException('Amount must be positive');
        const withdrawAmount = new Prisma.Decimal(amount);
        const tid = crypto.randomUUID();
        return await this.prisma.$transaction(async (tx) => {
            // 1. Check Velocity Limit
            await this.checkWithdrawalVelocity(userId, tx);
            // 2. ATOMIC CHECK & UPDATE
            const result = await tx.wallet.updateMany({
                where: {
                    userId: userId,
                    availableBalance: { gte: withdrawAmount }
                },
                data: {
                    availableBalance: { decrement: withdrawAmount },
                    version: { increment: 1 },
                }
            });
            if (result.count === 0) {
                throw new BadRequestException('Insufficient funds');
            }
            // Fetch updated wallet for Ledger (updateMany doesn't return the record)
            const wallet = await tx.wallet.findUnique({ where: { userId } });
            if (!wallet)
                throw new NotFoundException('Wallet not found');
            const systemWallet = await this.getSystemWallet(tx);
            await tx.ledger.createMany({
                data: [
                    {
                        transactionId: tid,
                        walletId: wallet.id,
                        amount: withdrawAmount.negated(),
                        type: 'WITHDRAWAL',
                        currency: 'GHS',
                        referenceId,
                        description: `Withdrawal of ${amount} GHS`,
                    },
                    {
                        transactionId: tid,
                        walletId: systemWallet.id,
                        amount: withdrawAmount,
                        type: 'WITHDRAWAL_OFFSET',
                        currency: 'GHS',
                        description: `Withdrawal Offset: Paid out ${amount} GHS to User ${userId}`,
                    }
                ]
            });
            return wallet;
        });
    }
    async refundWithdrawal(userId, amount, reason) {
        const tid = crypto.randomUUID();
        const refundAmount = new Prisma.Decimal(amount);
        return await this.prisma.$transaction(async (tx) => {
            const wallet = await tx.wallet.update({
                where: { userId },
                data: {
                    availableBalance: { increment: refundAmount },
                    version: { increment: 1 },
                },
            });
            const systemWallet = await this.getSystemWallet(tx);
            await tx.ledger.createMany({
                data: [
                    {
                        transactionId: tid,
                        walletId: wallet.id,
                        amount: refundAmount,
                        type: 'REFUND',
                        currency: 'GHS',
                        description: `Refund: ${reason}`,
                    },
                    {
                        transactionId: tid,
                        walletId: systemWallet.id,
                        amount: refundAmount.negated(),
                        type: 'REFUND_OFFSET',
                        currency: 'GHS',
                        description: `Refund Offset: Returned ${amount} GHS to User ${userId}`,
                    }
                ]
            });
            return wallet;
        });
    }
    async getHistory(userId, limit = 20) {
        const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
        if (!wallet)
            throw new NotFoundException('Wallet not found');
        const ledger = await this.prisma.ledger.findMany({
            where: { walletId: wallet.id },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        return ledger.map(entry => ({
            id: entry.id,
            type: entry.type,
            amount: entry.amount.toNumber(),
            currency: entry.currency || 'GHS',
            description: entry.description,
            referenceId: entry.referenceId,
            createdAt: entry.createdAt,
        }));
    }
};
WalletService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [PrismaService,
        FXService])
], WalletService);
export { WalletService };
