import { Test } from '@nestjs/testing';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import axios from 'axios';
import { FXService } from './../src/wallet/fx.service.js';
describe('Payment & FX (E2E)', () => {
    let app;
    let prisma;
    let configService;
    let PAYSTACK_SECRET;
    let testUser;
    const mockFXService = {
        convertToGHS: jest.fn().mockImplementation(async (amount, currency) => {
            if (currency === 'GHS')
                return { ghsAmount: amount, rate: 1 };
            if (currency === 'USD')
                return { ghsAmount: amount * 16, rate: 16 };
            return { ghsAmount: amount, rate: 1 }; // Default
        })
    };
    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(FXService)
            .useValue(mockFXService)
            .compile();
        app = moduleFixture.createNestApplication();
        await app.init();
        prisma = app.get(PrismaService);
        configService = app.get(ConfigService);
        PAYSTACK_SECRET = configService.get('PAYSTACK_SECRET_KEY') || 'secretKey';
        // Cleanup
        await prisma.user.deleteMany({ where: { email: { in: ['payment-test@test.com', 'admin-payment@test.com'] } } });
        await prisma.processedWebhook.deleteMany({});
        // Create test user
        const hashedTestPass = await bcrypt.hash('password', 10);
        testUser = await prisma.user.create({
            data: {
                email: 'payment-test@test.com',
                password: hashedTestPass,
                referralCode: 'PAYTEST',
                wallet: { create: { availableBalance: 0 } }
            },
            include: { wallet: true }
        });
    });
    afterAll(async () => {
        await prisma.user.deleteMany({ where: { email: 'payment-test@test.com' } });
        await prisma.processedWebhook.deleteMany({});
        await app.close();
    });
    it('Webhook Handling: Should credit user once and stay idempotent on multiple calls', async () => {
        const reference = 'ref-' + Date.now();
        const payload = {
            event: 'charge.success',
            data: {
                reference,
                amount: 5000, // 50 GHS
                currency: 'GHS',
                metadata: { userId: testUser.id }
            }
        };
        const signature = crypto
            .createHmac('sha512', PAYSTACK_SECRET)
            .update(JSON.stringify(payload))
            .digest('hex');
        // First call
        const response1 = await request(app.getHttpServer())
            .post('/payments/webhook/paystack')
            .set('x-paystack-signature', signature)
            .send(payload);
        expect(response1.status).toBe(200);
        const walletAfter1 = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
        expect(walletAfter1?.availableBalance).toBe(50);
        // Second call (Duplicate)
        const response2 = await request(app.getHttpServer())
            .post('/payments/webhook/paystack')
            .set('x-paystack-signature', signature)
            .send(payload);
        expect(response2.status).toBe(200);
        const walletAfter2 = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
        expect(walletAfter2?.availableBalance).toBe(50); // Still 50
        // Third call (Duplicate)
        const response3 = await request(app.getHttpServer())
            .post('/payments/webhook/paystack')
            .set('x-paystack-signature', signature)
            .send(payload);
        expect(response3.status).toBe(200);
        const walletAfter3 = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
        expect(walletAfter3?.availableBalance).toBe(50); // Still 50
    });
    it('Webhook Security: Should reject invalid signature', async () => {
        const payload = { event: 'charge.success', data: { reference: 'bad-ref' } };
        const response = await request(app.getHttpServer())
            .post('/payments/webhook/paystack')
            .set('x-paystack-signature', 'invalid-sig')
            .send(payload);
        expect(response.status).toBe(401);
    });
    it('Admin Withdrawal: Should initiate transfer successfully', async () => {
        // Mock axios.post for transfer
        jest.spyOn(axios, 'post').mockResolvedValue({
            data: {
                status: true,
                message: 'Transfer initiated',
                data: { reference: 'transfer-ref-123' }
            }
        });
        // Mock ConfigService to return a recipient code
        jest.spyOn(configService, 'get').mockImplementation((key) => {
            if (key === 'PAYSTACK_ADMIN_RECIPIENT_CODE')
                return 'RCP_12345';
            if (key === 'PAYSTACK_SECRET_KEY')
                return 'sk_test_xxx';
            return null;
        });
        // We need an admin user token. For this test, let's bypass auth or create an admin.
        // Creating an admin user:
        const hashedPassword = await bcrypt.hash('password', 10);
        const adminUser = await prisma.user.create({
            data: {
                email: 'admin-payment@test.com',
                password: hashedPassword,
                referralCode: 'ADMINPAY',
                role: 'ADMIN',
                wallet: { create: { availableBalance: 2000 } }
            }
        });
        // Login to get token
        const loginRes = await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email: 'admin-payment@test.com', password: 'password' });
        const token = loginRes.body.access_token;
        const response = await request(app.getHttpServer())
            .post('/payments/admin/withdraw')
            .set('Authorization', `Bearer ${token}`)
            .send({ amount: 100 });
        expect(response.status).toBe(201);
        expect(response.body.reference).toBe('transfer-ref-123');
        // Cleanup
        await prisma.user.delete({ where: { id: adminUser.id } });
    });
    it('User Withdrawal (MoMo): Should use mobile_money type for MTN', async () => {
        // Mock success for recipient creation
        jest.spyOn(axios, 'post').mockImplementation(async (url, data) => {
            if (url.includes('transferrecipient')) {
                // Verify correct type is sent
                if (data.bank_code === 'MTN' && data.type !== 'mobile_money') {
                    throw new Error('Expected mobile_money type for MTN');
                }
                return { data: { status: true, data: { recipient_code: 'RCP_MOMO' } } };
            }
            if (url.includes('transfer')) {
                return { data: { status: true, data: { reference: 'momo-withdraw-ref' } } };
            }
            return { data: {} };
        });
        // Credit user first
        await prisma.wallet.update({
            where: { userId: testUser.id },
            data: { availableBalance: 200 }
        });
        // Login User
        const loginRes = await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email: 'payment-test@test.com', password: 'password' });
        const token = loginRes.body.access_token;
        const response = await request(app.getHttpServer())
            .post('/payments/withdraw')
            .set('Authorization', `Bearer ${token}`)
            .send({
            amount: 50,
            bankCode: 'MTN',
            accountNumber: '0540000000',
            accountName: 'Test MoMo'
        });
        expect(response.status).toBe(201);
        expect(response.body.reference).toBe('momo-withdraw-ref');
        // Check wallet debit
        const wallet = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
        expect(wallet?.availableBalance).toBe(150);
    });
    it('Local MoMo Deposit (GHS): Should credit exact amount', async () => {
        // Reset balance to known state (50) to isolate test
        await prisma.wallet.update({
            where: { userId: testUser.id },
            data: { availableBalance: 50 }
        });
        const reference = 'momo-ref-' + Date.now();
        const amountGHS = 100;
        const payload = {
            event: 'charge.success',
            data: {
                reference,
                amount: amountGHS * 100, // in pesewas
                currency: 'GHS',
                metadata: { userId: testUser.id }
            }
        };
        const signature = crypto
            .createHmac('sha512', PAYSTACK_SECRET)
            .update(JSON.stringify(payload))
            .digest('hex');
        const response = await request(app.getHttpServer())
            .post('/payments/webhook/paystack')
            .set('x-paystack-signature', signature)
            .send(payload);
        expect(response.status).toBe(200);
        const wallet = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
        // Previous balance was 50 from first test. Adding 100.
        expect(wallet?.availableBalance).toBe(150);
    });
    it('International Deposit (USD): Should convert to GHS using FX Service', async () => {
        // Reset/Check balance before test to ensure deterministic expectation
        await prisma.wallet.update({
            where: { userId: testUser.id },
            data: { availableBalance: 150 }
        });
        const reference = 'usd-ref-' + Date.now();
        const amountUSD = 10; // $10
        // Mock FXService handles this: 1 USD = 16 GHS
        const payload = {
            event: 'charge.success',
            data: {
                reference,
                amount: amountUSD * 100, // in cents
                currency: 'USD',
                metadata: { userId: testUser.id }
            }
        };
        const signature = crypto
            .createHmac('sha512', PAYSTACK_SECRET)
            .update(JSON.stringify(payload))
            .digest('hex');
        const response = await request(app.getHttpServer())
            .post('/payments/webhook/paystack')
            .set('x-paystack-signature', signature)
            .send(payload);
        expect(response.status).toBe(200);
        const wallet = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
        // Previous: 150. New: 150 + (10 * 16) = 310.
        expect(wallet?.availableBalance).toBe(310);
    });
});
