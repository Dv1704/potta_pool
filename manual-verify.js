import axios from 'axios';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:3000';
const SECRET_KEY = 'sk_test_d48ab129a255e43ced1325a65d5c7e6974ed26a1';

async function run() {
    try {
        // 1. Register User
        const email = `manual-test-${Date.now()}@test.com`;
        const password = 'password123';
        const referralCode = `REF${Date.now()}`;

        console.log(`Registering user: ${email}`);
        const regRes = await axios.post(`${BASE_URL}/auth/register`, {
            email,
            password,
            referralCode
        });

        // Check if data structure is flat or nested
        const userId = regRes.data.userId || regRes.data.id;
        console.log(`User created. ID: ${userId}`);

        // Login to get token
        console.log('Logging in...');
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            email,
            password
        });
        const authToken = loginRes.data.access_token;

        // 2. Simulate Paystack Webhook
        const reference = `ref-${Date.now()}`;
        const amountGHS = 50;
        const payload = {
            event: 'charge.success',
            data: {
                reference,
                amount: amountGHS * 100, // pesewas
                currency: 'GHS',
                metadata: { userId },
                channel: 'mobile_money'
            }
        };

        const signature = crypto
            .createHmac('sha512', SECRET_KEY)
            .update(JSON.stringify(payload))
            .digest('hex');

        console.log(`Sending webhook with ref: ${reference}`);
        await axios.post(`${BASE_URL}/payments/webhook/paystack`, payload, {
            headers: {
                'x-paystack-signature': signature
            }
        });

        console.log('Webhook sent successfully.');

        // 3. Check Balance
        console.log('Checking balance...');
        const walletRes = await axios.get(`${BASE_URL}/wallet`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });

        console.log('Wallet Response:', walletRes.data);

        if (walletRes.data.availableBalance === amountGHS) {
            console.log('SUCCESS: Balance matches deposit!');
        } else {
            console.log(`FAILURE: Expected ${amountGHS}, got ${walletRes.data.availableBalance}`);
            process.exit(1);
        }

    } catch (err) {
        console.error('Error:', err.response ? err.response.data : err.message);
        process.exit(1);
    }
}

run();
