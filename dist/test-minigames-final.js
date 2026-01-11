import axios from 'axios';
const API_URL = 'http://localhost:3000';
let token = '';
async function login() {
    try {
        const res = await axios.post(`${API_URL}/auth/login`, {
            email: 'victorolanikanju@gmail.com',
            password: 'Olanikanju0906$'
        });
        token = res.data.access_token;
        console.log('Login successful');
    }
    catch (e) {
        console.error('Login failed:', e.response?.data || e.message);
    }
}
async function verifyGame(endpoint, payload, gameName) {
    console.log(`\n--- Testing ${gameName} ---`);
    try {
        // Get balance before
        const balResBefore = await axios.get(`${API_URL}/wallet/balance`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const balanceBefore = Number(balResBefore.data.available);
        console.log(`Balance before: ${balanceBefore}`);
        // Play game
        const gameRes = await axios.post(`${API_URL}/game/play/${endpoint}`, payload, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const { won, payout, result } = gameRes.data;
        console.log(`Result: ${JSON.stringify(result)}, Won: ${won}, Payout: ${payout}`);
        // Get balance after
        const balResAfter = await axios.get(`${API_URL}/wallet/balance`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const balanceAfter = Number(balResAfter.data.available);
        console.log(`Balance after: ${balanceAfter}`);
        // Verify balance math
        const expectedBalance = balanceBefore - payload.stake + payout;
        if (Math.abs(balanceAfter - expectedBalance) < 0.01) {
            console.log(`Success: Balance verified for ${gameName}`);
        }
        else {
            console.log(`Error: Balance mismatch for ${gameName}. Expected ${expectedBalance}, got ${balanceAfter}`);
        }
    }
    catch (e) {
        console.error(`Failed ${gameName}:`, e.response?.data || e.message);
    }
}
async function runVerification() {
    await login();
    if (!token)
        return;
    // Test each game multiple times to ensure we hit at least one win
    const games = [
        { name: 'Dice', endpoint: 'dice', payload: { stake: 10 } },
        { name: 'Coin Toss', endpoint: 'coin', payload: { stake: 10, choice: 'heads' } },
        { name: 'Number Rush', endpoint: 'number', payload: { stake: 10, guess: 5 } },
        { name: 'Lucky Wheel', endpoint: 'wheel', payload: { stake: 10, choice: 'red' } },
        { name: 'Card Flip', endpoint: 'card', payload: { stake: 10 } },
        { name: 'Color Match', endpoint: 'color', payload: { stake: 10 } },
        { name: 'Pool Master', endpoint: 'pool', payload: { stake: 10 } }
    ];
    for (const game of games) {
        console.log(`\n=== STRESS TESTING ${game.name} ===`);
        for (let i = 0; i < 3; i++) {
            await verifyGame(game.endpoint, game.payload, `${game.name} (Iteration ${i + 1})`);
        }
    }
}
runVerification();
