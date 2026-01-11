import { io } from 'socket.io-client';
const EMAIL = 'testp2@potta.com';
const PASSWORD = 'PottaTest123!';
const API_URL = 'http://localhost:3000';
async function main() {
    console.log(`[BOT] Using hardcoded token for ${EMAIL}...`);
    // Token from successful curl
    const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InRlc3RwMkBwb3R0YS5jb20iLCJzdWIiOiI0MDExMTE1ZS1iZmE5LTQ5YzktYWVhZi05MDQ1NmQ0YjY3ZjMiLCJyb2xlIjoiVVNFUiIsImlhdCI6MTc2ODE2MTc2MSwiZXhwIjoxNzY4MTY1MzYxfQ.OQiyZCJ4XxdsCAOhreAuhqu2A718gfg4gBcn04iDa6g";
    const userId = "4011115e-bfa9-49c9-aeaf-90456d4b67f3";
    console.log(`[BOT] Logged in. UserId: ${userId}`);
    console.log('[BOT] Connecting to WebSocket...');
    const socket = io(API_URL, {
        query: { userId }, // Sending userId as server expects it in query (based on gateway review)
        transports: ['websocket']
    });
    socket.on('connect', () => {
        console.log('[BOT] Connected! ID:', socket.id);
        console.log('[BOT] Joining Queue (10 GHS)...');
        socket.emit('joinQueue', {
            userId,
            stake: 10,
            mode: 'speed' // Testing speed mode first as per previous context? Or user said "pool game". Speed mode is 9-ball default.
        });
    });
    socket.on('matchFound', (data) => {
        console.log('[BOT] Match Found!', data);
        console.log('[BOT] Joining Game Room...');
        socket.emit('joinGame', { gameId: data.gameId });
    });
    socket.on('gameState', (state) => {
        console.log('[BOT] Received GameState. Turn:', state.turn);
        if (state.turn === userId && !state.isGameOver) {
            console.log('[BOT] It is my turn! Taking a shot in 2 seconds...');
            setTimeout(() => {
                const angle = Math.random() * 2 * Math.PI;
                const power = 50 + Math.random() * 50;
                // Assuming we stored gameId from matchFound ?? 
                // Wait, handleJoinQueue doesn't return gameId continuously.
                // We typically need to track current gameId.
                // But for this simple bot, we rely on the fact we just joined one.
                // Actually, the server broadcasts to the room `gameId` so socket.on('gameState') doesn't give context of which game if not in payload?
                // The gateway code: `client.emit('gameState', state)` - doesn't include gameId in payload often.
                // But `matchFound` gave us `gameId`.
            }, 2000);
        }
    });
    // We need to capture gameId from matchFound
    let activeGameId = null;
    socket.on('matchFound', (data) => {
        activeGameId = data.gameId;
    });
    socket.on('shotResult', (data) => {
        console.log('[BOT] Shot Result:', data.shotResult.pocketedBalls.length > 0 ? 'Balls Potted!' : 'Miss');
        // If it's still my turn (e.g. potted a ball), shoot again?
        //GameState update usually follows.
    });
    // Handle taking shot logic better
    setInterval(() => {
        if (activeGameId) {
            // Request state? Or rely on updates?
            // Taking a shot requires emitting 'takeShot'
        }
    }, 1000);
    // Override generic 'gameState' listener to handle shooting
    socket.off('gameState');
    socket.on('gameState', (state) => {
        // console.log('[BOT] State update. Turn:', state.turn);
        if (activeGameId && state.turn === userId && !state.isGameOver) {
            console.log('[BOT] Taking shot...');
            socket.emit('takeShot', {
                gameId: activeGameId,
                userId,
                angle: Math.random() * 6.28,
                power: 80,
                sideSpin: 0,
                backSpin: 0
            });
        }
    });
    socket.on('error', (err) => {
        console.error('[BOT] Socket Error:', err);
    });
    socket.on('disconnect', () => {
        console.log('[BOT] Disconnected');
    });
}
main();
