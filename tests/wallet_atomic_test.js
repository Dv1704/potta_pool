const { WalletService } = require('../src/services/WalletService.js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const walletService = new WalletService();

async function testAtomicLock() {
    console.log("Starting Atomic Lock Test...");

    const userId = "test_user_atomic_" + Date.now();

    // 1. Create User with EXACTLY 50.00
    await prisma.user.create({
        data: {
            id: userId,
            email: userId + "@test.com",
            wallet: {
                create: { availableBalance: 50.00, lockedBalance: 0 }
            }
        }
    });

    // 2. Simulate 2 Concurrent Requests for 50.00
    // Theoretically only ONE should succeed.

    const req1 = walletService.lockFunds(userId, 50.00, "match_1");
    const req2 = walletService.lockFunds(userId, 50.00, "match_2");

    const results = await Promise.allSettled([req1, req2]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    console.log(`Fulfilled: ${fulfilled.length}, Rejected: ${rejected.length}`);

    // 3. Verify Database State
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    console.log("Final Wallet State:", wallet);

    if (fulfilled.length === 1 && wallet.lockedBalance === 50.00 && wallet.availableBalance === 0) {
        console.log("PASS: Exact atomic lock enforced.");
    } else {
        console.error("FAIL: Inconsistent state or double spend.");
        process.exit(1);
    }
}

testAtomicLock()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
