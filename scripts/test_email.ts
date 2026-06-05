import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { EmailService } from '../src/email/email.service.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function bootstrap() {
    console.log('Initializing NestJS application context...');
    const app = await NestFactory.createApplicationContext(AppModule);
    const emailService = app.get(EmailService);

    const recipients = ['victorolanikanju@gmail.com', 'Pottagames1@gmail.com'];

    for (const recipient of recipients) {
        console.log(`\n======================================================`);
        console.log(`📧 Dispatched test emails flow to ${recipient}`);
        console.log(`======================================================`);

        // 1. Welcome Email
        console.log(`\n1. Welcome Email (from hello@playpotta.com)`);
        try {
            const res = await emailService.sendWelcomeEmail(recipient, 'Potta Champion');
            console.log('   ✅ Dispatched:', res);
        } catch (e: any) {
            console.error('   ❌ Failed:', e.message || e);
        }

        // 2. Verification Code Email
        console.log(`\n2. Verification Code Email (from security@playpotta.com)`);
        try {
            const res = await emailService.sendVerificationCodeEmail(recipient, 'Potta Champion', '483920');
            console.log('   ✅ Dispatched:', res);
        } catch (e: any) {
            console.error('   ❌ Failed:', e.message || e);
        }

        // 3. Password Reset Email
        console.log(`\n3. Password Reset Email (from security@playpotta.com)`);
        try {
            const res = await emailService.sendPasswordResetEmail(recipient, 'RST-9284-XYZ');
            console.log('   ✅ Dispatched:', res);
        } catch (e: any) {
            console.error('   ❌ Failed:', e.message || e);
        }

        // 4. Transfer 2FA Email
        console.log(`\n4. Transfer 2FA Email (from security@playpotta.com)`);
        try {
            const res = await emailService.sendTransfer2faEmail(recipient, 'Potta Champion', 250, 'OpponentUser', '881023');
            console.log('   ✅ Dispatched:', res);
        } catch (e: any) {
            console.error('   ❌ Failed:', e.message || e);
        }

        // 5. Withdrawal 2FA Email
        console.log(`\n5. Withdrawal 2FA Email (from security@playpotta.com)`);
        try {
            const res = await emailService.sendWithdrawal2faEmail(recipient, 'Potta Champion', 500, '0549998887', '773091');
            console.log('   ✅ Dispatched:', res);
        } catch (e: any) {
            console.error('   ❌ Failed:', e.message || e);
        }
    }

    await app.close();
    console.log('\nApplication context closed.');
}

bootstrap().catch((err) => {
    console.error('Fatal initialization error:', err);
    process.exit(1);
});
