import { AdminService } from './src/admin/admin.service';
import { WalletService } from './src/wallet/wallet.service';
import { PrismaService } from './src/prisma/prisma.service';
import * as dotenv from 'dotenv';
dotenv.config();
async function runReconcileTest() {
    console.log('--- Starting Admin Reconciliation Verification ---');
    console.log('Initializing DB Connection...');
    const prisma = new PrismaService();
    await prisma.$connect();
    const walletService = new WalletService(prisma, {});
    const adminService = new AdminService(prisma, walletService);
    try {
        // 1. Setup: Create System User & Wallet if not exists
        const systemEmail = 'system@pottagame.com';
        let systemUser = await prisma.user.findUnique({ where: { email: systemEmail } });
        if (!systemUser) {
            systemUser = await prisma.user.create({
                data: { email: systemEmail, password: 'hash', referralCode: 'SYS', role: 'ADMIN' }
            });
            await prisma.wallet.create({ data: { userId: systemUser.id, availableBalance: 1000 } }); // Grant 1k profit
            console.log('Created System User & Wallet (1000 GHS).');
        }
        else {
            await prisma.wallet.updateMany({
                where: { userId: systemUser.id },
                data: { availableBalance: 1000, lockedBalance: 0 }
            });
            console.log('Reset System Wallet to 1000 GHS.');
        }
        // 2. Setup Users with Liabilities
        const u1 = await prisma.user.create({ data: { email: `rec1_${Date.now()}@test.com`, password: 'hash', referralCode: `R1_${Date.now()}` } });
        await prisma.wallet.create({ data: { userId: u1.id, availableBalance: 100, lockedBalance: 50 } }); // 150 Liability
        console.log(`Created User ${u1.id}: 100 Avail + 50 Locked = 150 Liability.`);
        // 3. Run Reconcile
        const report = await adminService.reconcile();
        console.log('Reconciliation Report:', JSON.stringify(report, null, 2));
        // 4. Validation
        // We expect System Balance = 1000
        // We expect Total Liabilities to AT LEAST includes our new user (150). 
        // Note: DB might have other junk from previous tests, so we check "at least".
        if (Number(report.systemBalance) !== 1000) {
            throw new Error(`FAILURE: System Balance mismatch. Expected 1000, got ${report.systemBalance}`);
        }
        if (Number(report.totalLiabilities) < 150) {
            throw new Error(`FAILURE: Total Liabilities (${report.totalLiabilities}) is less than created user liability (150).`);
        }
        // Check if report includes our user specifically? 
        // The service aggregates ALL users.
        console.log('SUCCESS: Reconciliation logic aggregates funds correctly.');
    }
    catch (error) {
        console.error('Test Failed:', error);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
runReconcileTest();
