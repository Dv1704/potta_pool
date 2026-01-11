"use strict";
// import { fetch } from 'undici'; // Global fetch is available in Node 18+
const BASE_URL = 'http://localhost:3000';
async function verify() {
    console.log('--- Starting API Verification ---');
    console.log(`Base URL: ${BASE_URL}`);
    const uniqueId = Math.random().toString(36).substring(7);
    const email = `test_user_${uniqueId}@example.com`;
    const password = 'password123';
    // 1. Register
    console.log(`\n1. Registering user: ${email}`);
    const regRes = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name: 'Test User' })
    });
    const regData = await regRes.json();
    console.log(`Status: ${regRes.status}`);
    if (!regRes.ok)
        console.log('Error:', regData);
    // 2. Login
    console.log(`\n2. Logging in...`);
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) {
        console.error('Login failed:', loginData);
        return;
    }
    const token = loginData.access_token;
    console.log(`Login successful. Token received.`);
    const authHeaders = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    // 3. Get Profile
    console.log(`\n3. Getting Profile...`);
    const profileRes = await fetch(`${BASE_URL}/auth/profile`, { headers: authHeaders });
    console.log(`Status: ${profileRes.status}`);
    const profileData = await profileRes.json();
    console.log('Profile:', profileData);
    // 4. Get Wallet Balance
    console.log(`\n4. Getting Wallet Balance...`);
    const balRes = await fetch(`${BASE_URL}/wallet/balance`, { headers: authHeaders });
    console.log(`Status: ${balRes.status}`);
    const balData = await balRes.json();
    console.log('Balance:', balData);
    // 5. Get Live Rates
    console.log(`\n5. Getting Live Rates...`);
    const ratesRes = await fetch(`${BASE_URL}/wallet/rates`, { headers: authHeaders });
    console.log(`Status: ${ratesRes.status}`);
    const ratesData = await ratesRes.json();
    console.log('Rates:', ratesData);
    // 6. Initialize Deposit
    console.log(`\n6. Initializing Deposit (100 GHS)...`);
    const depRes = await fetch(`${BASE_URL}/payments/deposit/initialize`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
            amount: 100,
            currency: 'GHS',
            email: email
        })
    });
    console.log(`Status: ${depRes.status}`);
    const depData = await depRes.json();
    console.log('Deposit Response:', depData);
    // 7. Wallet History
    console.log(`\n7. Getting Wallet History...`);
    const histRes = await fetch(`${BASE_URL}/wallet/history`, { headers: authHeaders });
    console.log(`Status: ${histRes.status}`);
    const histData = await histRes.json();
    console.log('History (first 2):', Array.isArray(histData) ? histData.slice(0, 2) : histData);
    // 8. Admin Dashboard (Should Fail)
    console.log(`\n8. Testing Admin Access (Expected Failure)...`);
    const adminRes = await fetch(`${BASE_URL}/admin/dashboard`, { headers: authHeaders });
    console.log(`Status: ${adminRes.status} (Expected 403)`);
    if (adminRes.status !== 403) {
        console.log('Response:', await adminRes.json());
    }
    console.log('\n--- Verification Complete ---');
}
verify().catch(console.error);
