import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { WalletService } from '../src/wallet/wallet.service.js';
import { GameService } from '../src/game/services/game.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PoolEngine } from '../src/game/engine/PoolEngine.js';
import { io } from 'socket.io-client';
import bcrypt from 'bcrypt';
import axios from 'axios';
// Mock Resend to avoid network errors
const originalPost = axios.post;
axios.post = async (url, data, config) => {
    if (url.includes('api.resend.com')) {
        return { data: { id: 'mock-email-id-game-end' } };
    }
    return originalPost(url, data, config);
};
// -------------------------------------------------------------
// Mock PoolEngine to deterministically simulate pocketing the 8-ball
// -------------------------------------------------------------
let mockPocketedBalls = [];
const originalExecuteShot = PoolEngine.prototype.executeShot;
PoolEngine.prototype.executeShot = function (angle, power, sideSpin, backSpin) {
    if (mockPocketedBalls.length > 0) {
        console.log(`   [Mock PoolEngine] executeShot called, forcing pocketed balls: ${mockPocketedBalls}`);
        const finalState = {};
        for (let i = 0; i < 16; i++) {
            finalState[i] = {
                x: 900,
                y: 450,
                onTable: !mockPocketedBalls.includes(i)
            };
        }
        const result = {
            pocketedBalls: mockPocketedBalls,
            cueBallCollisionWithTable: false,
            firstBallCollided: mockPocketedBalls[0],
            cueBallScratched: false,
            finalState,
            events: mockPocketedBalls.map(b => ({ type: 'pocket', ballId: b })),
            animationFrames: [finalState]
        };
        mockPocketedBalls = []; // Reset
        return result;
    }
    return originalExecuteShot.call(this, angle, power, sideSpin, backSpin);
};
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function bootstrap() {
    console.log('🚀 Bootstrapping NestJS server on port 3005...');
    const app = await NestFactory.create(AppModule, { rawBody: true, logger: false });
    await app.listen(3005);
    const prisma = app.get(PrismaService);
    const walletService = app.get(WalletService);
    const gameService = app.get(GameService);
    const suffix = Math.random().toString(36).substring(7);
    const user1Email = `p1_${suffix}@example.com`;
    const user2Email = `p2_${suffix}@example.com`;
    const user3Email = `p3_${suffix}@example.com`;
    const user4Email = `p4_${suffix}@example.com`;
    const password = 'password123';
    const hashedPassword = await bcrypt.hash(password, 10);
    const createdUsers = [];
    // Create Test Users
    console.log('\n1. Creating test users in DB...');
    const u1 = await prisma.user.create({
        data: { email: user1Email, password: hashedPassword, name: 'Player One', referralCode: `REF-T1-${suffix.toUpperCase()}`, wallet: { create: {} } }
    });
    createdUsers.push(u1.id);
    const u2 = await prisma.user.create({
        data: { email: user2Email, password: hashedPassword, name: 'Player Two', referralCode: `REF-T2-${suffix.toUpperCase()}`, wallet: { create: {} } }
    });
    createdUsers.push(u2.id);
    const u3 = await prisma.user.create({
        data: { email: user3Email, password: hashedPassword, name: 'Player Three', referralCode: `REF-T3-${suffix.toUpperCase()}`, wallet: { create: {} } }
    });
    createdUsers.push(u3.id);
    const u4 = await prisma.user.create({
        data: { email: user4Email, password: hashedPassword, name: 'Player Four', referralCode: `REF-T4-${suffix.toUpperCase()}`, wallet: { create: {} } }
    });
    createdUsers.push(u4.id);
    // Deposit GHS into wallets
    console.log('   Depositing 100 GHS in each player\'s wallet...');
    await walletService.deposit(u1.id, 100, 'GHS');
    await walletService.deposit(u2.id, 100, 'GHS');
    await walletService.deposit(u3.id, 100, 'GHS');
    await walletService.deposit(u4.id, 100, 'GHS');
    console.log('   ✅ Wallets funded successfully.');
    // -------------------------------------------------------------
    // TEST 1: Matchmaking, Real-time Sync, Shot Relay, and Standard Game End
    // -------------------------------------------------------------
    console.log('\n-------------------------------------------------------------');
    console.log('TEST 1: Matchmaking, Real-time Sync, and Standard Game End');
    console.log('-------------------------------------------------------------');
    const socket1 = io('http://localhost:3005', { query: { userId: u1.id }, transports: ['websocket'] });
    const socket2 = io('http://localhost:3005', { query: { userId: u2.id }, transports: ['websocket'] });
    let gameId = '';
    // Wait for connection
    await Promise.all([
        new Promise(resolve => socket1.on('connect', () => { console.log('   [Socket] Player 1 connected'); resolve(); })),
        new Promise(resolve => socket2.on('connect', () => { console.log('   [Socket] Player 2 connected'); resolve(); }))
    ]);
    // Handle Match Found
    const matchFoundPromise = Promise.all([
        new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('MatchFound timeout Player 1')), 10000);
            socket1.on('matchFound', (data) => {
                clearTimeout(timeout);
                gameId = data.gameId;
                console.log(`   🔥 Player 1 matched! GameId: ${gameId}`);
                resolve();
            });
        }),
        new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('MatchFound timeout Player 2')), 10000);
            socket2.on('matchFound', (data) => {
                clearTimeout(timeout);
                console.log(`   🔥 Player 2 matched!`);
                resolve();
            });
        })
    ]);
    // Enter Matchmaking Queue
    console.log('   Queueing Player 1 and Player 2 (stake 30 GHS)...');
    socket1.emit('joinQueue', { userId: u1.id, stake: 30, mode: 'turn' });
    await delay(300);
    socket2.emit('joinQueue', { userId: u2.id, stake: 30, mode: 'turn' });
    await matchFoundPromise;
    console.log('   ✅ Match Found event confirmed on both sockets.');
    // Mark Ready
    const startMatchPromise = Promise.all([
        new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('startMatch timeout Player 1')), 10000);
            socket1.on('startMatch', () => {
                clearTimeout(timeout);
                console.log('   🎬 Player 1 received startMatch event');
                resolve();
            });
        }),
        new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('startMatch timeout Player 2')), 10000);
            socket2.on('startMatch', () => {
                clearTimeout(timeout);
                console.log('   🎬 Player 2 received startMatch event');
                resolve();
            });
        })
    ]);
    console.log('   Joining and sending ready status...');
    socket1.emit('joinGame', { gameId });
    socket2.emit('joinGame', { gameId });
    socket1.emit('playerReady', { gameId, userId: u1.id });
    socket2.emit('playerReady', { gameId, userId: u2.id });
    await startMatchPromise;
    console.log('   ✅ Game successfully initialized & started.');
    // Verify turn structure
    const initialGame = await gameService.getGame(gameId);
    let state = initialGame.mode.getGameState();
    const activeUserId = state.turn;
    const passiveUserId = activeUserId === u1.id ? u2.id : u1.id;
    const activeSocket = activeUserId === u1.id ? socket1 : socket2;
    const passiveSocket = activeUserId === u1.id ? socket2 : socket1;
    console.log(`   Current Turn: ${activeUserId === u1.id ? 'Player 1' : 'Player 2'}`);
    // Simulate Shot & Relay (Normal Shot - Misses)
    console.log(`\n   Simulating normal miss shot from Active Player (${activeUserId === u1.id ? 'Player 1' : 'Player 2'})...`);
    const shotRelayPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Shot synchronization timeout')), 15000);
        passiveSocket.on('opponentShotStart', (data) => {
            console.log('   ⚡ Passive Player received opponentShotStart (optimistic relay):', data);
        });
        activeSocket.on('shotResult', (data) => {
            console.log('   🎯 Active Player received shotResult (sync successful)');
        });
        passiveSocket.on('shotResult', (data) => {
            console.log('   🎯 Passive Player received shotResult (sync successful)');
            const nextTurn = data.gameState.turn;
            console.log(`   Next Turn: ${nextTurn === u1.id ? 'Player 1' : 'Player 2'}`);
            if (nextTurn !== passiveUserId) {
                reject(new Error('Turn did not switch to passive player after miss'));
            }
            clearTimeout(timeout);
            resolve();
        });
    });
    activeSocket.emit('takeShot', {
        gameId,
        userId: activeUserId,
        angle: 90,
        power: 40,
        sideSpin: 0,
        backSpin: 0
    });
    await shotRelayPromise;
    console.log('   ✅ Real-time game events & turn toggles synchronized successfully.');
    // Standard Game End Sequence (Pocketing the 8-Ball)
    console.log('\n   Testing Standard Game End Sequence (8-ball pocketed)...');
    // Configure mock PoolEngine to pocket the 8-ball on the next shot
    mockPocketedBalls = [8];
    const gameEndedPromise = Promise.all([
        new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('gameEnded timeout Player 1')), 20000);
            socket1.on('gameEnded', (data) => {
                clearTimeout(timeout);
                console.log(`   🏁 Player 1 received gameEnded. Winner: ${data.winnerId}`);
                if (data.winnerId !== passiveUserId)
                    reject(new Error('WinnerId mismatch in gameEnded'));
                resolve();
            });
        }),
        new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('gameEnded timeout Player 2')), 20000);
            socket2.on('gameEnded', (data) => {
                clearTimeout(timeout);
                console.log(`   🏁 Player 2 received gameEnded. Message: ${data.message}`);
                resolve();
            });
        })
    ]);
    // Send the final shot from the passive socket (whose turn it now is)
    console.log(`   Sending final winning shot from ${passiveUserId === u1.id ? 'Player 1' : 'Player 2'}...`);
    passiveSocket.emit('takeShot', {
        gameId,
        userId: passiveUserId,
        angle: 0,
        power: 10,
        sideSpin: 0,
        backSpin: 0
    });
    // Wait for game Ended socket event (delay of 12 seconds from handleShot end to allow roll animation)
    console.log('   Waiting 12.5 seconds for the delayed gameEnded socket broadcast...');
    await gameEndedPromise;
    console.log('   ✅ Both player sockets received delayed gameEnded broadcast.');
    // Verify database and wallet records
    const dbGame = await prisma.game.findUnique({ where: { id: gameId } });
    console.log(`   Database Game Status: ${dbGame?.status}, Winner: ${dbGame?.winnerId}`);
    if (dbGame?.status !== 'COMPLETED' || dbGame?.winnerId !== passiveUserId) {
        throw new Error('Database game record not completed correctly');
    }
    const activeBal = await walletService.getBalance(activeUserId);
    const passiveBal = await walletService.getBalance(passiveUserId);
    console.log(`   Wallet Balances after Game over -> Winner: ${passiveBal.available} GHS, Loser: ${activeBal.available} GHS`);
    // Pot payout should increase winner's balance (original stake was 30 GHS)
    if (passiveBal.available <= 100) {
        throw new Error('Winner was not paid out');
    }
    if (activeBal.available !== 70) {
        throw new Error('Loser balance should remain deducted at 70 GHS');
    }
    console.log('   ✅ Wallet ledger payouts and status entries validated.');
    // Close connections
    socket1.disconnect();
    socket2.disconnect();
    // -------------------------------------------------------------
    // TEST 2: Turn Timeout Ending Sequence
    // -------------------------------------------------------------
    console.log('\n-------------------------------------------------------------');
    console.log('TEST 2: Turn Timeout Ending Sequence');
    console.log('-------------------------------------------------------------');
    const socket3 = io('http://localhost:3005', { query: { userId: u3.id }, transports: ['websocket'] });
    const socket4 = io('http://localhost:3005', { query: { userId: u4.id }, transports: ['websocket'] });
    let gameId2 = '';
    await Promise.all([
        new Promise(resolve => socket3.on('connect', resolve)),
        new Promise(resolve => socket4.on('connect', resolve))
    ]);
    const matchFoundPromise2 = Promise.all([
        new Promise(resolve => socket3.on('matchFound', (data) => { gameId2 = data.gameId; resolve(); })),
        new Promise(resolve => socket4.on('matchFound', () => resolve()))
    ]);
    console.log('   Queueing Player 3 and Player 4 (stake 10 GHS)...');
    socket3.emit('joinQueue', { userId: u3.id, stake: 10, mode: 'speed' });
    await delay(300);
    socket4.emit('joinQueue', { userId: u4.id, stake: 10, mode: 'speed' });
    await matchFoundPromise2;
    const startMatchPromise2 = Promise.all([
        new Promise(resolve => socket3.on('startMatch', () => resolve())),
        new Promise(resolve => socket4.on('startMatch', () => resolve()))
    ]);
    socket3.emit('joinGame', { gameId: gameId2 });
    socket4.emit('joinGame', { gameId: gameId2 });
    socket3.emit('playerReady', { gameId: gameId2, userId: u3.id });
    socket4.emit('playerReady', { gameId: gameId2, userId: u4.id });
    await startMatchPromise2;
    console.log('   ✅ Speed mode game 2 started.');
    // Fetch game in Redis and force-expire the turn expiration timestamp to past
    const redisKey2 = gameService.getGameKey(gameId2);
    const redisVal = await gameService.redis.get(redisKey2);
    const stateObj = JSON.parse(redisVal);
    // Expire the turn by setting it to a past timestamp
    stateObj.data.turnExpiration = Date.now() - 10000; // 10s ago
    await gameService.redis.set(redisKey2, JSON.stringify(stateObj));
    console.log('   Forced turn expiration in Redis.');
    // Wait for the periodic timeout scanner in game.gateway.ts to run (every 5 seconds)
    console.log('   Waiting for periodic timeout scanner to check timeouts...');
    const game2EndedPromise = Promise.all([
        new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout check timeout Player 3')), 10000);
            socket3.on('gameEnded', (data) => {
                clearTimeout(timeout);
                console.log(`   🏁 Player 3 received gameEnded due to timeout: "${data.message}"`);
                resolve();
            });
        }),
        new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout check timeout Player 4')), 10000);
            socket4.on('gameEnded', (data) => {
                clearTimeout(timeout);
                console.log(`   🏁 Player 4 received gameEnded due to timeout: "${data.message}"`);
                resolve();
            });
        })
    ]);
    await game2EndedPromise;
    console.log('   ✅ Sockets received timeout ending event successfully.');
    // Check DB game status for game 2
    const dbGame2 = await prisma.game.findUnique({ where: { id: gameId2 } });
    console.log(`   Game 2 DB Status: ${dbGame2?.status}, Winner: ${dbGame2?.winnerId}`);
    if (dbGame2?.status !== 'COMPLETED' || !dbGame2?.winnerId) {
        throw new Error('Game 2 should be COMPLETED with a winner assigned');
    }
    // Since the active turn player timed out, the other player should win
    const activePlayerId2 = stateObj.data.turnIndex === 0 ? stateObj.players[0] : stateObj.players[1];
    const expectedWinnerId2 = stateObj.players.find((id) => id !== activePlayerId2);
    console.log(`   Active turn player when timeout forced: ${activePlayerId2}`);
    console.log(`   Expected Winner: ${expectedWinnerId2}`);
    if (dbGame2.winnerId !== expectedWinnerId2) {
        throw new Error(`Winner should be ${expectedWinnerId2} due to ${activePlayerId2} turn timeout, found ${dbGame2.winnerId}`);
    }
    const activeBal2 = await walletService.getBalance(activePlayerId2);
    const passiveBal2 = await walletService.getBalance(expectedWinnerId2);
    console.log(`   Wallet Balances -> Timed out player: ${activeBal2.available} GHS, Winner: ${passiveBal2.available} GHS`);
    if (activeBal2.available !== 90) {
        throw new Error(`Timed out player balance should remain deducted at 90 GHS, found: ${activeBal2.available}`);
    }
    if (passiveBal2.available <= 100) {
        throw new Error('Winner should have received the payout');
    }
    console.log('   ✅ Timeout payout logic validated.');
    socket3.disconnect();
    socket4.disconnect();
    // -------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------
    console.log('\nCleaning up all test users and records from DB...');
    // Delete ledgers
    const wallets = await prisma.wallet.findMany({ where: { userId: { in: createdUsers } } });
    const walletIds = wallets.map(w => w.id);
    await prisma.ledger.deleteMany({ where: { walletId: { in: walletIds } } });
    // Delete wallets
    await prisma.wallet.deleteMany({ where: { userId: { in: createdUsers } } });
    // Delete games
    await prisma.game.deleteMany({ where: { id: { in: [gameId, gameId2] } } });
    // Delete users
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    console.log('Cleanup completed successfully.');
    console.log('\n=============================================================');
    console.log('🎉 HTML5 GAME END SEQUENCE & REAL-TIME SYNC TESTS PASSED!');
    console.log('=============================================================');
    await app.close();
    process.exit(0);
}
bootstrap().catch(err => {
    console.error('❌ Integration test failed:', err);
    process.exit(1);
});
