import axios from 'axios';
const API_URL = 'http://localhost:3000';
const EMAIL = 'victorolanikanju@gmail.com';
const PASSWORD = 'deevictor';
async function testGames() {
    try {
        console.log('Logging in...');
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email: EMAIL,
            password: PASSWORD
        });
        const token = loginRes.data.access_token;
        const headers = { Authorization: `Bearer ${token}` };
        console.log('\n--- Testing Number Rush ---');
        const numRes = await axios.post(`${API_URL}/game/play/number`, { stake: 10, guess: 5 }, { headers });
        console.log('Number Rush result:', numRes.data);
        console.log('\n--- Testing Lucky Wheel ---');
        const wheelRes = await axios.post(`${API_URL}/game/play/wheel`, { stake: 10, choice: 'red' }, { headers });
        console.log('Lucky Wheel result:', wheelRes.data);
        console.log('\n--- Testing Card Flip ---');
        const cardRes = await axios.post(`${API_URL}/game/play/card`, { stake: 10 }, { headers });
        console.log('Card Flip result:', cardRes.data);
        console.log('\n--- Testing Color Match ---');
        const colorRes = await axios.post(`${API_URL}/game/play/color`, { stake: 10 }, { headers });
        console.log('Color Match result:', colorRes.data);
        console.log('\n--- Testing Pool Master ---');
        const poolRes = await axios.post(`${API_URL}/game/play/pool`, { stake: 10 }, { headers });
        console.log('Pool Master result:', poolRes.data);
        console.log('\n--- Checking Final Balance ---');
        const balanceRes = await axios.get(`${API_URL}/wallet/balance`, { headers });
        console.log('Current Balance:', balanceRes.data.available);
    }
    catch (error) {
        console.error('Test failed:', error.response?.data || error.message);
    }
}
testGames();
