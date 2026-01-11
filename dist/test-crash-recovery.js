import { Redis } from 'ioredis';
import { PrismaPg } from '@prisma/adapter-pg';
import { GameService } from './src/game/services/game.service';
import { WalletService } from './src/wallet/wallet.service';
import { PrismaService } from './src/prisma/prisma.service';
import * as dotenv from 'dotenv';
// @ts-ignore
import pg from 'pg';
dotenv.config();
async function runCrashRecoveryTest() {
    console.log('--- Starting Crash Recovery Verification ---');
    console.log('Initializing DB Connection...');
    const connectionString = process.env.DATABASE_URL || 'postgresql://victor:deevictor@localhost:5432/potta?schema=public';
    const pool = new pg.Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaService(); // Assuming PrismaService (extends Client) accepts adapter?
    // PrismaService defined in src/prisma/prisma.service.ts uses process.env.DATABASE_URL inside constructor.
    // It creates its own adapter.
    // So `new PrismaService()` should work if env is set.
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    await prisma.$connect();
    const walletService = new WalletService(prisma, {});
    const gameService = new GameService(walletService, prisma, redis);
    try {
        // 1. Setup: Create 2 Players
        const p1Email = `crash1_${Date.now()}@test.com`;
        const p2Email = `crash2_${Date.now()}@test.com`;
        const p1 = await prisma.user.create({ data: { email: p1Email, password: 'hash', referralCode: `C1_${Date.now()}` } });
        const p2 = await prisma.user.create({ data: { email: p2Email, password: 'hash', referralCode: `C2_${Date.now()}` } });
        // Credit Wallets
        await prisma.wallet.create({ data: { userId: p1.id, availableBalance: 100 } });
        await prisma.wallet.create({ data: { userId: p2.id, availableBalance: 100 } });
        console.log(`Created Users: ${p1.id}, ${p2.id} with 100 GHS each.`);
        // 2. Simulate "Pre-Crash" State
        // Create a Game in DB that is ACTIVE, and pretend funds were locked.
        // We have to manually Lock their funds first to simulate the state properly.
        const stake = 50;
        const gameId = `crash_game_${Date.now()}`;
        // Lock funds manually (replicating what createGame does)
        await walletService.lockFundsForMatch([p1.id, p2.id], stake, gameId);
        // Check balances are locked
        const w1 = await prisma.wallet.findUnique({ where: { userId: p1.id } });
        const w2 = await prisma.wallet.findUnique({ where: { userId: p2.id } });
        console.log(`Pre-Crash Balances: User1 Available: ${w1?.availableBalance} Locked: ${w1?.lockedBalance}`);
        if (Number(w1?.lockedBalance) !== 50 || Number(w2?.lockedBalance) !== 50) {
            throw new Error('Setup Failed: Funds not locked correctly.');
        }
        // Create the Game record (ACTIVE)
        await prisma.game.create({
            data: {
                id: gameId,
                mode: 'speed',
                stake: stake,
                players: [p1.id, p2.id],
                status: 'ACTIVE'
            }
        });
        console.log('Game created with status ACTIVE.');
        // 3. Trigger Crash Recovery (Simulate Server Restart)
        console.log('Simulating Server Restart (Calling onModuleInit)...');
        await gameService.onModuleInit();
        // 4. Verify Results
        const updatedGame = await prisma.game.findUnique({ where: { id: gameId } });
        console.log(`Post-Recovery Game Status: ${updatedGame?.status}`);
        if (updatedGame?.status !== 'CANCELLED_BY_CRASH') {
            throw new Error('FAILURE: Game status was not updated to CANCELLED_BY_CRASH');
        }
        const w1Final = await prisma.wallet.findUnique({ where: { userId: p1.id } });
        const w2Final = await prisma.wallet.findUnique({ where: { userId: p2.id } });
        console.log(`Final Balances: User1 Available: ${w1Final?.availableBalance} Locked: ${w1Final?.lockedBalance}`);
        if (Number(w1Final?.lockedBalance) !== 0 || Number(w1Final?.availableBalance) !== 100) {
            throw new Error('FAILURE: User 1 funds not refunded correctly.');
        }
        console.log('SUCCESS: Game cancelled and funds refunded automatically.');
    }
    catch (error) {
        console.error('Test Failed:', error);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
runCrashRecoveryTest();
