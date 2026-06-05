import { Injectable, Logger, UnauthorizedException, BadRequestException, InternalServerErrorException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletService } from './wallet.service.js';
import { FXService } from './fx.service.js';
import { AdminService } from '../admin/admin.service.js';
import { EmailService } from '../email/email.service.js';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class PaymentService {
    private readonly logger = new Logger(PaymentService.name);
    private readonly PAYSTACK_SECRET: string;
    private readonly PAYSTACK_PUBLIC: string;
    private readonly PAYSTACK_WEBHOOK_URL: string;


    private withdrawalCodes = new Map<string, { code: string; userId: string; amount: number; mobileNetwork: string; mobileNumber: string; reference: string; expiresAt: Date }>();

    constructor(
        @Inject(PrismaService) private prisma: PrismaService,
        @Inject(ConfigService) private configService: ConfigService,
        @Inject(WalletService) private walletService: WalletService,
        @Inject(FXService) private fxService: FXService,
        @Inject(forwardRef(() => AdminService))
        private adminService: AdminService,
        @Inject(EmailService) private emailService: EmailService,
    ) {
        // Clean expired withdrawal codes every 5 minutes
        setInterval(() => this.cleanExpiredWithdrawalCodes(), 5 * 60 * 1000);
        this.PAYSTACK_SECRET = this.configService.get<string>('PAYSTACK_SECRET_KEY') || 'secretKey';
        this.PAYSTACK_PUBLIC = this.configService.get<string>('PAYSTACK_PUBLIC_KEY') || 'publicKey';
        this.PAYSTACK_WEBHOOK_URL = this.configService.get<string>('PAYSTACK_WEBHOOK_URL') || 'webhookUrl';


    }



    /**
     * Initialize a Paystack Checkout transaction
     */
    async initializeDeposit(userId: string, email: string, amount: number, currency: string, callbackUrl?: string) {
        if (amount <= 0) throw new BadRequestException('Amount must be positive');

        // Paystack expects amount in minor units (e.g. pesewas/kobo)
        const paystackAmount = Math.round(amount * 100);

        const reference = `POTTA-${userId.split('-')[0]}-${Date.now()}`;

        const payload = {
            reference,
            amount: paystackAmount,
            email,
            callback_url: callbackUrl,
            metadata: { userId, internalCurrency: currency },
        };

        this.logger.log(`Initializing Paystack deposit for user ${userId}: ${JSON.stringify(payload)}`);

        try {
            const response = await axios.post(
                'https://api.paystack.co/transaction/initialize',
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${this.PAYSTACK_SECRET}`,
                        'Content-Type': 'application/json',
                    }
                },
            );

            const authUrl: string = response.data?.data?.authorization_url;
            if (!authUrl) throw new Error('No authorization_url in Paystack response');

            return {
                authorization_url: authUrl,
                reference,
            };
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || error.message;
            const errorData = JSON.stringify(error.response?.data || {});
            this.logger.error(`Paystack init error: ${errorMsg} - Data: ${errorData}`);
            throw new BadRequestException('Failed to initialize payment: ' + errorMsg);
        }
    }

    /**
     * Verify Paystack Transaction (Manual Verification by reference)
     */
    async verifyTransaction(reference: string, userId: string) {
        try {
            // 1. Query Paystack API
            const response = await axios.get(
                `https://api.paystack.co/transaction/verify/${reference}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.PAYSTACK_SECRET}`,
                    }
                }
            );

            const data = response.data?.data;

            if (!data || data.status !== 'success') {
                throw new BadRequestException(`Transaction status: ${data?.status ?? 'unknown'}`);
            }

            // 2. Check if already processed
            const existing = await this.prisma.processedWebhook.findUnique({
                where: { providerReference: reference },
            });

            if (existing) {
                const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
                return {
                    status: 'already_processed',
                    message: 'Transaction already processed',
                    newBalance: wallet?.availableBalance.toNumber(),
                };
            }

            // 3. Validate Amount and User
            const amount: number = data.amount / 100; // Convert minor units (kobo/pesewas) back
            const currency: string = data.currency;
            const txUserId: string | undefined = data.metadata?.userId;

            if (txUserId && txUserId !== userId) {
                this.logger.warn(`User ${userId} attempted to verify transaction belonging to ${txUserId}`);
                throw new BadRequestException('Transaction does not belong to you');
            }

            // 4. Credit Wallet
            this.logger.log(`Verifying Paystack deposit: user=${txUserId || userId}, amount=${amount}, currency=${currency}`);
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
                newBalance: wallet.availableBalance.toNumber(),
            };

        } catch (error: any) {
            this.logger.error(`Verification error for ${reference}: ${error.response?.data?.message || error.message}`);
            if (error.response?.status === 404) {
                throw new BadRequestException('Transaction not found');
            }
            throw error;
        }
    }

    /**
     * Verify Paystack Webhook Signature (HMAC-SHA512)
     */
    private verifyPaystackSignature(rawBody: string, signature: string): boolean {
        const computed = crypto
            .createHmac('sha512', this.PAYSTACK_SECRET)
            .update(rawBody)
            .digest('hex');
        return computed === signature;
    }

    /**
     * Handle Paystack Webhook
     */
    async handlePaystackWebhook(payload: any, rawBody: string, signature: string) {
        if (!this.verifyPaystackSignature(rawBody, signature)) {
            this.logger.warn('Invalid Paystack webhook signature');
            throw new UnauthorizedException('Invalid signature');
        }

        const event: string = payload.event;
        const data = payload.data;

        if (event === 'charge.success' && data?.status === 'success') {
            const reference: string = data.reference;
            const amount: number = data.amount / 100;
            const currency: string = data.currency;
            const userId: string | undefined = data.metadata?.userId;

            if (!userId) {
                this.logger.error('No userId in Paystack webhook metadata');
                return { status: 'ignored' };
            }

            const existing = await this.prisma.processedWebhook.findUnique({
                where: { providerReference: reference },
            });

            if (existing) {
                this.logger.log(`Paystack Webhook ${reference} already processed. Skipping.`);
                return { status: 'already_processed' };
            }

            try {
                this.logger.log(`Processing Paystack deposit via webhook: user=${userId}, amount=${amount}, currency=${currency}`);
                await this.walletService.deposit(userId, amount, currency);

                await this.prisma.processedWebhook.create({
                    data: {
                        providerReference: reference,
                        provider: 'PAYSTACK',
                        status: 'SUCCESS',
                    },
                });

                this.logger.log(`Successfully processed Paystack deposit for user ${userId}, ref: ${reference}`);
            } catch (error: any) {
                this.logger.error(`Failed to process Paystack deposit for ref ${reference}: ${error.message}`);
                throw error;
            }
        } else {
            this.logger.log(`Ignoring Paystack webhook event: ${event}`);
        }

        return { status: 'success' };
    }



    /**
     * Create Paystack Transfer Recipient
     */
    private async createPaystackRecipient(name: string, mobileNumber: string, mobileNetwork: string, currency: string = 'GHS'): Promise<string> {
        let paystackBankCode = mobileNetwork.toUpperCase();
        if (paystackBankCode.includes('MTN')) {
            paystackBankCode = 'MTN';
        } else if (paystackBankCode.includes('VODAFONE') || paystackBankCode === 'VOD') {
            paystackBankCode = 'VOD';
        } else if (paystackBankCode.includes('AIRTEL') || paystackBankCode.includes('TIGO') || paystackBankCode === 'TGO') {
            paystackBankCode = 'TGO';
        }

        try {
            const response = await axios.post(
                'https://api.paystack.co/transferrecipient',
                {
                    type: 'mobile_money',
                    name,
                    account_number: mobileNumber,
                    bank_code: paystackBankCode,
                    currency: currency.toUpperCase()
                },
                {
                    headers: {
                        Authorization: `Bearer ${this.PAYSTACK_SECRET}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const recipientCode = response.data?.data?.recipient_code;
            if (!recipientCode) {
                throw new Error('Failed to retrieve recipient_code from Paystack');
            }
            return recipientCode;
        } catch (error: any) {
            const errMsg = error.response?.data?.message || error.message;
            this.logger.error(`Error creating Paystack recipient: ${errMsg}`);
            throw new Error(`Failed to initialize transfer recipient: ${errMsg}`);
        }
    }

    /**
     * Admin Withdrawal (Paystack Transfer)
     */
    async initiateAdminWithdrawal(amount: number) {
        const mobileNumber = this.configService.get<string>('PAYSTACK_ADMIN_MOBILE_NUMBER');
        const mobileNetwork = this.configService.get<string>('PAYSTACK_ADMIN_MOBILE_NETWORK') || 'MTN';

        if (!mobileNumber) {
            this.logger.error('Admin withdrawal not configured');
            throw new InternalServerErrorException('Admin withdrawal not configured');
        }

        this.logger.log(`Admin withdrawal of ${amount} GHS triggered to ${mobileNumber}`);

        try {
            await this.walletService.withdrawSystemFunds(amount);
        } catch {
            throw new BadRequestException('Insufficient system funds');
        }

        const reference = `ADMIN-WITHDRAW-${Date.now()}`;

        try {
            const recipientCode = await this.createPaystackRecipient('Potta Admin', mobileNumber, mobileNetwork, 'GHS');

            const transferResponse = await axios.post(
                'https://api.paystack.co/transfer',
                {
                    source: 'balance',
                    amount: Math.round(amount * 100), // in minor units
                    recipient: recipientCode,
                    reason: 'Admin Withdrawal',
                    reference,
                },
                {
                    headers: {
                        Authorization: `Bearer ${this.PAYSTACK_SECRET}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            this.logger.log(`Admin withdrawal initiated: ref=${reference}`);

            await this.adminService.logAction(
                'SYSTEM',
                'APPROVE_WITHDRAWAL',
                null,
                { amount, reference },
            );

            return transferResponse.data?.data;

        } catch (error: any) {
            const errMsg = error.response?.data?.message || error.message;
            this.logger.error(`Admin withdrawal failed: ${errMsg}`);
            // ROLLBACK
            await this.walletService.refundSystemWithdrawal(amount, 'Rollback: Paystack transfer failed: ' + errMsg);
            throw new BadRequestException('Admin withdrawal failed. Refunded. ' + errMsg);
        }
    }

    private cleanExpiredWithdrawalCodes() {
        const now = new Date();
        for (const [sessionId, session] of this.withdrawalCodes.entries()) {
            if (now > session.expiresAt) {
                this.withdrawalCodes.delete(sessionId);
            }
        }
    }

    /**
     * User Withdrawal (Step 1: Initiate & Send 2FA Code)
     */
    async initiateUserWithdrawal(userId: string, amount: number, mobileNetwork: string, mobileNumber: string) {
        if (amount <= 0) throw new BadRequestException('Amount must be positive');
        
        // Check balance first before starting 2FA
        const wallet = await this.prisma.wallet.findUnique({
            where: { userId }
        });
        if (!wallet || wallet.availableBalance.toNumber() < amount) {
            throw new BadRequestException('Insufficient funds');
        }

        // Generate 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Generate Paystack payout reference early to tie it directly to this 2FA session
        const reference = `WITHDRAW-${userId.split('-')[0]}-${Date.now()}`;

        // Store code session
        this.withdrawalCodes.set(sessionId, {
            code,
            userId,
            amount,
            mobileNetwork,
            mobileNumber,
            reference,
            expiresAt
        });

        // Get user details
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, email: true }
        });

        if (!user) throw new BadRequestException('User not found');

        // Send confirmation email
        await this.emailService.sendWithdrawal2faEmail(
            user.email,
            user.name || 'Potta User',
            amount,
            mobileNumber,
            code
        );

        return {
            requires2FA: true,
            sessionId,
            message: 'A confirmation code has been sent to your email. Please verify to complete the withdrawal.'
        };
    }

    /**
     * User Withdrawal (Step 2: Confirm Code & Process Transfer)
     */
    async confirmUserWithdrawal(userId: string, sessionId: string, code: string) {
        const session = this.withdrawalCodes.get(sessionId);

        if (!session) {
            throw new UnauthorizedException('Invalid or expired session');
        }

        if (session.userId !== userId) {
            throw new UnauthorizedException('Unauthorized session access');
        }

        if (new Date() > session.expiresAt) {
            this.withdrawalCodes.delete(sessionId);
            throw new UnauthorizedException('Code has expired');
        }

        if (session.code !== code) {
            throw new UnauthorizedException('Invalid confirmation code');
        }

        // Delete session as it is consumed
        this.withdrawalCodes.delete(sessionId);

        const { amount, mobileNetwork, mobileNumber, reference } = session;

        // Perform actual wallet deduction
        await this.walletService.withdraw(userId, amount);

        try {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { name: true, email: true }
            });
            const recipientName = user?.name || user?.email?.split('@')[0] || 'Potta User';

            const recipientCode = await this.createPaystackRecipient(recipientName, mobileNumber, mobileNetwork, 'GHS');

            const transferResponse = await axios.post(
                'https://api.paystack.co/transfer',
                {
                    source: 'balance',
                    amount: Math.round(amount * 100), // in minor units
                    recipient: recipientCode,
                    reason: 'Potta Pool Withdrawal',
                    reference, // Strict gateway idempotency key
                },
                {
                    headers: {
                        Authorization: `Bearer ${this.PAYSTACK_SECRET}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return transferResponse.data?.data;
        } catch (error: any) {
            const errMsg = error.response?.data?.message || error.message;
            this.logger.error(`Withdrawal error: ${errMsg}`);
            // Rollback balance deduction
            await this.walletService.refundWithdrawal(userId, amount, 'Withdrawal Failed: ' + errMsg);
            throw new BadRequestException('Transfer failed. Funds refunded. ' + errMsg);
        }
    }
}

