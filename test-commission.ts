import { WalletService } from './src/wallet/wallet.service';
import { PrismaService } from './src/prisma/prisma.service';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { Prisma } from './src/generated/client/client';

async function testCommission() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const walletService = app.get(WalletService);
    const prisma = app.get(PrismaService);

    console.log("Setting up test users...");
    // Create or find test users
    const winner = await prisma.user.upsert({
        where: { email: 'winner@test.com' },
        update: {},
        create: {
            email: 'winner@test.com',
            password: 'hashedpassword',
            name: 'Winner',
            referralCode: 'WIN123',
            wallet: { create: { availableBalance: new Prisma.Decimal(100) } }
        },
        include: { wallet: true }
    });

    const loser = await prisma.user.upsert({
        where: { email: 'loser@test.com' },
        update: {},
        create: {
            email: 'loser@test.com',
            password: 'hashedpassword',
            name: 'Loser',
            referralCode: 'LOS123',
            wallet: { create: { availableBalance: new Prisma.Decimal(100) } }
        },
        include: { wallet: true }
    });

    const stake = 10;
    const totalPot = 20;

    console.log(`Locking ${stake} GHS for each player...`);
    await walletService.lockFundsForMatch([winner.id, loser.id], stake, 'test-match');

    const winnerBalBefore = await walletService.getBalance(winner.id);
    console.log("Winner Available Before Payout:", winnerBalBefore.available);

    console.log("Processing Payout...");
    const result = await walletService.processPayout('test-match', winner.id, [loser.id], totalPot);

    console.log("Payout Result:", result);

    // Total Pot is 20. 10% (Commission) = 2. 90% (Winner) = 18.
    // Winner staked 10. Locked balance was 10.
    // Payout should result in Winner getting 18 added to available (totaling 108 if started with 100 - 10 spent).

    const winnerBalAfter = await walletService.getBalance(winner.id);
    console.log("Winner Available After Payout:", winnerBalAfter.available);

    const systemUser = await prisma.user.findUnique({
        where: { email: 'system@pottagame.com' },
        include: { wallet: true }
    });
    console.log("System Wallet Balance:", systemUser?.wallet?.availableBalance.toNumber());

    if (result.commission === totalPot * 0.1) {
        console.log("✅ SUCCESS: System received 10% commission.");
    } else {
        console.log("❌ FAILURE: Commission mismatch.");
    }

    await app.close();
}

testCommission().catch(console.error);
