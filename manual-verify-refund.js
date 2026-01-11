import axios from 'axios';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:3000';
const SECRET_KEY = 'sk_test_d48ab129a255e43ced1325a65d5c7e6974ed26a1';

async function run() {
    try {
        console.log('--- Starting Manual Refund Verification ---');

        // 1. Register/Login
        const email = `refund-test-${Date.now()}@test.com`;
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
        console.log('Deposit successful.');

        // 3. Check Initial Balance
        let walletRes = await axios.get(`${BASE_URL}/wallet/balance`, { headers: { Authorization: `Bearer ${token}` } });
        console.log(`Initial Balance: ${walletRes.data.available} GHS`);
        if (walletRes.data.available !== 100) throw new Error('Deposit failed');

        // 4. Attempt Withdrawal with INVALID details to trigger failure
        console.log('Attempting withdrawal with INVALID bank code...');
        try {
            await axios.post(`${BASE_URL}/payments/withdraw`, {
                amount: 50,
                bankCode: 'INVALID_BANK_CODE_XYZ',
                accountNumber: '1234567890',
                accountName: 'Test Fail'
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.error('ERROR: Withdrawal should have failed but succeeded!');
            process.exit(1);
        } catch (error) {
            console.log(`Withdrawal failed as expected: ${error.response?.data?.message}`);
        }

        // 5. Verify Balance (Should be 100 if refunded, 50 if bug exists)
        console.log('Verifying final balance...');
        walletRes = await axios.get(`${BASE_URL}/wallet/balance`, { headers: { Authorization: `Bearer ${token}` } });
        console.log(`Final Balance: ${walletRes.data.available} GHS`);

        if (walletRes.data.available === 100) {
            console.log('SUCCESS: Funds were refunded correctly!');
        } else {
            console.error(`FAILURE: Funds were NOT refunded. Balance is ${walletRes.data.availableBalance}`);
            process.exit(1);
        }

    } catch (err) {
        console.error('Script Error:', err.message);
        if (err.response) console.error('Response:', err.response.data);
        process.exit(1);
    }
}

run();
