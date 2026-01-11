import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './src/generated/client/client.js';
const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
async function monitorGames() {
    console.clear();
    console.log('🎮 GAME MONITORING DASHBOARD');
    console.log('='.repeat(60));
    console.log(`Updated: ${new Date().toLocaleTimeString()}`);
    console.log('='.repeat(60));
    // Status breakdown
    const statuses = await prisma.game.groupBy({
        by: ['status'],
        _count: true
    });
    console.log('\n📊 GAME STATUS BREAKDOWN:');
    statuses.forEach(s => {
        const icon = s.status === 'ACTIVE' ? '🟢' :
            s.status === 'COMPLETED' ? '✅' :
                s.status === 'CANCELLED_BY_TIMEOUT' ? '⏱️' :
                    s.status === 'CANCELLED_BY_ERROR' ? '❌' :
                        s.status === 'CANCELLED_BY_CRASH' ? '💥' : '⚪';
        console.log(`   ${icon} ${s.status.padEnd(25)}: ${s._count}`);
    });
    // Active games
    const activeGames = await prisma.game.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 10
    });
    console.log(`\n🟢 ACTIVE GAMES (${activeGames.length}):`);
    if (activeGames.length === 0) {
        console.log('   No active games');
    }
    else {
        activeGames.forEach(game => {
            const age = Math.floor((Date.now() - game.createdAt.getTime()) / 1000);
            const expiresIn = game.expiresAt
                ? Math.floor((game.expiresAt.getTime() - Date.now()) / 1000)
                : null;
            console.log(`   - ${game.id.substring(0, 20)}... (${game.mode})`);
            console.log(`     Age: ${age}s | Expires in: ${expiresIn !== null ? expiresIn + 's' : 'N/A'} | Stake: ${game.stake} GHS`);
        });
    }
    // Expired but not cleaned
    const now = new Date();
    const expiredGames = await prisma.game.findMany({
        where: {
            status: 'ACTIVE',
            expiresAt: { lte: now }
        }
    });
    if (expiredGames.length > 0) {
        console.log(`\n⚠️  EXPIRED GAMES AWAITING CLEANUP: ${expiredGames.length}`);
        expiredGames.forEach(game => {
            const overdue = Math.floor((Date.now() - game.expiresAt.getTime()) / 1000);
            console.log(`   - ${game.id.substring(0, 20)}... (overdue by ${overdue}s)`);
        });
    }
    // Recent timeouts (last 5 minutes)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentTimeouts = await prisma.game.count({
        where: {
            status: 'CANCELLED_BY_TIMEOUT',
            updatedAt: { gte: fiveMinAgo }
        }
    });
    console.log(`\n⏱️  TIMEOUTS IN LAST 5 MINUTES: ${recentTimeouts}`);
    // Recent errors (last 5 minutes)
    const recentErrors = await prisma.game.count({
        where: {
            status: 'CANCELLED_BY_ERROR',
            updatedAt: { gte: fiveMinAgo }
        }
    });
    console.log(`❌ ERRORS IN LAST 5 MINUTES: ${recentErrors}`);
    // Stuck games check
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const stuckGames = await prisma.game.count({
        where: {
            status: 'ACTIVE',
            createdAt: { lte: tenMinAgo }
        }
    });
    if (stuckGames > 0) {
        console.log(`\n🚨 WARNING: ${stuckGames} games stuck >10 minutes!`);
    }
    else {
        console.log(`\n✅ No stuck games detected`);
    }
    console.log('\n' + '='.repeat(60));
    console.log('Press Ctrl+C to stop monitoring');
}
// Run monitoring every 5 seconds
console.log('Starting game monitoring...\n');
setInterval(async () => {
    try {
        await monitorGames();
    }
    catch (error) {
        console.error('Error:', error.message);
    }
}, 5000);
// Initial run
monitorGames().catch(console.error);
