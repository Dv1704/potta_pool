import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { UsersService } from '../src/users/users.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import bcrypt from 'bcrypt';

async function bootstrap() {
    console.log('Initializing application context...');
    const app = await NestFactory.createApplicationContext(AppModule);
    const usersService = app.get(UsersService);
    const prisma = app.get(PrismaService);

    const testEmail = `verify_test_${Math.random().toString(36).substring(7)}@example.com`;
    const hashedPassword = await bcrypt.hash('password123', 10);

    console.log(`Creating test user: ${testEmail}`);
    const user = await prisma.user.create({
        data: {
            email: testEmail,
            password: hashedPassword,
            name: 'Verification Test User',
            referralCode: `TEST-${Math.random().toString(36).substring(7).toUpperCase()}`,
            wallet: { create: {} }
        }
    });

    console.log(`Initial emailVerified state: ${user.emailVerified}`);
    if (user.emailVerified) {
        throw new Error('User emailVerified should initially be false');
    }

    console.log('Generating and sending verification code...');
    const sendResult = await usersService.generateAndSendVerificationCode(user.id, user.email);
    console.log('Session ID generated:', sendResult.sessionId);

    // Retrieve the code directly from the internal map
    const codesMap = (usersService as any).verificationCodes;
    const sessionData = codesMap.get(sendResult.sessionId);
    console.log('Intercepted verification code from service cache:', sessionData.code);

    console.log('Confirming verification code...');
    const updatedUser = await usersService.verifyEmailCode(user.id, sendResult.sessionId, sessionData.code);

    console.log(`Final emailVerified state: ${updatedUser.emailVerified}`);
    if (updatedUser.emailVerified !== true) {
        throw new Error('Email verification failed: status is not true');
    }

    console.log('✅ E2E Email Verification Flow Test Passed Successfully!');

    // Cleanup test user
    // First delete ledger entries if any (none expected) then user wallet then user
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    if (wallet) {
        await prisma.wallet.delete({ where: { id: wallet.id } });
    }
    await prisma.user.delete({ where: { id: user.id } });
    console.log('Test user cleanup completed.');

    await app.close();
}

bootstrap().catch(err => {
    console.error('❌ E2E test failed:', err);
    process.exit(1);
});
