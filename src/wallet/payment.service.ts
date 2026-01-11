import { Injectable, Logger, UnauthorizedException, BadRequestException, InternalServerErrorException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletService } from './wallet.service.js';
import { FXService } from './fx.service.js';
import { AdminService } from '../admin/admin.service.js';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class PaymentService {
    private readonly logger = new Logger(PaymentService.name);
    private readonly PAYSTACK_SECRET: string;

    constructor(
        private prisma: PrismaService,
        private configService: ConfigService,
        private walletService: WalletService,
        private fxService: FXService,
        @Inject(forwardRef(() => AdminService))
        private adminService: AdminService,
    ) {
        this.PAYSTACK_SECRET = this.configService.get<string>('PAYSTACK_SECRET_KEY') || 'secretKey';
    }

    /**
     * Initialize a Paystack transaction
     */
    async initializeDeposit(userId: string, email: string, amount: number, currency: string, callbackUrl?: string) {
        // We always convert to GHS for internal balance, but we can charge in USD/GHS via Paystack
        // Paystack amount is in kobo/pesewas (x100)
        if (amount <= 0) throw new BadRequestException('Amount must be positive');

        try {
            const response = await axios.post(
                'https://api.paystack.co/transaction/initialize',
                {
                    email,
                    amount: Math.round(amount * 100),
                    currency: currency.toUpperCase(),
                    metadata: { userId, internalCurrency: currency },
                    callback_url: callbackUrl,
                },
                {
                    headers: {
                        Authorization: `Bearer ${this.PAYSTACK_SECRET}`,
                        'Content-Type': 'application/json',
                    },
                },
            );

            return response.data.data; // Includes authorization_url and reference
        } catch (error: any) {
            this.logger.error(`Paystack init error: ${error.response?.data?.message || error.message}`);
            throw new BadRequestException('Failed to initialize payment');
        }
    }

    /**
     * Verify Paystack Transaction (Manual Verification)
     */
    async verifyTransaction(reference: string, userId: string) {
        // 1. Check if already processed
        const existing = await this.prisma.processedWebhook.findUnique({
            where: { providerReference: reference },
        });

        if (existing) {
            const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
            return {
                status: 'already_processed',
                message: 'Transaction already processed',
                newBalance: wallet?.availableBalance.toNumber()
            };
        }

        try {
            // 2. Query Paystack API
            const response = await axios.get(
                `https://api.paystack.co/transaction/verify/${reference}`,
                {
                    headers: { Authorization: `Bearer ${this.PAYSTACK_SECRET}` },
                }
            );

            const data = response.data.data;

            if (data.status !== 'success') {
                throw new BadRequestException(`Transaction status: ${data.status}`);
            }

            // 3. Validate Amount and User
            // Note: Paystack returns amount in kobo/pesewas
            const amount = data.amount / 100;
            const txUserId = data.metadata?.userId;
            const currency = data.currency;

            if (txUserId && txUserId !== userId) {
                // Security check: Ensure the user verifying is the one who initiated (if metadata allows)
                // Or simply trust metadata userId. Here we verify logged in user matches metadata.
                const user = await this.prisma.user.findUnique({ where: { id: userId } });
                // Note: If admin is verifying, we might skip this. But this is user-initiated.
                // Strict check:
                if (txUserId !== userId) {
                    this.logger.warn(`User ${userId} attempted to verify transaction belonging to ${txUserId}`);
                    throw new BadRequestException('Transaction does not belong to you');
                }
            }

            // 4. Credit Wallet
            this.logger.log(`Verifying deposit: user=${txUserId || userId}, amount=${amount}, currency=${currency}`);
            const wallet = await this.walletService.deposit(txUserId || userId, amount, currency);

            // 5. Mark as processed
            await this.prisma.processedWebhook.create({
                data: {
                    providerReference: reference,
                    provider: 'PAYSTACK',
                    status: 'SUCCESS',
                },
            });

            return {
                status: 'success',
                amount,
                currency,
                newBalance: wallet.availableBalance.toNumber()
            };

        } catch (error: any) {
            this.logger.error(`Verification error for ${reference}: ${error.response?.data?.message || error.message}`);

            // If it's a 404 from Paystack, it's invalid
            if (error.response?.status === 404) {
                throw new BadRequestException('Transaction reference not found');
            }
            throw error;
        }
    }

    /**
     * Handle Paystack Webhook with Idempotency and Security
     */
    async handleWebhook(payload: any, signature: string) {
        // 1. Verify Signature
        const hash = crypto
            .createHmac('sha512', this.PAYSTACK_SECRET)
            .update(JSON.stringify(payload))
            .digest('hex');

        if (hash !== signature) {
            this.logger.warn('Invalid Paystack signature');
            throw new UnauthorizedException('Invalid signature');
        }

        const event = payload.event;
        const data = payload.data;

        if (event === 'charge.success') {
            const reference = data.reference;
            const amount = data.amount / 100; // Convert back from pesewas
            const currency = data.currency;
            const userId = data.metadata?.userId;

            if (!userId) {
                this.logger.error('No userId in webhook metadata');
                return;
            }

            // 2. Idempotency Check
            const existing = await this.prisma.processedWebhook.findUnique({
                where: { providerReference: reference },
            });

            if (existing) {
                this.logger.log(`Webhook ${reference} already processed. Skipping.`);
                return { status: 'already_processed' };
            }

            // 3. Process Deposit
            try {
                this.logger.log(`Processing deposit: user=${userId}, amount=${amount}, currency=${currency}`);
                await this.walletService.deposit(userId, amount, currency);

                // 4. Record as processed
                await this.prisma.processedWebhook.create({
                    data: {
                        providerReference: reference,
                        provider: 'PAYSTACK',
                        status: 'SUCCESS',
                    },
                });

                this.logger.log(`Successfully processed deposit for user ${userId}, ref: ${reference}`);
            } catch (error: any) {
                this.logger.error(`Failed to process deposit for ref ${reference}: ${error.message}`);
                console.error('WEBHOOK_PROCESS_ERROR:', error);
                throw error;
            }
        }

        return { status: 'success' };
    }

    /**
     * Admin Withdrawal (Transfer API)
     */
    async initiateAdminWithdrawal(amount: number) {
        // 1. Get Admin Recipient Code from Config
        const recipientCode = this.configService.get<string>('PAYSTACK_ADMIN_RECIPIENT_CODE');

        if (!recipientCode) {
            this.logger.error('PAYSTACK_ADMIN_RECIPIENT_CODE not configured');
            throw new InternalServerErrorException('Admin withdrawal not configured');
        }

        this.logger.log(`Admin withdrawal of ${amount} GHS triggered to recipient ${recipientCode}`);

        // 2. Atomic Deduct from System Wallet FIRST
        try {
            await this.walletService.withdrawSystemFunds(amount);
        } catch (error: any) {
            this.logger.error(`System fund deduction failed: ${error.message}`);
            throw new BadRequestException('Insufficient system funds or wallet error');
        }

        try {
            // 3. Initiate Transfer
            const transferResponse = await axios.post(
                'https://api.paystack.co/transfer',
                {
                    source: 'balance',
                    amount: Math.round(amount * 100), // Convert to pesewas
                    recipient: recipientCode,
                    reason: 'Admin Withdrawal',
                },
                {
                    headers: { Authorization: `Bearer ${this.PAYSTACK_SECRET}` },
                },
            );

            this.logger.log(`Admin withdrawal successful: ${transferResponse.data.data.reference}`);

            // Audit Log
            await this.adminService.logAction(
                'SYSTEM',
                'APPROVE_WITHDRAWAL',
                null,
                { amount, reference: transferResponse.data.data.reference }
            );

            return transferResponse.data.data;

        } catch (error: any) {
            this.logger.error(`Admin withdrawal failed: ${error.response?.data?.message || error.message}`);

            // ROLLBACK: Refund System Wallet
            try {
                this.logger.warn(`Rolling back system withdrawal of ${amount} GHS...`);
                await this.walletService.refundSystemWithdrawal(amount, 'Rollback: Paystack transfer failed');
                this.logger.log('System wallet rollback successful.');
            } catch (rollbackError: any) {
                this.logger.error(`CRITICAL: System wallet rollback failed! Funds may be lost. Error: ${rollbackError.message}`);
                // In a real system, this would trigger a PagerDuty alert
            }

            throw new BadRequestException('Admin withdrawal failed. System funds have been refunded.');
        }
    }

    /**
     * User Withdrawal
     */
    async initiateUserWithdrawal(userId: string, amount: number, bankCode: string, accountNumber: string) {
        console.log(`[WITHDRAW] Initiating for user ${userId}, amount ${amount}`);
        // 1. Deduct from wallet first (Atomic)
        await this.walletService.withdraw(userId, amount);
        console.log(`[WITHDRAW] Wallet deduction successful`);

        try {
            // Determine type based on bank code
            const isMoMo = ['MTN', 'VOD', 'ATL'].includes(bankCode.toUpperCase());
            const type = isMoMo ? 'mobile_money' : 'nuban';
            console.log(`[WITHDRAW] Creating recipient type: ${type}`);

            // 2. Create Transfer Recipient
            const recipientResponse = await axios.post(
                'https://api.paystack.co/transferrecipient',
                {
                    type,
                    name: 'User Withdrawal',
                    account_number: accountNumber,
                    bank_code: bankCode,
                    currency: 'GHS',
                },
                {
                    headers: {
                        Authorization: `Bearer ${this.PAYSTACK_SECRET}`,
                        'Content-Type': 'application/json'
                    },
                },
            );

            const recipientCode = recipientResponse.data.data.recipient_code;
            console.log(`[WITHDRAW] Recipient created: ${recipientCode}`);

            // 3. Initiate Transfer
            const transferResponse = await axios.post(
                'https://api.paystack.co/transfer',
                {
                    source: 'balance',
                    amount: Math.round(amount * 100),
                    recipient: recipientCode,
                    reason: 'Potta Pool Withdrawal',
                },
                {
                    headers: {
                        Authorization: `Bearer ${this.PAYSTACK_SECRET}`,
                        'Content-Type': 'application/json'
                    },
                },
            );

            console.log(`[WITHDRAW] Transfer successful: ${transferResponse.data.data.reference}`);
            return transferResponse.data.data;
        } catch (error: any) {
            console.error(`[WITHDRAW] ERROR:`, error.response?.data || error.message);
            this.logger.error(`Withdrawal error: ${error.response?.data?.message || error.message}`);

            // Compensating Transaction: Refund the user
            this.logger.log(`Refunding user ${userId} amount ${amount} due to failure.`);
            await this.walletService.refundWithdrawal(userId, amount, 'Withdrawal Failed: ' + (error.response?.data?.message || 'Unknown Error'));

            throw new BadRequestException('Transfer failed. Funds have been refunded.');
        }
    }
}
