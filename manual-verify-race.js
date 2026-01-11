import axios from 'axios';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:3000';
const SECRET_KEY = 'sk_test_d48ab129a255e43ced1325a65d5c7e6974ed26a1';

async function run() {
    try {
        console.log('--- Starting Manual Race Condition Verification ---');

        // 1. Register/Login
        const email = `race-test-${Date.now()}@test.com`;
        const password = 'password123';
        const referralCode = `REF${Date.now()}`;

        console.log(`Creating user: ${email}`);
        await axios.post(`${BASE_URL}/auth/register`, {
            email,
            password,
            referralCode
        });

        console.log('Logging in...');
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            email,
            password
        });
        const token = loginRes.data.access_token;
        const userId = loginRes.data.userId || (await axios.get(`${BASE_URL}/auth/profile`, { headers: { Authorization: `Bearer ${token}` } })).data.id;

        // 2. Deposit 100 GHS
        console.log(`Depositing 100 GHS for user ${userId}...`);
        const depositRef = `dep-${Date.now()}`;
        const depositPayload = {
            event: 'charge.success',
            data: {
                reference: depositRef,
                amount: 10000, // 100 GHS
                currency: 'GHS',
                metadata: { userId },
                channel: 'mobile_money'
            }
        };
        const signature = crypto.createHmac('sha512', SECRET_KEY).update(JSON.stringify(depositPayload)).digest('hex');

        await axios.post(`${BASE_URL}/payments/webhook/paystack`, depositPayload, {
            headers: { 'x-paystack-signature': signature }
        });

        // Check Initial Balance
        let walletRes = await axios.get(`${BASE_URL}/wallet/balance`, { headers: { Authorization: `Bearer ${token}` } });
        console.log(`Initial Balance: ${walletRes.data.available} GHS`);
        if (walletRes.data.available !== 100) throw new Error('Deposit failed');

        // 3. Attempt Double Spend (Race Condition)
        // Fire 5 requests of 60 GHS. Only ONE should succeed.
        console.log('Attempting 5 simultaneous withdrawals of 60 GHS (simulating double spend)...');

        const requests = [];
        for (let i = 0; i < 5; i++) {
            requests.push(
                axios.post(`${BASE_URL}/payments/withdraw`, {
                    amount: 60,
                    bankCode: 'MTN',
                    accountNumber: '1234567890',
                    accountName: 'Race Test'
                }, {
                    headers: { Authorization: `Bearer ${token}` }
                }).then(res => ({ status: 'success', data: res.data }))
                    .catch(err => ({ status: 'failed', error: err.response?.data?.message || err.message }))
            );
        }

        const results = await Promise.all(requests);

        const successes = results.filter(r => r.status === 'success');
        const failures = results.filter(r => r.status === 'failed');

        console.log(`Results: ${successes.length} Successes, ${failures.length} Failures`);

        // 4. Verify Final Balance
        walletRes = await axios.get(`${BASE_URL}/wallet/balance`, { headers: { Authorization: `Bearer ${token}` } });
        console.log(`Final Balance: ${walletRes.data.available} GHS`);

        // Validation
        if (successes.length === 1 && failures.length === 4) {
            console.log('SUCCESS: Race condition prevented! Only 1 withdrawal succeeded.');
            if (walletRes.data.available === 40) {
                console.log('Balance correct: 40 GHS');
            } else {
                console.error('FAILURE: Balance incorrect!');
                process.exit(1);
            }
        } else {
            console.error('FAILURE: Race condition detected or Logic Error!');
            console.error(`Expected 1 success, got ${successes.length}`);
            process.exit(1);
        }

    } catch (err) {
        console.error('Script Error:', err.message);
        if (err.response) console.error('Response:', err.response.data);
        process.exit(1);
    }
}

run();
