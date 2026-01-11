import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from './src/generated/client/client.js';

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m'
};

function log(msg: string, color = colors.reset) {
    console.log(`${color}${msg}${colors.reset}`);
}

async function testTimeoutMechanism() {
    console.log('\n' + '='.repeat(70));
    log('🧪 TESTING GAME TIMEOUT & CLEANUP MECHANISM', colors.cyan);
    console.log('='.repeat(70));

    try {
        // Get an existing user
        const user = await prisma.user.findFirst();
        if (!user) {
            log('❌ No users in database. Please create a user first.', colors.red);
            return;
        }

        const userId = user.id;
        log(`\n✅ Using test user: ${user.email}`, colors.green);
        log(`   User ID: ${userId}`, colors.cyan);

        // Check/create wallet
        let wallet = await prisma.wallet.findUnique({ where: { userId } });
        if (!wallet) {
            wallet = await prisma.wallet.create({
                data: { userId, availableBalance: new Prisma.Decimal(1000) }
            });
            log('✅ Created wallet with 1000 GHS', colors.green);
        } else if (Number(wallet.availableBalance) < 100) {
            await prisma.wallet.update({
                where: { userId },
                data: { availableBalance: new Prisma.Decimal(1000) }
            });
            log('✅ Funded wallet to 1000 GHS', colors.green);
        }

        log(`\n💰 Wallet Balance:`, colors.cyan);
        log(`   Available: ${wallet.availableBalance} GHS`);
        log(`   Locked: ${wallet.lockedBalance} GHS`);

        // Create a test game that expires in 10 seconds (for faster testing)
        const gameId = `test_timeout_${Date.now()}`;
        const stake = 50;
        const expiresAt = new Date(Date.now() + 10000); // 10 seconds from now
        const crashPoint = 2.5;

        log(`\n📝 Creating test Aviator game...`, colors.yellow);
        const game = await prisma.game.create({
            data: {
                id: gameId,
                mode: 'speed',
                stake: new Prisma.Decimal(stake),
                status: 'ACTIVE',
                players: [userId],
                crashPoint: new Prisma.Decimal(crashPoint),
                expiresAt: expiresAt
            }
        });

        log(`✅ Game created!`, colors.green);
        log(`   Game ID: ${game.id}`);
        log(`   Stake: ${game.stake} GHS`);
        log(`   Crash Point: ${game.crashPoint}x (secret)`);
        log(`   Expires At: ${game.expiresAt?.toLocaleTimeString()}`);

        // Lock the funds
        await prisma.wallet.update({
            where: { userId },
            data: {
                availableBalance: { decrement: new Prisma.Decimal(stake) },
                lockedBalance: { increment: new Prisma.Decimal(stake) }
            }
        });

        const walletAfterLock = await prisma.wallet.findUnique({ where: { userId } });
        log(`\n🔒 Funds locked!`, colors.yellow);
        log(`   Available: ${walletAfterLock?.availableBalance} GHS`);
        log(`   Locked: ${walletAfterLock?.lockedBalance} GHS`);

        // Wait for expiry + cron cycle
        log(`\n⏳ Waiting 75 seconds for:`, colors.yellow);
        log(`   1. Game to expire (10s)`);
        log(`   2. Cron job to run (next minute mark)`);
        log(`   3. Cleanup to complete`);

        for (let i = 75; i > 0; i--) {
            const gameCheck = await prisma.game.findUnique({ where: { id: gameId } });
            if (gameCheck?.status !== 'ACTIVE') {
                log(`\n\n🎉 Game status changed to: ${gameCheck?.status}`, colors.green);
                break;
            }

            process.stdout.write(`\r   ${i}s remaining... (Status: ${gameCheck?.status})    `);
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Check every 5 seconds
            if (i % 5 === 0) {
                const currentGame = await prisma.game.findUnique({ where: { id: gameId } });
                const currentWallet = await prisma.wallet.findUnique({ where: { userId } });
                const now = new Date();
                const expired = currentGame?.expiresAt && now > currentGame.expiresAt;

                if (i % 15 === 0) {
                    process.stdout.write(`\r   ${i}s | Status: ${currentGame?.status} | Expired: ${expired} | Locked: ${currentWallet?.lockedBalance} GHS   \n`);
                }
            }
        }

        console.log('\n');

        // Check final state
        const finalGame = await prisma.game.findUnique({ where: { id: gameId } });
        const finalWallet = await prisma.wallet.findUnique({ where: { userId } });

        log(`\n📊 FINAL RESULTS:`, colors.cyan);
        log('─'.repeat(70));

        log(`\nGame Status: ${finalGame?.status}`,
            finalGame?.status === 'CANCELLED_BY_TIMEOUT' ? colors.green : colors.red);

        if (finalGame?.status === 'CANCELLED_BY_TIMEOUT') {
            log('✅ SUCCESS: Game was cancelled by timeout!', colors.green);
        } else {
            log(`⚠️  Game status is: ${finalGame?.status}`, colors.yellow);
            log('   (May need to wait for next cron cycle)', colors.yellow);
        }

        log(`\nWallet Status:`, colors.cyan);
        log(`   Available: ${finalWallet?.availableBalance} GHS`);
        log(`   Locked: ${finalWallet?.lockedBalance} GHS`);

        const lockedBefore = Number(walletAfterLock?.lockedBalance || 0);
        const lockedAfter = Number(finalWallet?.lockedBalance || 0);

        if (lockedAfter < lockedBefore) {
            log('✅ SUCCESS: Locked funds were refunded!', colors.green);
            log(`   Refunded: ${lockedBefore - lockedAfter} GHS`, colors.green);
        } else if (finalGame?.status === 'CANCELLED_BY_TIMEOUT') {
            log('⚠️  Funds not yet refunded (processing delay)', colors.yellow);
        } else {
            log('⚠️  Locked funds not refunded yet', colors.yellow);
        }

        // Summary
        log(`\n${'='.repeat(70)}`, colors.cyan);
        log('TEST SUMMARY:', colors.cyan);
        log('─'.repeat(70));

        const checks = [
            { name: 'Game expired', pass: finalGame?.expiresAt && new Date() > finalGame.expiresAt },
            { name: 'Status changed to CANCELLED_BY_TIMEOUT', pass: finalGame?.status === 'CANCELLED_BY_TIMEOUT' },
            { name: 'Locked funds reduced', pass: lockedAfter < lockedBefore },
        ];

        checks.forEach(check => {
            const icon = check.pass ? '✅' : '❌';
            const color = check.pass ? colors.green : colors.red;
            log(`${icon} ${check.name}`, color);
        });

        const allPassed = checks.every(c => c.pass);

        log(`\n${'='.repeat(70)}`);
        if (allPassed) {
            log('🎉 ALL CHECKS PASSED! Timeout mechanism is working!', colors.green);
        } else {
            log('⚠️  Some checks failed. The cron job may need more time.', colors.yellow);
            log('   Run this test again or check server logs for GameCleanupService', colors.yellow);
        }
        log('='.repeat(70) + '\n');

    } catch (error: any) {
        log(`\n❌ Test error: ${error.message}`, colors.red);
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

log('\n🚀 Starting timeout mechanism test...\n');
testTimeoutMechanism();
