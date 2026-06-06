import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { UsersService } from '../src/users/users.service.js';
import { UsersController } from '../src/users/users.controller.js';
import { WalletService } from '../src/wallet/wallet.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import bcrypt from 'bcrypt';
import axios from 'axios';
import { BadRequestException } from '@nestjs/common';
// Mock Axios POST calls (just in case Resend welcome is triggered by authService.register)
const originalPost = axios.post;
axios.post = async (url, data, config) => {
    if (url.includes('api.resend.com')) {
        console.log(`   [Mock Network Call] Mocking POST request to: ${url}`);
        return { data: { id: 'mock-email-id-999' } };
    }
    return originalPost(url, data, config);
};
async function bootstrap() {
    console.log('Initializing application context...');
    const app = await NestFactory.createApplicationContext(AppModule);
    const authService = app.get(AuthService);
    const usersService = app.get(UsersService);
    const usersController = new UsersController(usersService);
    const walletService = app.get(WalletService);
    const prisma = app.get(PrismaService);
    const suffix = Math.random().toString(36).substring(7);
    const emailB = `referrer_${suffix}@example.com`;
    const emailA = `referred_${suffix}@example.com`;
    const password = 'password123';
    const hashedPassword = await bcrypt.hash(password, 10);
    const createdUsers = [];
    // 1. Create Referrer (User B)
    console.log(`\n1. Creating Referrer User B: ${emailB}`);
    const userB = await prisma.user.create({
        data: {
            email: emailB,
            password: hashedPassword,
            name: 'Referrer User B',
            referralCode: `REF-${suffix.toUpperCase()}`,
            wallet: { create: {} }
        }
    });
    createdUsers.push(userB.id);
    console.log(`   User B referralCode: ${userB.referralCode}`);
    // 2. Register Referred User A with User B's referralCode (Referral Backcode Check)
    console.log(`\n2. Registering Referred User A passing code ${userB.referralCode}: ${emailA}`);
    const userARegResult = await authService.register({
        email: emailA,
        password: password,
        name: 'Referred User A',
        referralCode: userB.referralCode
    });
    createdUsers.push(userARegResult.id);
    // Verify linkage in database
    const dbUserA = await prisma.user.findUnique({
        where: { id: userARegResult.id },
        include: { referredBy: true }
    });
    console.log(`   User A referredById in DB: ${dbUserA?.referredById}`);
    if (dbUserA?.referredById !== userB.id) {
        throw new Error('User A referredById should match User B ID');
    }
    console.log('   ✅ Referral backcode successfully parsed, associated, and stored on the backend!');
    // 3. Test Authentication (Login)
    console.log(`\n3. Testing Login for User A...`);
    const loginResult = await authService.login(dbUserA);
    console.log(`   Token returned: ${loginResult.access_token ? 'Present' : 'Missing'}`);
    if (!loginResult.access_token) {
        throw new Error('Login should return a JWT access token');
    }
    // Try incorrect password on validateUser
    console.log(`   Testing Login with incorrect password...`);
    const invalidVal = await authService.validateUser(emailA, 'wrongPassword');
    console.log(`   Validation check result for wrong password:`, invalidVal);
    if (invalidVal !== null) {
        throw new Error('Validation should return null for incorrect password');
    }
    // 4. Test Profile Endpoint
    console.log(`\n4. Testing profile details request...`);
    const profile = await usersService.findById(userARegResult.id);
    console.log(`   Profile details:`, { id: profile?.id, name: profile?.name, email: profile?.email, referralCode: profile?.referralCode });
    if (profile?.email !== emailA || profile?.name !== 'Referred User A') {
        throw new Error('Profile fields do not match register values');
    }
    console.log(`\n5. Checking initial wallet balance for User A...`);
    console.log(`   userARegResult.id:`, userARegResult.id);
    console.log(`   userB.id:`, userB.id);
    const dbWalletA = await prisma.wallet.findUnique({ where: { userId: userARegResult.id } });
    const dbWalletB = await prisma.wallet.findUnique({ where: { userId: userB.id } });
    console.log(`   User A wallet in DB:`, dbWalletA);
    console.log(`   User B wallet in DB:`, dbWalletB);
    let bal = await walletService.getBalance(userARegResult.id);
    console.log(`   Initial balance bal:`, bal);
    if (bal.available !== 0) {
        throw new Error('Initial wallet balance must be 0 GHS');
    }
    console.log(`   Depositing 150 GHS...`);
    await walletService.deposit(userARegResult.id, 150, 'GHS');
    bal = await walletService.getBalance(userARegResult.id);
    console.log(`   Updated balance bal:`, bal);
    if (bal.available !== 150) {
        throw new Error(`Wallet balance should be 150 GHS, found: ${bal.available}`);
    }
    console.log(`   Querying wallet history...`);
    const history = await prisma.ledger.findMany({
        where: { walletId: dbWalletA.id }
    });
    console.log(`   History transactions count: ${history.length}`);
    // Filter User A's ledger entry specifically by walletId and type
    const userALedgers = history.filter(l => l.walletId === dbWalletA.id && l.type === 'DEPOSIT');
    console.log(`   User A Deposit ledgers:`, userALedgers);
    if (userALedgers.length !== 1 || Number(userALedgers[0].amount) !== 150) {
        throw new Error('History ledger entry for User A deposit is missing or invalid');
    }
    // 6. Test Account Updates (Branding Customization)
    console.log(`\n6. Testing Account Customization & Custom Room Branding...`);
    console.log(`   Attempting room branding updates on regular User A (Bronze)...`);
    try {
        await usersController.updateBranding({ user: { email: emailA } }, {
            headerText: 'Welcome to User A Room',
            accentColor: '#10B981'
        });
        throw new Error('updateBranding should have failed for non-Elite user A');
    }
    catch (e) {
        console.log(`   ✅ Expected Failure: ${e.message}`);
        if (!(e instanceof BadRequestException) || !e.message.includes('Only Elite tier creators')) {
            throw e;
        }
    }
    console.log(`   Promoting User B to role INFLUENCER and tier ELITE...`);
    await prisma.user.update({
        where: { id: userB.id },
        data: { role: 'INFLUENCER', creatorTier: 'ELITE' }
    });
    console.log(`   Re-attempting room branding updates on ELITE User B...`);
    const updateBrandingResult = await usersController.updateBranding({ user: { email: emailB } }, {
        headerText: 'Welcome to Victor Pro Lounge!',
        accentColor: '#8B5CF6'
    });
    console.log(`   Branding update result:`, { id: updateBrandingResult.id, customBranding: updateBrandingResult.customBranding });
    if (!updateBrandingResult.customBranding) {
        throw new Error('customBranding should be updated and defined');
    }
    const parsedBranding = JSON.parse(updateBrandingResult.customBranding);
    console.log(`   Parsed branding in DB:`, parsedBranding);
    if (parsedBranding.headerText !== 'Welcome to Victor Pro Lounge!' || parsedBranding.accentColor !== '#8B5CF6') {
        throw new Error('Branding updates did not save correctly in database');
    }
    console.log('   ✅ Custom room branding saved, validated, and restricted to Elite creators successfully!');
    console.log('\n======================================================');
    console.log('✅ Account Features and Referral Link Verification Passed!');
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
    // Delete users
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    console.log('Cleanup completed successfully.');
    await app.close();
}
bootstrap().catch(err => {
    console.error('❌ Integration flow test failed:', err);
    process.exit(1);
});
