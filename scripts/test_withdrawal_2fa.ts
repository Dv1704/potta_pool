import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { PaymentService } from '../src/wallet/payment.service.js';
import { WalletService } from '../src/wallet/wallet.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import bcrypt from 'bcrypt';
import axios from 'axios';

// Mock Axios calls for Paystack and Resend to run this test completely offline & isolated
const originalPost = axios.post;
axios.post = async (url: string, data?: any, config?: any): Promise<any> => {
    if (url.includes('api.paystack.co') || url.includes('api.resend.com')) {
        console.log(`   [Mock Network Call] Mocking POST request to: ${url}`);
        return {
            data: {
                status: true,
                message: 'Success',
                data: {
                    id: 'mock-id-12345',
                    reference: 'mock-ref-12345',
                    status: 'success',
                    recipient_code: 'RCP_mockrecipient123'
                }
            }
        };
    }
    return originalPost(url, data, config);
};

async function bootstrap() {
    console.log('Initializing application context...');
    const app = await NestFactory.createApplicationContext(AppModule);
    const paymentService = app.get(PaymentService);
    const walletService = app.get(WalletService);
    const prisma = app.get(PrismaService);

    const testEmail = `withdraw_test_${Math.random().toString(36).substring(7)}@example.com`;
    const hashedPassword = await bcrypt.hash('password123', 10);

    console.log(`\n1. Creating test user: ${testEmail}`);
    const user = await prisma.user.create({
        data: {
            email: testEmail,
            password: hashedPassword,
            name: 'Withdrawal 2FA Tester',
            referralCode: `W2FA-${Math.random().toString(36).substring(7).toUpperCase()}`,
            wallet: { create: {} }
        }
    });

    // Verify initial wallet balance is 0
    let balance = await walletService.getBalance(user.id);
    console.log(`   Initial balance: ${balance.available} GHS`);
    if (balance.available !== 0) {
        throw new Error('Initial wallet balance should be 0');
    }

    // Attempting withdrawal with insufficient funds
    console.log('\n2. Attempting withdrawal of 50 GHS with empty wallet...');
    try {
        await paymentService.initiateUserWithdrawal(user.id, 50, 'MTN', '0540001112');
        throw new Error('Withdrawal should have failed with Insufficient funds');
    } catch (e: any) {
        console.log(`   ✅ Expected Failure: ${e.message}`);
        if (!e.message.includes('Insufficient funds')) {
            throw e;
        }
    }

    // Deposit funds
    console.log('\n3. Depositing 200 GHS to test user wallet...');
    await walletService.deposit(user.id, 200, 'GHS');
    balance = await walletService.getBalance(user.id);
    console.log(`   New balance: ${balance.available} GHS`);
    if (balance.available !== 200) {
        throw new Error('Wallet balance should be 200 GHS');
    }

    // Initiate withdrawal
    console.log('\n4. Initiating withdrawal of 80 GHS...');
    const initResult = await paymentService.initiateUserWithdrawal(user.id, 80, 'MTN', '0540001112');
    console.log('   Response result:', initResult);
    if (initResult.requires2FA !== true || !initResult.sessionId) {
        throw new Error('Failed to initiate withdrawal: requires2FA should be true and sessionId should be returned');
    }

    // Intercept code from internal map cache
    const codesMap = (paymentService as any).withdrawalCodes;
    const sessionData = codesMap.get(initResult.sessionId);
    console.log('   Intercepted 6-digit withdrawal code from backend cache:', sessionData.code);
    if (!sessionData.code || sessionData.code.length !== 6) {
        throw new Error('Invalid code generated');
    }

    // Confirm withdrawal with invalid code
    console.log('\n5. Confirming withdrawal with incorrect verification code...');
    try {
        await paymentService.confirmUserWithdrawal(user.id, initResult.sessionId, '000000');
        throw new Error('Withdrawal confirmation should have failed with invalid code');
    } catch (e: any) {
        console.log(`   ✅ Expected Failure: ${e.message}`);
        if (!e.message.includes('Invalid confirmation code')) {
            throw e;
        }
    }

    // Confirm withdrawal with correct code
    console.log('\n6. Confirming withdrawal with correct verification code...');
    const confirmResult = await paymentService.confirmUserWithdrawal(user.id, initResult.sessionId, sessionData.code);
    console.log('   Confirmation response result:', confirmResult);

    // Verify wallet balance is deducted
    balance = await walletService.getBalance(user.id);
    console.log(`   Balance after withdrawal: ${balance.available} GHS`);
    if (balance.available !== 120) {
        throw new Error(`Wallet balance should be 120 GHS (200 - 80), found: ${balance.available}`);
    }

    // Verify that session is consumed and deleted
    const sessionPostCheck = codesMap.get(initResult.sessionId);
    console.log(`   Session state in map after consumption:`, sessionPostCheck);
    if (sessionPostCheck) {
        throw new Error('Session should have been deleted from memory cache after successful confirmation');
    }

    console.log('\n======================================================');
    console.log('✅ Withdrawal 2FA Integration Flow Test Passed Successfully!');
    console.log('======================================================');

    // Cleanup test user
    console.log('\nCleaning up test user data...');
    const walletRecord = await prisma.wallet.findUnique({ where: { userId: user.id } });
    if (walletRecord) {
        // Delete ledger entries and wallet record
        await prisma.ledger.deleteMany({ where: { walletId: walletRecord.id } });
        await prisma.wallet.delete({ where: { id: walletRecord.id } });
    }
    await prisma.user.delete({ where: { id: user.id } });
    console.log('Cleanup completed.');

    await app.close();
}

bootstrap().catch(err => {
    console.error('❌ Integration flow test failed:', err);
    process.exit(1);
});
