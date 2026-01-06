import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { WalletService } from './../src/wallet/wallet.service.js';
describe('Wallet & Transaction System (E2E)', () => {
    let app;
    let prisma;
    let walletService;
    let userToken;
    const testUserEmail = 'walletuser@example.com';
    let userId;
    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe());
        await app.init();
        prisma = app.get(PrismaService);
        walletService = app.get(WalletService);
        // Cleanup and Setup User
        await prisma.user.deleteMany({ where: { email: testUserEmail } });
        const res = await request(app.getHttpServer())
            .post('/auth/register')
            .send({ email: testUserEmail, password: 'password123', name: 'Wallet User' });
        userId = res.body.id;
        const loginRes = await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email: testUserEmail, password: 'password123' });
        userToken = loginRes.body.access_token;
    });
    afterAll(async () => {
        await prisma.user.deleteMany({ where: { email: testUserEmail } });
        await app.close();
    });
    it('/wallet/balance (GET) - Check initial balance', () => {
        return request(app.getHttpServer())
            .get('/wallet/balance')
            .set('Authorization', `Bearer ${userToken}`)
            .expect(200)
            .expect((res) => {
            expect(res.body.available).toBe(0);
            expect(res.body.locked).toBe(0);
        });
    });
    it('/wallet/deposit (POST) - Fail if below minimum (10 GHS)', () => {
        return request(app.getHttpServer())
            .post('/wallet/deposit')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ amount: 5, currency: 'GHS' })
            .expect(400)
            .expect((res) => {
            const msg = Array.isArray(res.body.message) ? res.body.message[0] : res.body.message;
            expect(msg).toContain('10 GHS');
        });
    });
    it('/wallet/deposit (POST) - Success with GHS', async () => {
        await request(app.getHttpServer())
            .post('/wallet/deposit')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ amount: 50, currency: 'GHS' })
            .expect(201);
        const res = await request(app.getHttpServer())
            .get('/wallet/balance')
            .set('Authorization', `Bearer ${userToken}`)
            .expect(200);
        expect(res.body.available).toBe(50);
    });
    it('/wallet/deposit (POST) - Success with USD (FX Conversion)', async () => {
        // Mock FX is 1 USD = 16 GHS
        await request(app.getHttpServer())
            .post('/wallet/deposit')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ amount: 10, currency: 'USD' })
            .expect(201);
        const res = await request(app.getHttpServer())
            .get('/wallet/balance')
            .set('Authorization', `Bearer ${userToken}`)
            .expect(200);
        // 50 (prev) + (10 * 16) = 210
        expect(res.body.available).toBe(210);
    });
    it('Verify Double-Entry Ledger for Deposits', async () => {
        const wallet = await prisma.wallet.findUnique({ where: { userId } });
        const ledgers = await prisma.ledger.findMany({
            where: { walletId: wallet?.id, type: 'DEPOSIT' },
            orderBy: { createdAt: 'desc' }
        });
        expect(ledgers.length).toBeGreaterThan(0);
        const lastDeposit = ledgers[0];
        // Find offset entry
        const offsetEntries = await prisma.ledger.findMany({
            where: { transactionId: lastDeposit.transactionId, type: 'DEPOSIT_OFFSET' }
        });
        expect(offsetEntries.length).toBe(1);
        expect(offsetEntries[0].amount).toBe(-lastDeposit.amount);
    });
    it('Atomic Stakes: Lock funds for match', async () => {
        // Lock 100 GHS
        await walletService.lockFunds(userId, 100, 'match-123');
        const res = await request(app.getHttpServer())
            .get('/wallet/balance')
            .set('Authorization', `Bearer ${userToken}`)
            .expect(200);
        // 210 - 100 = 110 available, 100 locked
        expect(res.body.available).toBe(110);
        expect(res.body.locked).toBe(100);
    });
    it('Atomic Stakes: Fail if insufficient funds', async () => {
        await expect(walletService.lockFunds(userId, 500, 'match-456')).rejects.toThrow('Insufficient funds');
    });
    it('Process Payout: Winner receives funds, System receives commission', async () => {
        // Pot = 100 (locked above). 
        // 10% commission = 10 GHS
        // 90% winner = 90 GHS
        // Winner used to have 110 avail, 100 locked.
        // After Payout: 110 + 90 = 200 avail, 0 locked.
        await walletService.processPayout('match-123', userId, [], 100);
        const res = await request(app.getHttpServer())
            .get('/wallet/balance')
            .set('Authorization', `Bearer ${userToken}`)
            .expect(200);
        expect(res.body.available).toBe(200);
        expect(res.body.locked).toBe(0);
        // Verify System Commission
        const systemUser = await prisma.user.findUnique({
            where: { email: 'system@pottagame.com' },
            include: { wallet: true }
        });
        expect(systemUser?.wallet?.availableBalance).toBeGreaterThanOrEqual(10);
    });
});
