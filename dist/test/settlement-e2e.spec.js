import { Test } from '@nestjs/testing';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { WalletService } from './../src/wallet/wallet.service.js';
describe('Financial Settlement & Atomic Ledger (E2E)', () => {
    let app;
    let prisma;
    let walletService;
    let user1Id;
    let user2Id;
    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
        prisma = app.get(PrismaService);
        walletService = app.get(WalletService);
        // Cleanup
        await prisma.user.deleteMany({ where: { email: { in: ['u1@test.com', 'u2@test.com'] } } });
        // Create test users
        const u1 = await prisma.user.create({ data: { email: 'u1@test.com', password: 'password', referralCode: 'REF_U1', wallet: { create: { availableBalance: 50 } } } });
        const u2 = await prisma.user.create({ data: { email: 'u2@test.com', password: 'password', referralCode: 'REF_U2', wallet: { create: { availableBalance: 50 } } } });
        user1Id = u1.id;
        user2Id = u2.id;
    });
    afterAll(async () => {
        await prisma.user.deleteMany({ where: { email: { in: ['u1@test.com', 'u2@test.com'] } } });
        await app.close();
    });
    it('Atomic Match Locking: Should succeed if both have enough funds', async () => {
        const matchId = 'atomic-success-1';
        await walletService.lockFundsForMatch([user1Id, user2Id], 50, matchId);
        const w1 = await prisma.wallet.findUnique({ where: { userId: user1Id } });
        const w2 = await prisma.wallet.findUnique({ where: { userId: user2Id } });
        expect(w1?.availableBalance).toBe(0);
        expect(w1?.lockedBalance).toBe(50);
        expect(w2?.availableBalance).toBe(0);
        expect(w2?.lockedBalance).toBe(50);
        // Verification of Ledgers
        const ledgers = await prisma.ledger.findMany({ where: { referenceId: matchId, type: 'LOCK' } });
        expect(ledgers.length).toBe(2);
        expect(ledgers[0].transactionId).toBe(ledgers[1].transactionId);
    });
    it('Atomic Match Locking: Should fail and rollback if one lacks funds', async () => {
        // Reset balances
        await prisma.wallet.update({ where: { userId: user1Id }, data: { availableBalance: 50, lockedBalance: 0 } });
        await prisma.wallet.update({ where: { userId: user2Id }, data: { availableBalance: 49.99, lockedBalance: 0 } });
        const matchId = 'atomic-fail-1';
        await expect(walletService.lockFundsForMatch([user1Id, user2Id], 50, matchId)).rejects.toThrow('Insufficient funds');
        // Verify rollback: Player 1 should still have 50 (not partially locked)
        const w1 = await prisma.wallet.findUnique({ where: { userId: user1Id } });
        const w2 = await prisma.wallet.findUnique({ where: { userId: user2Id } });
        expect(w1?.availableBalance).toBe(50);
        expect(w1?.lockedBalance).toBe(0);
        expect(w2?.availableBalance).toBe(49.99);
    });
    it('Payout Settlement: 90/10 Split and Double-Entry Verification', async () => {
        const matchId = 'payout-test-1';
        const stake = 100;
        // Setup initial state: both have 100 locked
        await prisma.wallet.update({ where: { userId: user1Id }, data: { availableBalance: 0, lockedBalance: stake } });
        await prisma.wallet.update({ where: { userId: user2Id }, data: { availableBalance: 0, lockedBalance: stake } });
        const totalPot = stake * 2; // 200
        await walletService.processPayout(matchId, user1Id, [user2Id], totalPot);
        const winner = await prisma.wallet.findUnique({ where: { userId: user1Id } });
        const loser = await prisma.wallet.findUnique({ where: { userId: user2Id } });
        // Total Pot = 200
        // Commission (10%) = 20
        // Winner (90%) = 180
        // Loser = 0
        expect(winner?.availableBalance).toBe(180);
        expect(winner?.lockedBalance).toBe(0);
        expect(loser?.availableBalance).toBe(0);
        expect(loser?.lockedBalance).toBe(0);
        const systemUser = await prisma.user.findUnique({ where: { email: 'system@pottagame.com' }, include: { wallet: true } });
        expect(systemUser?.wallet?.availableBalance).toBeGreaterThanOrEqual(20);
        // Ledger check
        const payoutLedger = await prisma.ledger.findFirst({ where: { referenceId: matchId, type: 'PAYOUT' } });
        const commissionLedger = await prisma.ledger.findFirst({ where: { referenceId: matchId, type: 'COMMISSION' } });
        expect(payoutLedger?.amount).toBe(180);
        expect(commissionLedger?.amount).toBe(20);
        expect(payoutLedger?.transactionId).toBe(commissionLedger?.transactionId);
    });
});
