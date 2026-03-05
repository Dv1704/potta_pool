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
const TEST_SECRET = 'test_kora_secret';
function makeSignature(rawBody) {
    return crypto.createHmac('sha256', TEST_SECRET).update(rawBody).digest('hex');
}
describe('PaymentService (Korapay)', () => {
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
                    },
                },
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn((key) => {
                            if (key === 'KORA_SECRET_KEY')
                                return TEST_SECRET;
                            if (key === 'KORA_PUBLIC_KEY')
                                return 'test_kora_public';
                            if (key === 'KORA_WEBHOOK_HASH')
                                return 'test_hash';
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
    it('should initialize deposit and return checkout_url', async () => {
        const checkoutUrl = 'https://checkout-ui.korapay.com/pay/test';
        const mockResponse = {
            data: {
                status: true,
                message: 'Checkout Link Generated',
                data: { checkout_url: checkoutUrl },
            },
        };
        const axiosSpy = jest.spyOn(axios, 'post').mockResolvedValue(mockResponse);
        const result = await service.initializeDeposit('user1', 'test@example.com', 100, 'GHS', 'http://callback.com');
        expect(result).toHaveProperty('authorization_url', checkoutUrl);
        expect(result).toHaveProperty('reference');
        expect(axiosSpy).toHaveBeenCalledWith(expect.stringContaining('/charges/initialize'), expect.objectContaining({
            amount: 100,
            currency: 'GHS',
            customer: expect.objectContaining({ email: 'test@example.com' }),
        }), expect.anything());
    });
    it('should handle charge.success webhook and credit wallet', async () => {
        const payload = {
            event: 'charge.success',
            data: {
                reference: 'POTTA-user1-12345',
                status: 'success',
                amount: 100,
                currency: 'GHS',
                metadata: { userId: 'user1' },
            },
        };
        const rawBody = JSON.stringify(payload);
        const sig = makeSignature(rawBody);
        const result = await service.handleWebhook(payload, rawBody, sig);
        expect(result).toEqual({ status: 'success' });
        expect(walletService.deposit).toHaveBeenCalledWith('user1', 100, 'GHS');
    });
    it('should return already_processed if webhook is duplicate', async () => {
        prisma.processedWebhook.findUnique.mockResolvedValue({ id: 1 });
        const payload = {
            event: 'charge.success',
            data: {
                reference: 'POTTA-user1-already-done',
                status: 'success',
                amount: 100,
                currency: 'GHS',
                metadata: { userId: 'user1' },
            },
        };
        const rawBody = JSON.stringify(payload);
        const sig = makeSignature(rawBody);
        const result = await service.handleWebhook(payload, rawBody, sig);
        expect(result).toEqual({ status: 'already_processed' });
        expect(walletService.deposit).not.toHaveBeenCalled();
    });
    it('should throw UnauthorizedException on invalid webhook signature', async () => {
        const payload = { event: 'charge.success', data: {} };
        const rawBody = JSON.stringify(payload);
        await expect(service.handleWebhook(payload, rawBody, 'invalid-sig')).rejects.toThrow('Invalid signature');
    });
});
