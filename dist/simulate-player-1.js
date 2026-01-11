import { io } from 'socket.io-client';
const API_URL = 'http://localhost:3000';
const USER_ID = 'fc5cdaf2-9a76-4446-a7b0-77bfe3d4e637';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InRlc3RwMUBwb3R0YS5jb20iLCJzdWIiOiJmYzVjZGFmMi05YTc2LTQ0NDYtYTdiMC03N2JmZTNkNGU2MzciLCJyb2xlIjoiVVNFUiIsImlhdCI6MTc2ODE2MTg2NywiZXhwIjoxNzY4MTY1NDY3fQ.3aWzs11tHI1uXSOdXdlbrRHqx14bbgAz1xnfplVPx_c';
async function main() {
    console.log('[P1] Connecting...');
    const socket = io(API_URL, {
        query: { userId: USER_ID },
        extraHeaders: { Authorization: `Bearer ${TOKEN}` }, // Just in case
        transports: ['websocket']
    });
    socket.on('connect', () => {
        console.log('[P1] Connected! Joining Queue...');
        socket.emit('joinQueue', {
            userId: USER_ID,
            stake: 10,
            mode: 'speed'
        });
    });
    let activeGameId = '';
    socket.on('matchFound', (data) => {
        console.log('[P1] Match Found!', data.gameId);
        activeGameId = data.gameId;
        socket.emit('joinGame', { gameId: data.gameId });
        socket.emit('getGameState', { gameId: data.gameId });
    });
    socket.on('gameState', (state) => {
        console.log(`[P1] GameState. Turn: ${state.turn === USER_ID ? 'ME' : 'OPPONENT'}`);
        if (state.turn === USER_ID && !state.isGameOver) {
            console.log('[P1] My turn! Shooting...');
            setTimeout(() => {
                socket.emit('takeShot', {
                    gameId: activeGameId,
                    userId: USER_ID,
                    angle: 0.5,
                    power: 60,
                    sideSpin: 0,
                    backSpin: 0
                });
            }, 1000);
        }
    });
    socket.on('shotResult', (data) => {
        console.log('[P1] Shot result:', data.shotResult.pocketedBalls.length, 'balls potted.');
    });
    socket.on('disconnect', () => console.log('[P1] Disconnected'));
}
main();
