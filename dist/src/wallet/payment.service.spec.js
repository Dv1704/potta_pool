// @ts-nocheck
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { PaymentService } from './payment.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { WalletService } from './wallet.service.js';
import { FXService } from './fx.service.js';
import { AdminService } from '../admin/admin.service.js';
import axios from 'axios';
import * as crypto from 'crypto';
const TEST_SECRET = 'test_paystack_secret';
function makePaystackSignature(rawBody) {
    return crypto.createHmac('sha512', TEST_SECRET).update(rawBody).digest('hex');
}
describe('PaymentService (Paystack)', () => {
    let service;
    let walletService;
    let prisma;
    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                PaymentService,
                {
                    provide: PrismaService,
                    useValue: {
                        processedWebhook: {
                            findUnique: jest.fn().mockResolvedValue(null),
                            create: jest.fn().mockResolvedValue({}),
                        },
                        wallet: {
                            findUnique: jest.fn(),
                        },
                        user: {
                            findUnique: jest.fn().mockResolvedValue({ name: 'Test User', email: 'test@example.com' }),
                        },
                    },
                },
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn((key) => {
                            if (key === 'PAYSTACK_SECRET_KEY')
                                return TEST_SECRET;
                            if (key === 'PAYSTACK_PUBLIC_KEY')
                                return 'test_paystack_public';
                            if (key === 'PAYSTACK_WEBHOOK_URL')
                                return 'test_paystack_webhook';
                            return null;
                        }),
                    },
                },
                {
                    provide: WalletService,
                    useValue: {
                        deposit: jest.fn().mockResolvedValue({ availableBalance: { toNumber: () => 200 } }),
                        withdraw: jest.fn(),
                        withdrawSystemFunds: jest.fn(),
                        refundWithdrawal: jest.fn(),
                        refundSystemWithdrawal: jest.fn(),
                    },
                },
                {
                    provide: FXService,
                    useValue: {},
                },
                {
                    provide: AdminService,
                    useValue: {
                        logAction: jest.fn(),
                    },
                },
            ],
        }).compile();
        service = module.get(PaymentService);
        walletService = module.get(WalletService);
        prisma = module.get(PrismaService);
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });
    it('should initialize deposit and return authorization_url', async () => {
        const authUrl = 'https://checkout.paystack.co/pay/test';
        const mockResponse = {
            data: {
                status: true,
                message: 'Authorization URL created',
                data: { authorization_url: authUrl },
            },
        };
        const axiosSpy = jest.spyOn(axios, 'post').mockResolvedValue(mockResponse);
        const result = await service.initializeDeposit('user1', 'test@example.com', 100, 'GHS', 'http://callback.com');
        expect(result).toHaveProperty('authorization_url', authUrl);
        expect(result).toHaveProperty('reference');
        expect(axiosSpy).toHaveBeenCalledWith(expect.stringContaining('api.paystack.co/transaction/initialize'), expect.objectContaining({
            amount: 10000, // 100 * 100 minor units
            email: 'test@example.com',
            callback_url: 'http://callback.com',
            metadata: expect.objectContaining({ userId: 'user1', internalCurrency: 'GHS' }),
        }), expect.anything());
    });
    it('should handle charge.success paystack webhook and credit wallet', async () => {
        const payload = {
            event: 'charge.success',
            data: {
                reference: 'POTTA-user1-12345',
                status: 'success',
                amount: 10000, // 100 GHS in minor units
                currency: 'GHS',
                metadata: { userId: 'user1' },
            },
        };
        const rawBody = JSON.stringify(payload);
        const sig = makePaystackSignature(rawBody);
        const result = await service.handlePaystackWebhook(payload, rawBody, sig);
        expect(result).toEqual({ status: 'success' });
        expect(walletService.deposit).toHaveBeenCalledWith('user1', 100, 'GHS');
    });
    it('should return already_processed if paystack webhook is duplicate', async () => {
        prisma.processedWebhook.findUnique.mockResolvedValue({ id: 1 });
        const payload = {
            event: 'charge.success',
            data: {
                reference: 'POTTA-user1-already-done',
                status: 'success',
                amount: 10000,
                currency: 'GHS',
                metadata: { userId: 'user1' },
            },
        };
        const rawBody = JSON.stringify(payload);
        const sig = makePaystackSignature(rawBody);
        const result = await service.handlePaystackWebhook(payload, rawBody, sig);
        expect(result).toEqual({ status: 'already_processed' });
        expect(walletService.deposit).not.toHaveBeenCalled();
    });
    it('should throw UnauthorizedException on invalid paystack webhook signature', async () => {
        const payload = { event: 'charge.success', data: {} };
        const rawBody = JSON.stringify(payload);
        await expect(service.handlePaystackWebhook(payload, rawBody, 'invalid-sig')).rejects.toThrow('Invalid signature');
    });
});
