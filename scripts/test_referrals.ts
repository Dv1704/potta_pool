import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { WalletService } from '../src/wallet/wallet.service.js';
import { UsersService } from '../src/users/users.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { GameService } from '../src/game/services/game.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import bcrypt from 'bcrypt';
import axios from 'axios';

// Mock Axios POST calls (just in case Resendwelcome is triggered by authService.register)
const originalPost = axios.post;
axios.post = async (url: string, data?: any, config?: any): Promise<any> => {
    if (url.includes('api.resend.com')) {
        console.log(`   [Mock Network Call] Mocking POST request to: ${url}`);
        return { data: { id: 'mock-email-id-123' } };
    }
    return originalPost(url, data, config);
};

async function bootstrap() {
    console.log('Initializing application context...');
    const app = await NestFactory.createApplicationContext(AppModule);
    const walletService = app.get(WalletService);
    const usersService = app.get(UsersService);
    const prisma = app.get(PrismaService);
    const gameService = app.get(GameService);
    const authService = app.get(AuthService);

    const suffix = Math.random().toString(36).substring(7);
    const influencerEmail = `influencer_${suffix}@example.com`;
    const hashedPassword = await bcrypt.hash('password123', 10);

    const createdUsers: string[] = [];

    // 1. Create Influencer
    console.log(`\n1. Creating test Influencer: ${influencerEmail}`);
    const influencer = await prisma.user.create({
        data: {
            email: influencerEmail,
            password: hashedPassword,
            name: 'Influencer B',
            referralCode: `INF-${suffix.toUpperCase()}`,
            role: 'INFLUENCER',
            wallet: { create: {} }
        }
    });
    createdUsers.push(influencer.id);
    console.log(`   Created influencer with unique referral code: ${influencer.referralCode}`);

    // 2. Register referred User A
    const userAEmail = `user_a_${suffix}@example.com`;
    console.log(`\n2. Registering referred User A with code ${influencer.referralCode}: ${userAEmail}`);
    const userAResult = await authService.register({
        email: userAEmail,
        password: 'password123',
        name: 'Referred User A',
        referralCode: influencer.referralCode
    });
    createdUsers.push(userAResult.id);

    // Verify linkage in database
    const userA = await prisma.user.findUnique({
        where: { id: userAResult.id },
        include: { referredBy: true }
    });
    console.log(`   User A referredById in DB: ${userA?.referredById}`);
    if (userA?.referredById !== influencer.id) {
        throw new Error('User A referredById should match Influencer ID');
    }

    // Verify influencer referrals list
    const infRefRes = await prisma.user.findUnique({
        where: { id: influencer.id },
        include: { referrals: true }
    });
    console.log(`   Influencer referral count: ${infRefRes?.referrals.length}`);
    if (infRefRes?.referrals.length !== 1) {
        throw new Error('Influencer referrals list should contain exactly 1 user');
    }

    // 3. Verify Tier Progression Logic
    console.log(`\n3. Verifying tier progression by registering 5 more referred users...`);
    for (let i = 1; i <= 5; i++) {
        const email = `referred_${i}_${suffix}@example.com`;
        const res = await authService.register({
            email,
            password: 'password123',
            name: `Referred User ${i}`,
            referralCode: influencer.referralCode
        });
        createdUsers.push(res.id);
    }

    const updatedInfluencer = await prisma.user.findUnique({
        where: { id: influencer.id },
        include: { referrals: true }
    });
    console.log(`   Updated Influencer referral count: ${updatedInfluencer?.referrals.length}`);
    console.log(`   Influencer creatorTier in DB: ${updatedInfluencer?.creatorTier}`);
    console.log(`   Influencer role in DB: ${updatedInfluencer?.role}`);
    console.log(`   Influencer isVerified in DB: ${updatedInfluencer?.isVerified}`);

    if (updatedInfluencer?.creatorTier !== 'SILVER') {
        throw new Error(`Influencer tier should be SILVER for 6 referrals, found: ${updatedInfluencer?.creatorTier}`);
    }
    if (updatedInfluencer?.isVerified !== true) {
        throw new Error('Influencer should be automatically verified upon reaching SILVER tier');
    }

    // 4. Verify Game Payout Commission Flow
    console.log(`\n4. Simulating game payout commission flow...`);
    // Create an opponent User C
    const userCEmail = `user_c_${suffix}@example.com`;
    const userC = await prisma.user.create({
        data: {
            email: userCEmail,
            password: hashedPassword,
            name: 'User C Opponent',
            referralCode: `OPP-${suffix.toUpperCase()}`,
            wallet: { create: {} }
        }
    });
    createdUsers.push(userC.id);

    // Deposit 100 GHS to both User A and User C
    await walletService.deposit(userA.id, 100, 'GHS');
    await walletService.deposit(userC.id, 100, 'GHS');

    const balA = await walletService.getBalance(userA.id);
    const balC = await walletService.getBalance(userC.id);
    console.log(`   Deposited 100 GHS. User A balance: ${balA.available} GHS, User C balance: ${balC.available} GHS`);

    const gameId = `game_ref_test_${suffix}`;
    console.log(`   Creating game ${gameId} with players User A (${userA.id}) and User C (${userC.id}), stake = 50 GHS...`);
    await gameService.createGame(gameId, [userA.id, userC.id], 'speed', 50);

    // Verify game's influencerId got attached automatically
    const game = await prisma.game.findUnique({ where: { id: gameId } });
    console.log(`   Game influencerId in DB: ${game?.influencerId}`);
    if (game?.influencerId !== influencer.id) {
        throw new Error('Game influencerId should have been set to Influencer ID');
    }

    // Resolve the game with User A as winner
    console.log(`   Ending game with User A as winner...`);
    // Manually force game to finished & set winner in Redis state so endGame processes the payout
    const state = {
        modeType: 'speed',
        stake: 50,
        players: [userA.id, userC.id],
        data: {
            turnIndex: 0,
            turnExpiration: Date.now() + 60000,
            isGameOver: true,
            isGameStarted: true,
            winner: userA.id,
            balls: {}
        }
    };
    await (gameService as any).redis.set((gameService as any).getGameKey(gameId), JSON.stringify(state));

    // Simulate endGame logic
    await gameService.endGame(gameId);

    // Check balances
    const winnerBal = await walletService.getBalance(userA.id);
    const loserBal = await walletService.getBalance(userC.id);
    console.log(`   Winner User A balance: ${winnerBal.available} GHS (expected: 50 locked + 90 winnings = 140)`);
    console.log(`   Loser User C balance: ${loserBal.available} GHS (expected: 50 GHS)`);

    if (winnerBal.available !== 140) {
        throw new Error(`Winner balance should be 140, found: ${winnerBal.available}`);
    }
    if (loserBal.available !== 50) {
        throw new Error(`Loser balance should be 50, found: ${loserBal.available}`);
    }

    // Check influencer wallet commission
    const infBal = await walletService.getBalance(influencer.id);
    console.log(`   Influencer balance: ${infBal.available} GHS (expected: 10 platform fee * 25% SILVER rate = 2.5 GHS)`);
    if (infBal.available !== 2.5) {
        throw new Error(`Influencer balance should be 2.5 GHS, found: ${infBal.available}`);
    }

    // Check recorded InfluencerEarning
    const earning = await prisma.influencerEarning.findUnique({
        where: { matchId: gameId }
    });
    console.log(`   InfluencerEarning amount: ${earning?.amount} GHS, platformFee: ${earning?.platformFee} GHS`);
    if (!earning || Number(earning.amount) !== 2.5 || Number(earning.platformFee) !== 10) {
        throw new Error('Invalid InfluencerEarning entry recorded');
    }

    // Check ledger records
    const ledgers = await prisma.ledger.findMany({
        where: { referenceId: gameId }
    });
    console.log(`   Ledger rows count for game: ${ledgers.length}`);
    const commissionLedger = ledgers.find(l => l.type === 'INFLUENCER_COMMISSION');
    console.log(`   Commission Ledger entry:`, commissionLedger?.amount, commissionLedger?.description);
    if (!commissionLedger || Number(commissionLedger.amount) !== 2.5) {
        throw new Error('Ledger should contain a credit entry of 2.5 GHS for INFLUENCER_COMMISSION');
    }

    console.log('\n======================================================');
    console.log('✅ Referral and Influencer Commission Test Passed Successfully!');
    console.log('======================================================');

    // Cleanup
    console.log('\nCleaning up all test users and associated data...');
    // Delete ledgers
    const wallets = await prisma.wallet.findMany({
        where: { userId: { in: createdUsers } }
    });
    const walletIds = wallets.map(w => w.id);
    await prisma.ledger.deleteMany({ where: { walletId: { in: walletIds } } });
    // Delete wallets
    await prisma.wallet.deleteMany({ where: { userId: { in: createdUsers } } });
    // Delete influencer payouts
    await prisma.influencerEarning.deleteMany({ where: { influencerId: { in: createdUsers } } });
    // Delete game
    await prisma.game.deleteMany({ where: { id: gameId } });
    // Delete users
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    console.log('Cleanup completed successfully.');

    await app.close();
}

bootstrap().catch(err => {
    console.error('❌ Integration flow test failed:', err);
    process.exit(1);
});
