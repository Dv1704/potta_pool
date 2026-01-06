
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { paymentService } from '../src/services/PaymentService.js';
import { adminService } from '../src/services/AdminService.js';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function runTest() {
    console.log(">>> Security Shield Test <<<");

    // 1. Setup User
    const user = await prisma.user.create({
        data: { email: `shield_test_${Date.now()}@test.com` },
        include: { wallet: true }
    });
    // Ensure wallet exists/funded
    if (!user.wallet) {
        await prisma.wallet.create({ data: { userId: user.id, availableBalance: 100 } });
    } else {
        await prisma.wallet.update({ where: { userId: user.id }, data: { availableBalance: 100 } });
    }
    console.log(`Created User: ${user.id}`);


    // 2. Test: Active Game Lock
    console.log("\n--- Test 1: Active Game Withdrawal Block ---");
    const gameId = uuidv4();
    await prisma.game.create({
        data: {
            id: gameId,
            player1Id: user.id,
            player2Id: "mock_p2",
            stake: 10,
            status: 'ACTIVE'
        }
    });

    try {
        await paymentService.requestWithdrawal(user.id, 10);
        console.error("FAILED: Withdrawal allowed during Active Game!");
    } catch (e) {
        if (e.message.includes('ACTIVE game')) {
            console.log("PASSED: Withdrawal blocked by Active Game.");
        } else {
            console.error(`FAILED: Unexpected error: ${e.message}`);
        }
    }

    // Clean up game
    await prisma.game.update({ where: { id: gameId }, data: { status: 'COMPLETED' } });




    console.log("\n>>> ALL TESTS COMPLETE <<<");
}

runTest()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
