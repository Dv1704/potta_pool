import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/client/client.js';
import { Transfer2FAService } from './transfer-2fa.service.js';
import * as crypto from 'crypto';

interface DailyLimit {
    amount: number;
    count: number;
    date: string;
}

@Injectable()
export class TransferService {
    private readonly MAX_TRANSFER_AMOUNT = 10000; // GHS
    private readonly DAILY_TRANSFER_LIMIT = 50000; // GHS per day
    private readonly MAX_TRANSFERS_PER_DAY = 20;

    // In-memory cache for daily limits (in production, use Redis)
    private dailyLimits = new Map<string, DailyLimit>();

    constructor(
        private prisma: PrismaService,
        private transfer2FAService: Transfer2FAService
    ) {
        // Clean old daily limits every hour
        setInterval(() => this.cleanOldLimits(), 60 * 60 * 1000);
    }

    async initiateTransfer(senderId: string, recipientIdentifier: string, amount: number) {
        // Security validations
        if (amount <= 0) throw new BadRequestException('Amount must be positive');
        if (amount < 1) throw new BadRequestException('Minimum transfer amount is 1 GHS');
        if (amount > this.MAX_TRANSFER_AMOUNT) {
            throw new BadRequestException(`Maximum transfer amount is ${this.MAX_TRANSFER_AMOUNT.toLocaleString()} GHS. For larger transfers, please contact support.`);
        }

        // Check daily limits
        await this.checkDailyLimits(senderId, amount);

        // Check if 2FA required
        const requires2FA = await this.transfer2FAService.requiresConfirmation(amount);

        if (requires2FA) {
            // Generate and send 2FA code
            const { sessionId } = await this.transfer2FAService.generateAndSendCode(
                senderId,
                amount,
                recipientIdentifier
            );

            return {
                requires2FA: true,
                sessionId,
                message: `A confirmation code has been sent to your email. Please verify to complete the transfer.`
            };
        }

        // Execute transfer immediately (no 2FA needed)
        return await this.executeTransfer(senderId, recipientIdentifier, amount);
    }

    async confirmTransfer(senderId: string, sessionId: string, code: string) {
        // Verify 2FA code
        const { amount, recipient } = await this.transfer2FAService.verifyCode(sessionId, code);

        // Re-check daily limits
        await this.checkDailyLimits(senderId, amount);

        // Execute transfer
        return await this.executeTransfer(senderId, recipient, amount);
    }

    private async checkDailyLimits(userId: string, amount: number) {
        const today = new Date().toISOString().split('T')[0];
        const limit = this.dailyLimits.get(userId);

        if (!limit || limit.date !== today) {
            // Reset for new day
            this.dailyLimits.set(userId, { amount, count: 1, date: today });
            return;
        }

        // Check count limit
        if (limit.count >= this.MAX_TRANSFERS_PER_DAY) {
            throw new BadRequestException(`Daily transfer limit reached. Maximum ${this.MAX_TRANSFERS_PER_DAY} transfers per day.`);
        }

        // Check amount limit
        if (limit.amount + amount > this.DAILY_TRANSFER_LIMIT) {
            const remaining = this.DAILY_TRANSFER_LIMIT - limit.amount;
            throw new BadRequestException(`Daily transfer volume limit exceeded. Remaining: ${remaining.toFixed(2)} GHS`);
        }

        // Update limits
        limit.amount += amount;
        limit.count += 1;
        this.dailyLimits.set(userId, limit);
    }

    private async executeTransfer(senderId: string, recipientIdentifier: string, amount: number) {
        const transferAmount = new Prisma.Decimal(amount);
        const tid = crypto.randomUUID();

        return await this.prisma.$transaction(async (tx) => {
            // Find recipient by email or username/name
            const recipient = await tx.user.findFirst({
                where: {
                    OR: [
                        { email: recipientIdentifier },
                        { name: recipientIdentifier }
                    ]
                },
                include: { wallet: true }
            });

            if (!recipient) {
                throw new NotFoundException('Recipient not found');
            }

            if (recipient.id === senderId) {
                throw new BadRequestException('Cannot transfer to yourself');
            }

            if (!recipient.wallet) {
                throw new NotFoundException('Recipient wallet not found');
            }

            // Deduct from sender (atomic check)
            const senderWallet = await tx.wallet.updateMany({
                where: {
                    userId: senderId,
                    availableBalance: { gte: transferAmount }
                },
                data: {
                    availableBalance: { decrement: transferAmount },
                    version: { increment: 1 }
                }
            });

            if (senderWallet.count === 0) {
                throw new BadRequestException('Insufficient funds');
            }

            // Add to recipient
            await tx.wallet.update({
                where: { userId: recipient.id },
                data: {
                    availableBalance: { increment: transferAmount },
                    version: { increment: 1 }
                }
            });

            // Get updated sender wallet for ledger
            const senderWalletData = await tx.wallet.findUnique({ where: { userId: senderId } });
            if (!senderWalletData) throw new NotFoundException('Sender wallet not found');

            // Record ledger entries
            await tx.ledger.createMany({
                data: [
                    {
                        transactionId: tid,
                        walletId: senderWalletData.id,
                        amount: transferAmount.negated(),
                        type: 'TRANSFER_OUT',
                        currency: 'GHS',
                        description: `Transfer to ${recipient.name || recipient.email}: ${amount} GHS`
                    },
                    {
                        transactionId: tid,
                        walletId: recipient.wallet.id,
                        amount: transferAmount,
                        type: 'TRANSFER_IN',
                        currency: 'GHS',
                        description: `Transfer from sender: ${amount} GHS`
                    }
                ]
            });

            return {
                success: true,
                transactionId: tid,
                recipient: {
                    name: recipient.name || 'Player'
                },
                amount,
                newBalance: senderWalletData.availableBalance.minus(transferAmount).toNumber()
            };
        });
    }

    private cleanOldLimits() {
        const today = new Date().toISOString().split('T')[0];
        for (const [userId, limit] of this.dailyLimits.entries()) {
            if (limit.date !== today) {
                this.dailyLimits.delete(userId);
            }
        }
    }
}
