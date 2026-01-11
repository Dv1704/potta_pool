import { PaymentService } from '../src/wallet/payment.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { WalletService } from '../src/wallet/wallet.service.js';
import { FXService } from '../src/wallet/fx.service.js';
import { AdminService } from '../src/admin/admin.service.js';
import * as dotenv from 'dotenv';
dotenv.config();
// Mock dependencies
const prisma = new PrismaService();
const config = new ConfigService();
const fx = new FXService();
const admin = new AdminService(prisma);
const wallet = new WalletService(prisma, fx);
const payment = new PaymentService(prisma, config, wallet, fx, admin);
async function checkRef(ref, userId) {
    console.log(`Checking Ref: ${ref} for User: ${userId}`);
    try {
        const res = await payment.verifyTransaction(ref, userId);
        console.log('Result:', res);
    }
    catch (e) {
        console.error('Error:', e.message);
        if (e.response)
            console.error('Response:', e.response.data);
    }
}
// Hardcoded for test - replace with args if needed, but for now just setup structure
// Usage: npx tsx scripts/verify-ref.ts <ref> <userId>
const args = process.argv.slice(2);
if (args.length >= 2) {
    checkRef(args[0], args[1]);
}
else {
    console.log('Usage: npx tsx scripts/verify-ref.ts <reference> <userId>');
}
