import axios from 'axios';

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InRlc3RwMUBwb3R0YS5jb20iLCJzdWIiOiJmYzVjZGFmMi05YTc2LTQ0NDYtYTdiMC03N2JmZTNkNGU2MzciLCJyb2xlIjoiVVNFUiIsImlhdCI6MTc2ODE2MDEwMSwiZXhwIjoxNzY4MTYzNzAxfQ.dZ5MgcLv0Om8dKprRMXXPd3UohDA8_XAZ7I4YLQPvZk';
const API_URL = 'http://localhost:3000';

async function testWithdrawal() {
    console.log('--- STARTING WITHDRAWAL TEST ---');
    try {
        // 1. Get initial balance
        const balanceRes = await axios.get(`${API_URL}/wallet/balance`, {
            headers: { Authorization: `Bearer ${TOKEN}` }
        });
        console.log('Initial Balance:', balanceRes.data);

        // 2. Attempt withdrawal
        console.log('Attempting withdrawal of 10 GHS...');
        const withdrawRes = await axios.post(`${API_URL}/payments/withdraw`, {
            amount: 10,
            bankCode: '044', // Access Bank (for testing)
            accountNumber: '0123456789'
        }, {
            headers: { Authorization: `Bearer ${TOKEN}` }
        });
        console.log('Withdrawal Success:', withdrawRes.data);

        // 3. Get final balance
        const finalBalanceRes = await axios.get(`${API_URL}/wallet/balance`, {
            headers: { Authorization: `Bearer ${TOKEN}` }
        });
        console.log('Final Balance:', finalBalanceRes.data);

    } catch (error: any) {
        console.error('Test Failed!');
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', error.response.data);
        } else {
            console.error('Message:', error.message);
        }
    }
}

testWithdrawal();
