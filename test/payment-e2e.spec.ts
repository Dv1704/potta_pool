import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import * as crypto from 'crypto';

describe('Payment & FX (E2E)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let configService: ConfigService;
    let PAYSTACK_SECRET: string;

    let testUser: any;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        prisma = app.get(PrismaService);
        configService = app.get(ConfigService);
        PAYSTACK_SECRET = configService.get<string>('PAYSTACK_SECRET_KEY') || 'secretKey';

        // Cleanup
        await prisma.user.deleteMany({ where: { email: 'payment-test@test.com' } });
        await prisma.processedWebhook.deleteMany({});

        // Create test user
        testUser = await prisma.user.create({
            data: {
                email: 'payment-test@test.com',
                password: 'password',
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
});
