
import { PrismaClient } from '@prisma/client';
import { gameRecoveryService } from '../src/services/GameRecoveryService.js';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function runTest() {
    console.log(">>> Crash Recovery Test <<<");

    // 1. Setup Phase: Create 2 Users and Simulate an Active Game
    const user1 = await prisma.user.create({ data: { email: `p1_${Date.now()}@test.com` }, include: { wallet: true } }); // Auto creates wallet? If schema handles it?
    // User creation might not auto-create wallet depending on schema logic? 
    // Schema says: wallet Wallet? (Optional relation). So we must create it.
    await prisma.wallet.create({ data: { userId: user1.id, availableBalance: 0, lockedBalance: 50 } });

    const user2 = await prisma.user.create({ data: { email: `p2_${Date.now()}@test.com` } });
    await prisma.wallet.create({ data: { userId: user2.id, availableBalance: 0, lockedBalance: 50 } });

    console.log(`Created Users: ${user1.id}, ${user2.id} with 50 Locked Balance each.`);

    // Create an "ACTIVE" game manually (Simulate it was running when server died)
    const gameId = uuidv4();
    await prisma.game.create({
        data: {
            id: gameId,
            player1Id: user1.id,
            player2Id: user2.id,
            stake: 50.0,
            status: 'ACTIVE',
            lastActivity: new Date(Date.now() - 60000) // 1 min ago
        }
    });
    console.log(`Simulated Active Game ${gameId} created.`);

    // 2. Execution Phase: Run Recovery
    console.log("--- Simulating Server Restart (Running Recovery) ---");
    await gameRecoveryService.onBootstrap();

    // 3. Verification Phase
    const updatedGame = await prisma.game.findUnique({ where: { id: gameId } });
    const p1Wallet = await prisma.wallet.findUnique({ where: { userId: user1.id } });
    const p2Wallet = await prisma.wallet.findUnique({ where: { userId: user2.id } });

    console.log(`\nGame Status: ${updatedGame.status} (Expected: CANCELLED_BY_CRASH)`);
    console.log(`P1 Balance: Avail=${p1Wallet.availableBalance}, Locked=${p1Wallet.lockedBalance} (Expected: Avail=50, Locked=0)`);
    console.log(`P2 Balance: Avail=${p2Wallet.availableBalance}, Locked=${p2Wallet.lockedBalance} (Expected: Avail=50, Locked=0)`);

    let passed = true;
    if (updatedGame.status !== 'CANCELLED_BY_CRASH') passed = false;
    if (p1Wallet.availableBalance !== 50 || p1Wallet.lockedBalance !== 0) passed = false;
    if (p2Wallet.availableBalance !== 50 || p2Wallet.lockedBalance !== 0) passed = false;

    // Check Audit Logs
    const audits = await prisma.auditLog.findMany({ where: { details: { path: ['gameId'], equals: gameId } } });
    // Prisma JSON filter syntax is tricky. Let's just fetch recent audits
    const recentAudits = await prisma.auditLog.findMany({
        where: { action: 'GAME_RECOVERY_REFUND' },
        orderBy: { createdAt: 'desc' },
        take: 2
    });
    console.log(`Found ${recentAudits.length} restart recovery audit logs.`);
    if (recentAudits.length < 2) passed = false;

    if (passed) {
        console.log("\n>>> TEST PASSED <<<");
    } else {
        console.error("\n>>> TEST FAILED <<<");
        process.exit(1);
    }
}

runTest()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
