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

    const p1Ready = new Promise<void>((resolve) => {
        socket1.on('connect', () => {
            console.log('✅ Player 1 connected');
            resolve();
        });
    });

    const p2Ready = new Promise<void>((resolve) => {
        socket2.on('connect', () => {
            console.log('✅ Player 2 connected');
            resolve();
        });
    });

    await Promise.all([p1Ready, p2Ready]);

    // 4. JOIN QUEUE & MATCH
    const matchFoundPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject('Matchmaking timeout'), 10000);

        let p1Done = false;
        let p2Done = false;

        socket1.on('matchFound', (data: any) => {
            console.log('🔥 Match Found for Player 1!', data.gameId);
            gameId = data.gameId;
            (socket1 as any).isMyTurn = (data.gameState.turn === user1Id);
            p1Done = true;
            if (p1Done && p2Done) {
                clearTimeout(timeout);
                resolve();
            }
        });

        socket2.on('matchFound', (data: any) => {
            console.log('🔥 Match Found for Player 2!', data.gameId);
            (socket2 as any).isMyTurn = (data.gameState.turn === user2Id);
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

    // Determine who is shooting based on the server's turn
    const shooterSocket = (socket1 as any).isMyTurn ? socket1 : socket2;
    const observerSocket = (socket1 as any).isMyTurn ? socket2 : socket1;
    const shooterId = (socket1 as any).isMyTurn ? user1Id : user2Id;
    const observerId = (socket1 as any).isMyTurn ? user2Id : user1Id;

    console.log(`🚫 Deliberately taking shot with WRONG player (${observerId})...`);
    observerSocket.emit('takeShot', {
        gameId,
        userId: observerId,
        angle: 0,
        power: 10
    });

    const errorPromise = new Promise<void>((resolve) => {
        observerSocket.once('error', (err: any) => {
            console.log('✅ Correctly received error for wrong turn:', err.message);
            resolve();
        });
    });
    await errorPromise;

    console.log(`🔫 Player ${shooterSocket === socket1 ? '1' : '2'} taking CORRECT shot...`);

    // 5. TEST SHOT SYNC
    const shotRelayPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject('Shot sync timeout'), 20000);

        observerSocket.on('opponentShotStart', (data: any) => {
            console.log(`👀 Opponent received opponentShotStart:`, data.vector);
        });

        observerSocket.on('shotResult', (data: any) => {
            console.log('🎯 Opponent received shotResult from:', data.shooterId);
            if (data.shooterId === shooterId) {
                console.log('🎉 SYNC VERIFIED!');
                clearTimeout(timeout);
                resolve();
            }
        });

        shooterSocket.on('error', (err: any) => {
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

    console.log('🔄 Checking turn flip in Redis...');
    const gameData = await redis.get(`game:active:${gameId}`);
    if (gameData) {
        const state = JSON.parse(gameData);
        console.log(`Next turn is for: ${state.data.turn}`);
    }

    // 6. SECOND SHOT (By the other player)
    console.log(`🔫 Player ${observerSocket === socket1 ? '1' : '2'} taking SECOND shot...`);
    const secondShotPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject('Second shot timeout'), 20000);
        shooterSocket.on('opponentShotStart', (data: any) => {
            console.log('👀 Original shooter received opponentShotStart for 2nd shot');
        });
        shooterSocket.on('shotResult', (data: any) => {
            console.log('🎯 Original shooter received shotResult for 2nd shot');
            clearTimeout(timeout);
            resolve();
        });
    });

    observerSocket.emit('takeShot', {
        gameId,
        userId: observerSocket === socket1 ? user1Id : user2Id,
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
