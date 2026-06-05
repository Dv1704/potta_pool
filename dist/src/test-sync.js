import { io } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import process from 'process';
import { Redis } from 'ioredis';
const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const SERVER_URL = 'http://localhost:3000';
async function testSocket() {
    console.log('🚀 Starting multiplayer socket test...');
    // 1. CLEANUP REDIS
    console.log('🧹 Clearing matchmaking queues in Redis...');
    const keys = await redis.keys('matchmaking:queue:*');
    if (keys.length > 0) {
        await redis.del(...keys);
    }
    const user1Id = 'test-user-1-' + Date.now();
    const user2Id = 'test-user-2-' + Date.now();
    const testStake = 15; // Specific bracket 10-20
    // 2. CREATE USERS
    console.log('📝 Creating test users in DB...');
    await prisma.user.create({
        data: {
            id: user1Id,
            email: `${user1Id}@test.com`,
            name: 'P1',
            password: 'hash',
            referralCode: user1Id,
            wallet: { create: { availableBalance: 1000 } }
        }
    });
    await prisma.user.create({
        data: {
            id: user2Id,
            email: `${user2Id}@test.com`,
            name: 'P2',
            password: 'hash',
            referralCode: user2Id,
            wallet: { create: { availableBalance: 1000 } }
        }
    });
    // 3. CONNECT SOCKETS
    const socket1 = io(SERVER_URL, { query: { userId: user1Id } });
    const socket2 = io(SERVER_URL, { query: { userId: user2Id } });
    let gameId = '';
    const p1Ready = new Promise((resolve) => {
        socket1.on('connect', () => {
            console.log('✅ Player 1 connected');
            resolve();
        });
    });
    const p2Ready = new Promise((resolve) => {
        socket2.on('connect', () => {
            console.log('✅ Player 2 connected');
            resolve();
        });
    });
    await Promise.all([p1Ready, p2Ready]);
    // 4. JOIN QUEUE & MATCH
    const matchFoundPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject('Matchmaking timeout'), 10000);
        let p1Done = false;
        let p2Done = false;
        socket1.on('matchFound', (data) => {
            console.log('🔥 Match Found for Player 1!', data.gameId);
            gameId = data.gameId;
            socket1.isMyTurn = (data.gameState.turn === user1Id);
            p1Done = true;
            if (p1Done && p2Done) {
                clearTimeout(timeout);
                resolve();
            }
        });
        socket2.on('matchFound', (data) => {
            console.log('🔥 Match Found for Player 2!', data.gameId);
            socket2.isMyTurn = (data.gameState.turn === user2Id);
            p2Done = true;
            if (p1Done && p2Done) {
                clearTimeout(timeout);
                resolve();
            }
        });
    });
    console.log('⏳ Joining queue...');
    socket1.emit('joinQueue', { userId: user1Id, stake: testStake, mode: 'turn' });
    // Small delay to ensure order, but lock handles simultaneous entry too
    await new Promise(r => setTimeout(r, 500));
    socket2.emit('joinQueue', { userId: user2Id, stake: testStake, mode: 'turn' });
    await matchFoundPromise;
    // Emit playerReady for both players to start the game
    socket1.emit('playerReady', { gameId, userId: user1Id });
    socket2.emit('playerReady', { gameId, userId: user2Id });
    // Wait a brief moment for the game state to initialize
    await new Promise(r => setTimeout(r, 500));
    // Determine who is shooting based on the server's turn
    const shooterSocket = socket1.isMyTurn ? socket1 : socket2;
    const observerSocket = socket1.isMyTurn ? socket2 : socket1;
    const shooterId = socket1.isMyTurn ? user1Id : user2Id;
    const observerId = socket1.isMyTurn ? user2Id : user1Id;
    console.log(`🚫 Deliberately taking shot with WRONG player (${observerId})...`);
    observerSocket.emit('takeShot', {
        gameId,
        userId: observerId,
        angle: 0,
        power: 10
    });
    const errorPromise = new Promise((resolve) => {
        observerSocket.once('error', (err) => {
            console.log('✅ Correctly received error for wrong turn:', err.message);
            resolve();
        });
    });
    await errorPromise;
    // Wait 1.1s to bypass server input throttling (1000ms limit)
    await new Promise(r => setTimeout(r, 1100));
    console.log(`🔫 Player ${shooterSocket === socket1 ? '1' : '2'} taking CORRECT shot...`);
    // 5. TEST SHOT SYNC
    let nextTurnId = '';
    const shotRelayPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject('Shot sync timeout'), 20000);
        observerSocket.on('opponentShotStart', (data) => {
            console.log(`👀 Opponent received opponentShotStart:`, data.vector);
        });
        observerSocket.on('shotResult', (data) => {
            console.log('🎯 Opponent received shotResult from:', data.shooterId);
            if (data.shooterId === shooterId) {
                console.log('🎉 SYNC VERIFIED!');
                nextTurnId = data.gameState.turn;
                clearTimeout(timeout);
                resolve();
            }
        });
        shooterSocket.on('error', (err) => {
            console.error('❌ Shooter received error:', err.message);
            reject('Shooter error: ' + err.message);
        });
    });
    shooterSocket.emit('takeShot', {
        gameId,
        userId: shooterId,
        angle: 45,
        power: 50,
        sideSpin: 0,
        backSpin: 0
    });
    await shotRelayPromise;
    // Wait 1.1s to bypass server input throttling (1000ms limit)
    await new Promise(r => setTimeout(r, 1100));
    console.log('🔄 Checking turn flip in Redis...');
    const gameData = await redis.get(`game:active:${gameId}`);
    if (gameData) {
        const state = JSON.parse(gameData);
        console.log(`Next turn is for: ${state.data.turn}`);
    }
    // 6. SECOND SHOT (By the player whose turn it actually is)
    const nextShooterSocket = nextTurnId === user1Id ? socket1 : socket2;
    const nextObserverSocket = nextTurnId === user1Id ? socket2 : socket1;
    const nextShooterId = nextTurnId;
    console.log(`🔫 Player ${nextShooterSocket === socket1 ? '1' : '2'} taking SECOND shot...`);
    const secondShotPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject('Second shot timeout'), 20000);
        nextObserverSocket.on('opponentShotStart', (data) => {
            console.log('👀 Observer received opponentShotStart for 2nd shot');
        });
        nextObserverSocket.on('shotResult', (data) => {
            console.log('🎯 Observer received shotResult for 2nd shot');
            clearTimeout(timeout);
            resolve();
        });
        nextShooterSocket.on('error', (err) => {
            console.error('❌ Second shooter received error:', err.message);
            reject('Second shooter error: ' + err.message);
        });
    });
    nextShooterSocket.emit('takeShot', {
        gameId,
        userId: nextShooterId,
        angle: 90,
        power: 30,
        sideSpin: 0,
        backSpin: 0
    });
    await secondShotPromise;
    console.log('🎉 DOUBLE SHOT SYNC VERIFIED!');
    console.log('🏁 Test finished. Closing sockets.');
    socket1.disconnect();
    socket2.disconnect();
    await redis.quit();
    process.exit(0);
}
testSocket().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
