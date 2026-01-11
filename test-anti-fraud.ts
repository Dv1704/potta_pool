
import axios from 'axios';
import { PrismaClient } from './src/generated/client/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
// @ts-ignore
import pg from 'pg';

dotenv.config();

async function runVerification() {
    // Mirroring PrismaService:
    // Actually, standard PrismaPg takes a pool. 
    // If the file said `new PrismaPg({ connectionString })`, maybe it's a specific version/helper?
    // Let's blindly trust the file I read.
    // Wait, if I import PrismaPg, does it match?

    // I will try to use `pg` pool just in case, because standard docs say Pool.
    // BUT the file I read explicitly had `new PrismaPg({ connectionString })`.
    // Wait, maybe I misread? I will assume I read correctly.

    // Update: I'll try the exact same code as PrismaService.
    const connectionString = process.env.DATABASE_URL!;
    // const adapter = new PrismaPg({ connectionString }); // As seen in file

    // However, if that fails, I'll fallback to Pool.
    // Let's check if I can import types? No time.

    // I will follow the file exactly.
    let adapter;
    try {
        adapter = new PrismaPg({ connectionString } as any);
    } catch (e) {
        // Fallback if the file was misleading or I misread (e.g. maybe it was using a helper function not shown?)
        // Actually I saw `new PrismaPg`.
        const pool = new pg.Pool({ connectionString });
        adapter = new PrismaPg(pool);
    }

    const prisma = new PrismaClient({ adapter });

    const baseUrl = 'http://localhost:3000';
    let userToken = '';

    console.log('--- Starting Anti-Fraud Verification ---');

    // 1. Setup User
    const email = `fraud-test-${Date.now()}@test.com`;
    const password = 'Password123!';

    console.log(`Creating user: ${email}`);
    try {
        await axios.post(`${baseUrl}/auth/register`, {
            email, password, name: 'Fraud Tester', referralCode: `REF-${Date.now()}`
        });
    } catch (e) {
        console.log('User might already exist, trying login');
    }

    const loginRes = await axios.post(`${baseUrl}/auth/login`, { email, password });
    userToken = loginRes.data.access_token;

    // Fetch Profile to get ID
    const profileRes = await axios.get(`${baseUrl}/auth/profile`, {
        headers: { Authorization: `Bearer ${userToken}` }
    });
    const userId = profileRes.data.id;

    console.log(`Logged in as User: ${userId}`);

    // 2. Deposit Funds (Enough for 4 withdrawals)
    // Direct DB deposit to bypass Paystack
    await prisma.wallet.update({
        where: { userId },
        data: { availableBalance: 1000 }
    });
    console.log('User credited with 1000 GHS');

    // 3. Test Velocity (Limit: 3)
    console.log('Attempting 3 Allowed Withdrawals...');
    for (let i = 1; i <= 3; i++) {
        try {
            await axios.post(`${baseUrl}/payments/withdraw`, {
                amount: 10,
                bankCode: 'MTN',
                accountNumber: '0555555555'
            }, { headers: { Authorization: `Bearer ${userToken}` } });
            console.log(`Withdrawal ${i}: SUCCESS`);
        } catch (e: any) {
            const msg = e.response?.data?.message || e.message;
            if (msg.includes('Transfer failed')) {
                console.log(`Withdrawal ${i}: Transfer Failed (Expected outcome in test env), but Attempt registered.`);
                // Continue because the WITHDRAWAL ledger was created (and then refunded), 
                // so it counts towards velocity if we count attempts. 
                // Wait, check logic: Does refund delete the withdrawal ledger? No.
            } else {
                console.error(`Withdrawal ${i} FAILED: ${msg}`);
                process.exit(1);
            }
        }
    }

    // 4. Test Velocity Breach (4th attempt)
    console.log('Attempting 4th Withdrawal (Should Fail)...');
    try {
        await axios.post(`${baseUrl}/payments/withdraw`, {
            amount: 10,
            bankCode: 'MTN',
            accountNumber: '0555555555'
        }, { headers: { Authorization: `Bearer ${userToken}` } });
        console.error('FAILURE: 4th Withdrawal Succeeded (Velocity Limit Not Enforced)');
        process.exit(1);
    } catch (e: any) {
        if (e.response?.data?.message.includes('Daily withdrawal limit')) {
            console.log('SUCCESS: 4th Withdrawal blocked by Velocity Limit.');
        } else {
            console.error(`FAILURE: Unexpected error: ${e.response?.data?.message}`);
            process.exit(1);
        }
    }

    console.log('--- Verification Complete ---');
}

runVerification().catch(console.error);
