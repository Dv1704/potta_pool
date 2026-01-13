import pkg from './src/generated/client/index.js';
const { PrismaClient } = pkg;
import { io } from 'socket.io-client';

const prisma = new PrismaClient();
const BASE_URL = 'https://potta-pool-api-muddy-night-3627.fly.dev';

console.log('🧪 Real User Matchmaking Test\n');

async function createTestUsers() {
    console.log('1️⃣ Creating test users with wallets...');

    try {
        // Create or get test user 1
        const user1 = await prisma.user.upsert({
            where: { email: 'test-match-1@example.com' },
            update: {},
            create: {
                email: 'test-match-1@example.com',
                name: 'TestPlayer1',
                password: 'hashed_password_placeholder',
                role: 'USER'
            }
        });

        // Create or get test user 2
        const user2 = await prisma.user.upsert({
            where: { email: 'test-match-2@example.com' },
            update: {},
            create: {
                email: 'test-match-2@example.com',
                name: 'TestPlayer2',
                password: 'hashed_password_placeholder',
                role: 'USER'
            }
        });

        // Ensure wallets exist with sufficient balance
        await prisma.wallet.upsert({
            where: { userId: user1.id },
            update: { availableBalance: 1000, lockedBalance: 0 },
            create: {
                userId: user1.id,
                availableBalance: 1000,
                lockedBalance: 0,
                currency: 'GHS'
            }
        });

        await prisma.wallet.upsert({
            where: { userId: user2.id },
            update: { availableBalance: 1000, lockedBalance: 0 },
            create: {
                userId: user2.id,
                availableBalance: 1000,
                lockedBalance: 0,
                currency: 'GHS'
            }
        });

        console.log(`   ✅ User 1: ${user1.id} (${user1.email})`);
        console.log(`   ✅ User 2: ${user2.id} (${user2.email})`);
        console.log(`   ✅ Both wallets funded with 1000 GHS\n`);

        return { user1, user2 };
    } catch (error) {
        console.error('   ❌ Error creating users:', error.message);
        throw error;
    }
}

function testMatchmaking(user1Id, user2Id, stake1, stake2) {
    return new Promise((resolve) => {
        console.log(`2️⃣ Testing matchmaking: ${stake1} vs ${stake2}\n`);

        let player1Socket, player2Socket;
        let matchFound = false;
        let timeout;
        let player1Matched = false;
        let player2Matched = false;

        // Player 1 Socket
        player1Socket = io(BASE_URL, {
            transports: ['websocket'],
            reconnection: false,
            auth: { userId: user1Id }
        });

        // Player 2 Socket
        player2Socket = io(BASE_URL, {
            transports: ['websocket'],
            reconnection: false,
            auth: { userId: user2Id }
        });

        // Player 1 handlers
        player1Socket.on('connect', () => {
            console.log('   🔵 Player 1 connected');
            console.log(`   🔵 Player 1 joining queue with stake ${stake1}...`);
            player1Socket.emit('joinQueue', {
                userId: user1Id,
                stake: stake1,
                mode: 'speed'
            });
        });

        player1Socket.on('matchFound', (data) => {
            console.log('   ✅ Player 1 received matchFound event!');
            console.log(`      Game ID: ${data.gameId}`);
            console.log(`      Opponent: ${data.opponentId}`);
            player1Matched = true;
            if (player2Matched || !matchFound) {
                matchFound = true;
                cleanup(true, data);
            }
        });

        player1Socket.on('error', (err) => {
            console.log(`   ❌ Player 1 error: ${err.message || JSON.stringify(err)}`);
        });

        player1Socket.on('connect_error', (err) => {
            console.log(`   ❌ Player 1 connection error: ${err.message}`);
            cleanup(false);
        });

        // Player 2 handlers
        player2Socket.on('connect', () => {
            console.log('   🟢 Player 2 connected');
            // Delay to ensure Player 1 joins first
            setTimeout(() => {
                console.log(`   🟢 Player 2 joining queue with stake ${stake2}...`);
                player2Socket.emit('joinQueue', {
                    userId: user2Id,
                    stake: stake2,
                    mode: 'speed'
                });
            }, 1000);
        });

        player2Socket.on('matchFound', (data) => {
            console.log('   ✅ Player 2 received matchFound event!');
            console.log(`      Game ID: ${data.gameId}`);
            console.log(`      Opponent: ${data.opponentId}`);
            player2Matched = true;
            if (player1Matched || !matchFound) {
                matchFound = true;
                cleanup(true, data);
            }
        });

        player2Socket.on('error', (err) => {
            console.log(`   ❌ Player 2 error: ${err.message || JSON.stringify(err)}`);
        });

        player2Socket.on('connect_error', (err) => {
            console.log(`   ❌ Player 2 connection error: ${err.message}`);
            cleanup(false);
        });

        // Timeout
        timeout = setTimeout(() => {
            if (!matchFound) {
                console.log('   ❌ NO MATCH after 20 seconds');
                console.log(`   Player 1 matched: ${player1Matched}`);
                console.log(`   Player 2 matched: ${player2Matched}`);
                cleanup(false);
            }
        }, 20000);

        function cleanup(success, matchData = null) {
            clearTimeout(timeout);
            if (player1Socket) player1Socket.disconnect();
            if (player2Socket) player2Socket.disconnect();
            resolve({ success, matchData, player1Matched, player2Matched });
        }
    });
}

async function runTest() {
    try {
        const { user1, user2 } = await createTestUsers();

        // Test 1: Same stake (should match immediately)
        console.log('='.repeat(60));
        console.log('TEST 1: Same Stake (10 vs 10)');
        console.log('='.repeat(60));
        const result1 = await testMatchmaking(user1.id, user2.id, 10, 10);

        console.log('\n' + '='.repeat(60));
        if (result1.success) {
            console.log('✅ TEST 1 PASSED: Players matched successfully!');
        } else {
            console.log('❌ TEST 1 FAILED: Players did not match');
        }
        console.log('='.repeat(60));

        // Wait before next test
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Test 2: Different stakes in same bracket (10 vs 13)
        console.log('\n' + '='.repeat(60));
        console.log('TEST 2: Different Stakes Same Bracket (10 vs 13)');
        console.log('='.repeat(60));
        const result2 = await testMatchmaking(user1.id, user2.id, 10, 13);

        console.log('\n' + '='.repeat(60));
        if (result2.success) {
            console.log('✅ TEST 2 PASSED: Players matched successfully!');
        } else {
            console.log('❌ TEST 2 FAILED: Players did not match');
        }
        console.log('='.repeat(60));

        // Cleanup
        await prisma.$disconnect();

        if (result1.success && result2.success) {
            console.log('\n🎉 All tests passed!');
            process.exit(0);
        } else {
            console.log('\n⚠️  Some tests failed');
            process.exit(1);
        }
    } catch (error) {
        console.error('\n❌ Test failed with error:', error);
        await prisma.$disconnect();
        process.exit(1);
    }
}

runTest();
