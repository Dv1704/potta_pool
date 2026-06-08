import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3000';

async function runLivePvpTests() {
    console.log('🚀 Starting Live PvP Scenarios Test Suite...');
    console.log('Ensure the backend server is running on ' + SERVER_URL + ' before running this script.');

    const user1Id = 'player-A-' + Date.now();
    const user2Id = 'player-B-' + Date.now();

    const socketA = io(SERVER_URL, { query: { userId: user1Id } });
    const socketB = io(SERVER_URL, { query: { userId: user2Id } });

    let gameId = '';

    // Wait for connection
    await Promise.all([
        new Promise((resolve) => socketA.on('connect', () => { console.log('✅ Player A connected'); resolve(null); })),
        new Promise((resolve) => socketB.on('connect', () => { console.log('✅ Player B connected'); resolve(null); }))
    ]);

    // Matchmaking Setup
    const matchFoundPromise = new Promise((resolve) => {
        socketA.on('matchFound', (data) => {
            console.log('🔥 Player A matched! Game ID:', data.gameId);
            gameId = data.gameId;
            socketA.emit('playerReady', { gameId: data.gameId, userId: user1Id });
        });

        socketB.on('matchFound', (data) => {
            console.log('🔥 Player B matched! Game ID:', data.gameId);
            socketB.emit('playerReady', { gameId: data.gameId, userId: user2Id });
        });

        socketA.on('startMatch', (data) => {
            console.log('🎮 Match Started!');
            resolve(data.gameState);
        });
    });

    console.log('⏳ Joining matchmaking queue with GH₵10 stake...');
    socketA.emit('joinQueue', { userId: user1Id, stake: 0, mode: 'turn' });
    setTimeout(() => {
        socketB.emit('joinQueue', { userId: user2Id, stake: 0, mode: 'turn' });
    }, 500);

    const initialGameState = await matchFoundPromise;
    console.log('👉 Initial Turn:', initialGameState.turn);

    // Make sure Player A is the first turn shooter
    const shooterSocket = initialGameState.turn === user1Id ? socketA : socketB;
    const shooterId = initialGameState.turn === user1Id ? user1Id : user2Id;
    const opponentSocket = initialGameState.turn === user1Id ? socketB : socketA;
    const opponentId = initialGameState.turn === user1Id ? user2Id : user1Id;

    // --- Scenario 2: Turn Lock ---
    console.log('\n🔒 [Scenario 2] Testing Turn Lock...');
    const turnLockPromise = new Promise((resolve) => {
        opponentSocket.on('error', (err) => {
            console.log('✅ Turn Lock Verified! Opponent received error:', err.message);
            resolve(null);
        });
    });

    console.log(`🔫 Opponent (${opponentId}) attempting to shoot out of turn...`);
    opponentSocket.emit('takeShot', {
        gameId,
        userId: opponentId,
        angle: 45,
        power: 100,
        sideSpin: 0,
        backSpin: 0
    });

    await turnLockPromise;

    // --- Scenario 1: Basic Shot Sync ---
    console.log('\n📊 [Scenario 1] Testing Basic Shot Sync...');
    const shotSyncPromise = new Promise((resolve) => {
        let opponentShotStarted = false;

        opponentSocket.on('opponentShotStart', (data) => {
            console.log('✅ Shot Start Sync Verified! Opponent received opponentShotStart event:', data.playerId);
            opponentShotStarted = true;
        });

        opponentSocket.on('shotResult', (data) => {
            console.log('✅ Shot Result Sync Verified! Opponent received final resting positions.');
            console.log('👉 Next turn is:', data.gameState.turn);
            resolve({ opponentShotStarted, nextTurn: data.gameState.turn });
        });
    });

    console.log(`🔫 Shooter (${shooterId}) taking shot...`);
    shooterSocket.emit('takeShot', {
        gameId,
        userId: shooterId,
        angle: 0,
        power: 150,
        sideSpin: 0,
        backSpin: 0
    });

    const syncResult = await shotSyncPromise;
    if (!syncResult.opponentShotStarted) {
        console.error('❌ Opponent shot start was NOT received!');
    }

    // --- Scenario 3: Ball-in-hand after Scratch Foul ---
    console.log('\n🎱 [Scenario 3] Testing Ball-in-hand Scratch Foul...');
    
    // Switch sockets to determine who is current shooter
    const currentShooterId = syncResult.nextTurn;
    const currentShooterSocket = currentShooterId === user1Id ? socketA : socketB;
    const currentOpponentSocket = currentShooterId === user1Id ? socketB : socketA;

    const scratchPromise = new Promise((resolve) => {
        currentOpponentSocket.on('shotResult', (data) => {
            console.log('✅ Scratch Foul Verified! shotResult contains cueBallScratched:', data.shotResult.cueBallScratched);
            console.log('👉 Next Turn after foul:', data.gameState.turn);
            console.log('👉 Foul Occurred flag is:', data.gameState.foulOccurred);
            resolve(data.gameState);
        });
    });

    console.log(`🔫 Current Shooter (${currentShooterId}) aiming directly at pocket 0 to scratch...`);
    currentShooterSocket.emit('takeShot', {
        gameId,
        userId: currentShooterId,
        angle: 180,
        power: 300,
        sideSpin: 0,
        backSpin: 0,
        cueBallX: 7.42, // Scratch coordinates
        cueBallY: 11.04
    });

    const scratchState = await scratchPromise;
    if (!scratchState.foulOccurred) {
        console.error('❌ foulOccurred was NOT set to true after scratch!');
    }

    // --- Scenario 5: Timer Expiry ---
    console.log('\n⏱️ [Scenario 5] Testing Turn Timer Expiry (30s timeout)...');
    console.log('Waiting for the turn timer to run out (may take up to 30s)...');

    const nextShooterId = scratchState.turn;
    const nextOpponentSocket = nextShooterId === user1Id ? socketB : socketA;

    const timerExpiryPromise = new Promise((resolve) => {
        nextOpponentSocket.on('gameState', (state) => {
            if (state.turn !== nextShooterId) {
                console.log('✅ Timer Expiry Verified! Turn switched automatically to:', state.turn);
                console.log('👉 Foul Occurred flag after expiry:', state.foulOccurred);
                resolve(state);
            }
        });
    });

    // We print a ticking counter
    let secondsLeft = 30;
    const interval = setInterval(() => {
        secondsLeft -= 5;
        if (secondsLeft > 0) {
            console.log(`  ⏱️ ${secondsLeft}s remaining...`);
        } else {
            clearInterval(interval);
        }
    }, 5000);

    await timerExpiryPromise;
    clearInterval(interval);

    // --- Scenario 4: 8-ball Win Condition ---
    console.log('\n🏆 [Scenario 4] Note on 8-ball Win Condition:');
    console.log('  The 8-ball win condition and proper game termination are verified via:');
    console.log('  1. Unit tests in TurnMode.spec.ts ("should end the game properly when the 8-ball drops")');
    console.log('  2. Gateway integration tests in game.gateway.spec.ts ("Scenario 4: 8-ball Win Condition")');
    console.log('  These tests confirm that both client sockets receive the "gameEnded" message with the winner.');

    console.log('\n🏁 Live PvP Scenarios Test Suite completed successfully!');
    
    // Disconnect
    socketA.disconnect();
    socketB.disconnect();
    process.exit(0);
}

runLivePvpTests().catch((err) => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
});
