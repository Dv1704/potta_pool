var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PaymentService_1;
import { Injectable, Logger, UnauthorizedException, BadRequestException, InternalServerErrorException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletService } from './wallet.service.js';
import { FXService } from './fx.service.js';
import { AdminService } from '../admin/admin.service.js';
import axios from 'axios';
import * as crypto from 'crypto';
let PaymentService = PaymentService_1 = class PaymentService {
    prisma;
    configService;
    walletService;
    fxService;
    adminService;
    logger = new Logger(PaymentService_1.name);
    KORA_SECRET;
    KORA_PUBLIC;
    KORA_WEBHOOK_HASH;
    KORA_BASE_URL = 'https://api.korapay.com/merchant/api/v1';
    constructor(prisma, configService, walletService, fxService, adminService) {
        this.prisma = prisma;
        this.configService = configService;
        this.walletService = walletService;
        this.fxService = fxService;
        this.adminService = adminService;
        this.KORA_SECRET = this.configService.get('KORA_SECRET_KEY') || 'secretKey';
        this.KORA_PUBLIC = this.configService.get('KORA_PUBLIC_KEY') || 'publicKey';
        this.KORA_WEBHOOK_HASH = this.configService.get('KORA_WEBHOOK_HASH') || 'webhookSecret';
    }
    koraHeaders() {
        return {
            Authorization: `Bearer ${this.KORA_SECRET}`,
            'Content-Type': 'application/json',
        };
    }
    /**
     * Initialize a Korapay Checkout transaction
     */
    async initializeDeposit(userId, email, amount, currency, callbackUrl) {
        if (amount <= 0)
            throw new BadRequestException('Amount must be positive');
        this.logger.log(`Initializing deposit: userId=${userId}, amount=${amount}, currency=${currency}`);
        const reference = `POTTA-${userId}-${Date.now()}`;
        try {
            const response = await axios.post(`${this.KORA_BASE_URL}/charges/initialize`, {
                reference,
                amount,
                currency: currency.toUpperCase(),
                redirect_url: callbackUrl,
                notification_url: this.configService.get('KORA_WEBHOOK_URL'),
                customer: {
                    email,
                    name: email.split('@')[0],
                },
                metadata: { userId, internalCurrency: currency },
            }, { headers: this.koraHeaders() });
            // Korapay returns data.checkout_url
            const checkoutUrl = response.data?.data?.checkout_url;
            if (!checkoutUrl)
                throw new Error('No checkout_url in Korapay response');
            return {
                authorization_url: checkoutUrl,
                reference,
            };
        }
        catch (error) {
            this.logger.error(`Korapay init error: ${error.response?.data?.message || error.message}`);
            throw new BadRequestException('Failed to initialize payment');
        }
    }
    /**
     * Verify Korapay Transaction (Manual Verification by reference)
     */
    async verifyTransaction(reference, userId) {
        try {
            // 1. Query Korapay API
            const response = await axios.get(`${this.KORA_BASE_URL}/charges/${reference}`, { headers: this.koraHeaders() });
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
            const amount = data.amount;
            const currency = data.currency;
            const txUserId = data.metadata?.userId;
            if (txUserId && txUserId !== userId) {
                this.logger.warn(`User ${userId} attempted to verify transaction belonging to ${txUserId}`);
                throw new BadRequestException('Transaction does not belong to you');
            }
            // 4. Credit Wallet
            this.logger.log(`Verifying deposit: user=${txUserId || userId}, amount=${amount}, currency=${currency}`);
            const wallet = await this.walletService.deposit(txUserId || userId, amount, currency);
            // 5. Mark as processed
            await this.prisma.processedWebhook.create({
                data: {
                    providerReference: reference,
                    provider: 'KORAPAY',
                    status: 'SUCCESS',
                },
            });
            return {
                status: 'success',
                amount,
                currency,
                newBalance: wallet.availableBalance.toNumber(),
            };
        }
        catch (error) {
            this.logger.error(`Verification error for ${reference}: ${error.response?.data?.message || error.message}`);
            if (error.response?.status === 404) {
                throw new BadRequestException('Transaction not found');
            }
            throw error;
        }
    }
    /**
     * Verify Korapay Webhook Signature
     * Korapay signs: HMAC-SHA256(rawBody, secretKey) → hex
     */
    verifyWebhookSignature(rawBody, signature) {
        const computed = crypto
            .createHmac('sha256', this.KORA_SECRET)
            .update(rawBody)
            .digest('hex');
        return computed === signature;
    }
    /**
     * Handle Korapay Webhook
     */
    async handleWebhook(payload, rawBody, signature) {
        // 1. Verify Signature (HMAC-SHA256)
        if (!this.verifyWebhookSignature(rawBody, signature)) {
            this.logger.warn('Invalid Korapay webhook signature');
            throw new UnauthorizedException('Invalid signature');
        }
        const event = payload.event;
        const data = payload.data;
        // Only handle successful charge events
        if (event === 'charge.success' && data?.status === 'success') {
            const reference = data.reference;
            const amount = data.amount;
            const currency = data.currency;
            const userId = data.metadata?.userId;
            if (!userId) {
                this.logger.error('No userId in Korapay webhook metadata');
                return { status: 'ignored' };
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
                this.logger.log(`Processing deposit via webhook: user=${userId}, amount=${amount}, currency=${currency}`);
                await this.walletService.deposit(userId, amount, currency);
                // 4. Record as processed
                await this.prisma.processedWebhook.create({
                    data: {
                        providerReference: reference,
                        provider: 'KORAPAY',
                        status: 'SUCCESS',
                    },
                });
                this.logger.log(`Successfully processed deposit for user ${userId}, ref: ${reference}`);
            }
            catch (error) {
                this.logger.error(`Failed to process deposit for ref ${reference}: ${error.message}`);
                throw error;
            }
        }
        else {
            this.logger.log(`Ignoring Korapay webhook event: ${event}`);
        }
        return { status: 'success' };
    }
    /**
     * Admin Withdrawal (Korapay Disburse / Payout)
     */
    async initiateAdminWithdrawal(amount) {
        const mobileNumber = this.configService.get('KORA_ADMIN_MOBILE_NUMBER');
        const mobileNetwork = this.configService.get('KORA_ADMIN_MOBILE_NETWORK') || 'MTN';
        if (!mobileNumber) {
            this.logger.error('Korapay admin withdrawal not configured (missing KORA_ADMIN_MOBILE_NUMBER)');
            throw new InternalServerErrorException('Admin withdrawal not configured');
        }
        this.logger.log(`Admin withdrawal of ${amount} GHS triggered to ${mobileNumber}`);
        try {
            await this.walletService.withdrawSystemFunds(amount);
        }
        catch {
            throw new BadRequestException('Insufficient system funds');
        }
        const reference = `ADMIN-WITHDRAW-${Date.now()}`;
        try {
            const disbursementResponse = await axios.post(`${this.KORA_BASE_URL}/transactions/disburse`, {
                reference,
                destination: {
                    type: 'mobile_money',
                    amount,
                    currency: 'GHS',
                    narration: 'Admin Withdrawal',
                    mobile_money: {
                        operator: mobileNetwork,
                        mobile_number: mobileNumber,
                    },
                },
            }, { headers: this.koraHeaders() });
            this.logger.log(`Admin withdrawal initiated: ref=${reference}`);
            await this.adminService.logAction('SYSTEM', 'APPROVE_WITHDRAWAL', null, { amount, reference });
            return disbursementResponse.data?.data;
        }
        catch (error) {
            this.logger.error(`Admin withdrawal failed: ${error.response?.data?.message || error.message}`);
            // ROLLBACK
            await this.walletService.refundSystemWithdrawal(amount, 'Rollback: Korapay transfer failed');
            throw new BadRequestException('Admin withdrawal failed. Refunded.');
        }
    }
    /**
     * User Withdrawal (Korapay Mobile Money Payout)
     */
    async initiateUserWithdrawal(userId, amount, mobileNetwork, mobileNumber) {
        await this.walletService.withdraw(userId, amount);
        const reference = `WITHDRAW-${userId}-${Date.now()}`;
        try {
            const disbursementResponse = await axios.post(`${this.KORA_BASE_URL}/transactions/disburse`, {
                reference,
                destination: {
                    type: 'mobile_money',
                    amount,
                    currency: 'GHS',
                    narration: 'Potta Pool Withdrawal',
                    mobile_money: {
                        operator: mobileNetwork,
                        mobile_number: mobileNumber,
                    },
                },
            }, { headers: this.koraHeaders() });
            return disbursementResponse.data?.data;
        }
        catch (error) {
            this.logger.error(`Withdrawal error: ${error.response?.data?.message || error.message}`);
            await this.walletService.refundWithdrawal(userId, amount, 'Withdrawal Failed: ' + (error.response?.data?.message || 'Unknown Error'));
            throw new BadRequestException('Transfer failed. Funds refunded.');
        }
    }
};
PaymentService = PaymentService_1 = __decorate([
    Injectable(),
    __param(4, Inject(forwardRef(() => AdminService))),
    __metadata("design:paramtypes", [PrismaService,
        ConfigService,
        WalletService,
        FXService,
        AdminService])
], PaymentService);
export { PaymentService };
