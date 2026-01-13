import { io } from 'socket.io-client';

const BASE_URL = 'https://potta-pool-api-muddy-night-3627.fly.dev';

console.log('🎮 Matchmaking Bracket Test\n');
console.log('Testing if different stakes match correctly...\n');

// Test scenarios
const testCases = [
    { player1: 5, player2: 8, shouldMatch: true, bracket: '1-10' },
    { player1: 10, player2: 13, shouldMatch: true, bracket: '10-20' },
    { player1: 15, player2: 19, shouldMatch: true, bracket: '10-20' },
    { player1: 45, player2: 50, shouldMatch: true, bracket: '20-100' },
    { player1: 20, player2: 95, shouldMatch: true, bracket: '20-100' },
    { player1: 9, player2: 11, shouldMatch: true, bracket: '1-10 + 10-20 (adjacent)' },
];

function simulateMatchmaking(stake1, stake2) {
    return new Promise((resolve) => {
        console.log(`\n📍 Testing: Player1(${stake1}) vs Player2(${stake2})`);

        let player1Socket, player2Socket;
        let matchFound = false;
        let timeout;

        // Create two socket connections
        player1Socket = io(BASE_URL, {
            transports: ['websocket'],
            reconnection: false,
            query: { userId: `test-player-1-${Date.now()}` }
        });

        player2Socket = io(BASE_URL, {
            transports: ['websocket'],
            reconnection: false,
            query: { userId: `test-player-2-${Date.now()}` }
        });

        // Player 1 handlers
        player1Socket.on('connect', () => {
            console.log('   Player 1 connected, joining queue...');
            player1Socket.emit('joinQueue', {
                userId: `test-player-1-${Date.now()}`,
                stake: stake1,
                mode: 'speed'
            });
        });

        player1Socket.on('matchFound', (data) => {
            if (!matchFound) {
                matchFound = true;
                console.log(`   ✅ MATCH FOUND! Player 1 matched`);
                console.log(`      Game ID: ${data.gameId}`);
                cleanup(true);
            }
        });

        // Player 2 handlers
        player2Socket.on('connect', () => {
            console.log('   Player 2 connected, joining queue...');
            // Delay slightly to ensure Player 1 joins first
            setTimeout(() => {
                player2Socket.emit('joinQueue', {
                    userId: `test-player-2-${Date.now()}`,
                    stake: stake2,
                    mode: 'speed'
                });
            }, 500);
        });

        player2Socket.on('matchFound', (data) => {
            if (!matchFound) {
                matchFound = true;
                console.log(`   ✅ MATCH FOUND! Player 2 matched`);
                console.log(`      Game ID: ${data.gameId}`);
                cleanup(true);
            }
        });

        // Error handlers
        player1Socket.on('connect_error', (err) => {
            console.log(`   ❌ Player 1 connection error: ${err.message}`);
            cleanup(false);
        });

        player2Socket.on('connect_error', (err) => {
            console.log(`   ❌ Player 2 connection error: ${err.message}`);
            cleanup(false);
        });

        // Timeout after 15 seconds
        timeout = setTimeout(() => {
            if (!matchFound) {
                console.log('   ❌ NO MATCH after 15s timeout');
                cleanup(false);
            }
        }, 15000);

        function cleanup(success) {
            clearTimeout(timeout);
            if (player1Socket) player1Socket.disconnect();
            if (player2Socket) player2Socket.disconnect();
            resolve(success);
        }
    });
}

async function runAllTests() {
    console.log('='.repeat(60));
    console.log('🧪 MATCHMAKING BRACKET TESTS');
    console.log('='.repeat(60));

    const results = [];

    for (const test of testCases) {
        const matched = await simulateMatchmaking(test.player1, test.player2);

        results.push({
            ...test,
            actualResult: matched,
            passed: matched === test.shouldMatch
        });

        // Wait 2 seconds between tests
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));

    results.forEach((result, index) => {
        const status = result.passed ? '✅ PASS' : '❌ FAIL';
        console.log(`\nTest ${index + 1}: ${status}`);
        console.log(`  Stakes: ${result.player1} vs ${result.player2}`);
        console.log(`  Expected Bracket: ${result.bracket}`);
        console.log(`  Should Match: ${result.shouldMatch}`);
        console.log(`  Actually Matched: ${result.actualResult}`);
    });

    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;

    console.log('\n' + '='.repeat(60));
    console.log(`🎯 Final Score: ${passedCount}/${totalCount} tests passed`);
    console.log('='.repeat(60));

    if (passedCount === totalCount) {
        console.log('\n🎉 All matchmaking tests passed!');
        process.exit(0);
    } else {
        console.log('\n⚠️  Some tests failed. Check bracket configuration.');
        process.exit(1);
    }
}

runAllTests();
