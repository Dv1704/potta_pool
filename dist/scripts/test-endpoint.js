import { PaymentController } from '../src/wallet/payment.controller.js';
import { PaymentService } from '../src/wallet/payment.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { WalletService } from '../src/wallet/wallet.service.js';
import { FXService } from '../src/wallet/fx.service.js';
import { AdminService } from '../src/admin/admin.service.js';
import * as dotenv from 'dotenv';
dotenv.config();
const prisma = new PrismaService();
async function runTest() {
    console.log('--- Setting up Test Environment ---');
    // Create a temporary user
    const email = `endpoint_test_${Date.now()}@example.com`;
    const user = await prisma.user.create({
        data: {
            email,
            password: 'hash',
            name: 'Endpoint Tester',
            role: 'USER',
            referralCode: `TEST_${Date.now()}`,
            wallet: { create: { availableBalance: 0, lockedBalance: 0, currency: 'GHS' } }
        },
        include: { wallet: true }
    });
    console.log(`Created User: ${user.email} (ID: ${user.id}) | Balance: ${user.wallet?.availableBalance}`);
    // Manually instantiate dependencies (faster than Test.createTestingModule for this script)
    const config = new ConfigService();
    const fx = new FXService();
    const walletService = new WalletService(prisma, fx);
    const admin = new AdminService(prisma, walletService);
    const paymentService = new PaymentService(prisma, config, walletService, fx, admin);
    const paymentController = new PaymentController(paymentService);
    console.log('--- Calling PaymentController.verifyDeposit("REF_TEST_123") ---');
    try {
        // Calling the endpoint method directly
        // Note: The controller implementation usually extracts userId from @User() decorator.
        // My previous edit to PaymentController added verifyDeposit which likely calls paymentService.verifyTransaction(ref, user.id)
        // I need to check the exact signature of verifyDeposit in the controller.
        // Correct signature based on file view: verifyTransaction(req, reference)
        // req is expected to have .user.id
        const mockReq = { user: { id: user.id } };
        const result = await paymentController.verifyTransaction(mockReq, 'REF_TEST_123');
        console.log('Endpoint Result:', result);
    }
    catch (error) {
        console.error('Endpoint Error:', error.message);
    }
    // Verify DB
    console.log('--- Verifying Database Update ---');
    const freshWallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    console.log(`Final Balance: ${freshWallet?.availableBalance} GHS`);
    if (freshWallet?.availableBalance.toNumber() === 50) {
        console.log('✅ SUCCESS: Controller triggered Service which updated Database.');
    }
    else {
        console.log('❌ FAILURE: Balance did not update.');
    }
}
runTest()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
