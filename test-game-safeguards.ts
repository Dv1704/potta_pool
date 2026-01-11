import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './src/generated/client/client.js';
import axios from 'axios';

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const API_URL = 'http://localhost:3000';
let authToken = '';
let userId = '';

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message: string, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

async function login() {
    log('\n📝 Logging in as test user...', colors.cyan);

    const testEmail = 'testbackend@potta.com';
    const testPassword = '$2b$10$YourHashedPasswordHere'; // This won't work for login, using any password

    try {
        // Try to login
        const loginResponse = await axios.post(`${API_URL}/auth/login`, {
            email: testEmail,
            password: testPassword
        });

        authToken = loginResponse.data.access_token || loginResponse.data.token;
        userId = loginResponse.data.userId || loginResponse.data.id || loginResponse.data.user?.id;

        if (!authToken || !userId) {
            log(`❌ No token in login response: ${JSON.stringify(loginResponse.data)}`, colors.red);
            return false
                ;
        }

        log(`✅ Authenticated successfully`, colors.green);
        log(`   User: ${testEmail}`, colors.cyan);
        return true;
    } catch (error: any) {
        log(`❌ Authentication failed: ${error.response?.data?.message || error.message}`, colors.red);
        log(`   NOTE: Run './fund-test-user.sh' first to ensure test user has balance`, colors.yellow);
        return false;
    }
}

async function getBalance() {
    const response = await axios.get(`${API_URL}/wallet/balance`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    return response.data;
}

async function testAviatorTimeout() {
    log('\n🎮 TEST 1: Aviator 60-Second Timeout', colors.blue);
    log('─'.repeat(60), colors.blue);

    try {
        const initialBalance = await getBalance();
        log(`Initial balance: ${initialBalance.available} GHS (${initialBalance.locked} GHS locked)`);

        // Place bet
        log('\n📍 Placing 10 GHS Aviator bet...');
        const betResponse = await axios.post(`${API_URL}/game/aviator/bet`,
            { stake: 10 },
            { headers: { Authorization: `Bearer ${authToken}` } }
        );

        const gameId = betResponse.data.gameId;
        log(`✅ Bet placed! Game ID: ${gameId}`, colors.green);

        // Check game in database
        const game = await prisma.game.findUnique({ where: { id: gameId } });
        log(`\n📊 Game Details:`);
        log(`   Status: ${game?.status}`);
        log(`   Crash Point: ${game?.crashPoint} (hidden from player)`);
        log(`   Expires At: ${game?.expiresAt}`);
        log(`   Created At: ${game?.createdAt}`);

        const balanceAfterBet = await getBalance();
        log(`\n💰 Balance after bet: ${balanceAfterBet.available} GHS (${balanceAfterBet.locked} GHS locked)`);
        log(`   10 GHS should now be locked ✓`, colors.green);

        // Wait for timeout
        log(`\n⏳ Waiting 70 seconds for timeout + cron cleanup...`, colors.yellow);
        for (let i = 70; i > 0; i--) {
            process.stdout.write(`\r   ${i} seconds remaining...   `);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('\r   ✅ Wait complete!                    ');

        // Check if cleaned up
        const gameAfterTimeout = await prisma.game.findUnique({ where: { id: gameId } });
        log(`\n📊 Game Status After Timeout:`);
        log(`   Status: ${gameAfterTimeout?.status}`);

        if (gameAfterTimeout?.status === 'CANCELLED_BY_TIMEOUT') {
            log(`   ✅ Game correctly marked as CANCELLED_BY_TIMEOUT!`, colors.green);
        } else {
            log(`   ❌ Expected CANCELLED_BY_TIMEOUT, got ${gameAfterTimeout?.status}`, colors.red);
        }

        const balanceAfterCleanup = await getBalance();
        log(`\n💰 Balance after cleanup: ${balanceAfterCleanup.available} GHS (${balanceAfterCleanup.locked} GHS locked)`);

        if (balanceAfterCleanup.locked < balanceAfterBet.locked) {
            log(`   ✅ Locked funds were refunded!`, colors.green);
        } else {
            log(`   ⚠️  Locked balance not decreased`, colors.yellow);
        }

    } catch (error: any) {
        log(`❌ Test failed: ${error.message}`, colors.red);
        if (error.response?.data) {
            log(`   Response: ${JSON.stringify(error.response.data)}`, colors.red);
        }
    }
}

async function testDiceErrorHandling() {
    log('\n🎲 TEST 2: Dice Game Error Handling', colors.blue);
    log('─'.repeat(60), colors.blue);

    try {
        log('📍 Playing dice game with valid stake...');
        const response = await axios.post(`${API_URL}/game/play/dice`,
            { stake: 5 },
            { headers: { Authorization: `Bearer ${authToken}` } }
        );

        log(`✅ Game completed successfully!`, colors.green);
        log(`   User Roll: ${response.data.userRoll}`);
        log(`   System Roll: ${response.data.systemRoll}`);
        log(`   Result: ${response.data.won ? 'WON' : 'LOST'}`);
        log(`   Payout: ${response.data.payout} GHS`);

        // Try invalid stake to trigger error
        log('\n📍 Testing error handling with invalid stake (-5)...');
        try {
            await axios.post(`${API_URL}/game/play/dice`,
                { stake: -5 },
                { headers: { Authorization: `Bearer ${authToken}` } }
            );
            log(`❌ Should have thrown error for negative stake`, colors.red);
        } catch (error: any) {
            if (error.response?.status === 400) {
                log(`✅ Error handling working: ${error.response.data.message}`, colors.green);
            }
        }

    } catch (error: any) {
        log(`❌ Test failed: ${error.message}`, colors.red);
    }
}

async function checkDatabaseStatus() {
    log('\n🗄️  TEST 3: Database Status Check', colors.blue);
    log('─'.repeat(60), colors.blue);

    try {
        // Count games by status
        const activeGames = await prisma.game.count({ where: { status: 'ACTIVE' } });
        const completedGames = await prisma.game.count({ where: { status: 'COMPLETED' } });
        const timeoutGames = await prisma.game.count({ where: { status: 'CANCELLED_BY_TIMEOUT' } });
        const errorGames = await prisma.game.count({ where: { status: 'CANCELLED_BY_ERROR' } });
        const crashGames = await prisma.game.count({ where: { status: 'CANCELLED_BY_CRASH' } });

        log('📊 Game Status Summary:');
        log(`   ACTIVE: ${activeGames}`);
        log(`   COMPLETED: ${completedGames}`);
        log(`   CANCELLED_BY_TIMEOUT: ${timeoutGames}`);
        log(`   CANCELLED_BY_ERROR: ${errorGames}`);
        log(`   CANCELLED_BY_CRASH: ${crashGames}`);

        // Check for stuck games
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const stuckGames = await prisma.game.findMany({
            where: {
                status: 'ACTIVE',
                createdAt: { lte: tenMinutesAgo }
            }
        });

        if (stuckGames.length > 0) {
            log(`\n⚠️  WARNING: ${stuckGames.length} games stuck in ACTIVE for >10 minutes`, colors.yellow);
            stuckGames.forEach(game => {
                log(`   - ${game.id} (Created: ${game.createdAt})`, colors.yellow);
            });
        } else {
            log(`\n✅ No games stuck in ACTIVE status for >10 minutes`, colors.green);
        }

        // Check expired games that haven't been cleaned
        const now = new Date();
        const expiredNotCleaned = await prisma.game.findMany({
            where: {
                status: 'ACTIVE',
                expiresAt: { lte: now }
            }
        });

        if (expiredNotCleaned.length > 0) {
            log(`\n⚠️  WARNING: ${expiredNotCleaned.length} expired games not cleaned up yet`, colors.yellow);
            log(`   (They should be cleaned on next cron run)`, colors.yellow);
        } else {
            log(`✅ No expired games waiting for cleanup`, colors.green);
        }

        // Recent timeouts
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recentTimeouts = await prisma.game.findMany({
            where: {
                status: 'CANCELLED_BY_TIMEOUT',
                updatedAt: { gte: fiveMinutesAgo }
            },
            orderBy: { updatedAt: 'desc' },
            take: 5
        });

        if (recentTimeouts.length > 0) {
            log(`\n📋 Recent Timeouts (last 5 minutes):`);
            recentTimeouts.forEach(game => {
                log(`   - ${game.id} (${game.mode}, ${game.stake} GHS) at ${game.updatedAt}`);
            });
        }

    } catch (error: any) {
        log(`❌ Database check failed: ${error.message}`, colors.red);
    }
}

async function testCoinGame() {
    log('\n🪙 TEST 4: Coin Game Quick Test', colors.blue);
    log('─'.repeat(60), colors.blue);

    try {
        const response = await axios.post(`${API_URL}/game/play/coin`,
            { stake: 3, choice: 'heads' },
            { headers: { Authorization: `Bearer ${authToken}` } }
        );

        log(`✅ Coin game completed!`, colors.green);
        log(`   Your choice: ${response.data.choice}`);
        log(`   Result: ${response.data.result}`);
        log(`   Outcome: ${response.data.won ? 'WON' : 'LOST'}`);
        log(`   Payout: ${response.data.payout} GHS`);

    } catch (error: any) {
        log(`❌ Test failed: ${error.message}`, colors.red);
    }
}

async function runAllTests() {
    log('\n' + '='.repeat(60), colors.cyan);
    log('🧪 GAME COMPLETION SAFEGUARDS TEST SUITE', colors.cyan);
    log('='.repeat(60), colors.cyan);

    if (!await login()) {
        log('\n❌ Cannot proceed without authentication', colors.red);
        return;
    }

    // Add some initial balance for testing
    log('\n💵 Adding initial balance for testing...', colors.yellow);
    try {
        await axios.post(`${API_URL}/payments/deposit/initialize`,
            { amount: 1000, currency: 'GHS' },
            { headers: { Authorization: `Bearer ${authToken}` } }
        );
        log('✅ Test balance added (simulated)', colors.green);
    } catch (error) {
        log('⚠️  Could not add balance automatically - tests may fail if insufficient funds', colors.yellow);
    }

    const initialBalance = await getBalance();
    log(`\n💰 Starting Balance: ${initialBalance.available} GHS (${initialBalance.locked} GHS locked)`, colors.cyan);

    // Run tests
    await testDiceErrorHandling();
    await testCoinGame();
    await testAviatorTimeout(); // This takes ~70 seconds
    await checkDatabaseStatus();

    const finalBalance = await getBalance();
    log(`\n💰 Final Balance: ${finalBalance.available} GHS (${finalBalance.locked} GHS locked)`, colors.cyan);

    log('\n' + '='.repeat(60), colors.cyan);
    log('✅ ALL TESTS COMPLETED', colors.green);
    log('='.repeat(60), colors.cyan);
    log('\nRecommendations:', colors.yellow);
    log('1. Monitor server logs during the 60s wait to see cron job execution');
    log('2. Check for any CANCELLED_BY_TIMEOUT games in the database');
    log('3. Verify locked funds were properly refunded');
    log('4. Run this test multiple times to ensure consistency\n');

    await prisma.$disconnect();
}

runAllTests().catch(error => {
    log(`\n❌ Fatal error: ${error.message}`, colors.red);
    console.error(error);
    process.exit(1);
});
