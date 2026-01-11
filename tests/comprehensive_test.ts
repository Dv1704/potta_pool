// server/tests/comprehensive_test.ts

// const BASE_URL = 'http://localhost:3000';

async function runTest() {
    console.log('--- Starting Comprehensive API Verification ---');
    console.log(`Time: ${new Date().toISOString()}`);

    // 1. Create a fresh user to ensure clean state
    const uniqueId = Math.random().toString(36).substring(7);
    const email = `verify_${uniqueId}@example.com`;
    const password = 'password123';

    console.log(`\n[STEP 1] Registering User: ${email}`);
    const regRes = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name: 'Verification User' })
    });

    console.log(`Status: ${regRes.status}`);
    if (!regRes.ok) {
        console.error('Registration failed:', await regRes.text());
        return;
    }

    // 2. Login to get token
    console.log(`\n[STEP 2] Logging in`);
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    if (!loginRes.ok) {
        console.error('Login failed:', await loginRes.text());
        return;
    }

    const loginData: any = await loginRes.json();
    const token = loginData.access_token;
    console.log(`Login successful.`);
    console.log(`Token received (first 20 chars): ${token.substring(0, 20)}...`);

    // Construct headers EXACTLY as frontend does
    // Frontend: headers: { 'Authorization': `Bearer ${loginData.access_token}` }
    const authHeaders = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    console.log(`\n[INFO] Using Headers:`, JSON.stringify(authHeaders, null, 2));

    // 3. Test Wallet Balance (The problematic endpoint)
    console.log(`\n[STEP 3] Testing GET /wallet/balance`);
    try {
        const balRes = await fetch(`${BASE_URL}/wallet/balance`, { headers: authHeaders });
        console.log(`Status: ${balRes.status}`);
        console.log(`Response:`, await balRes.json());

        if (balRes.status === 401) {
            console.error('❌ STILL UNAUTHORIZED - Check server logs for "JwtStrategy" output');
        } else if (balRes.ok) {
            console.log('✅ AUTHORIZED - Wallet balance retrieved successfully');
        }
    } catch (e) {
        console.error('Request failed:', e);
    }

    // 4. Test Profile
    console.log(`\n[STEP 4] Testing GET /auth/profile`);
    const profRes = await fetch(`${BASE_URL}/auth/profile`, { headers: authHeaders });
    console.log(`Status: ${profRes.status}`);
    console.log(`Response:`, await profRes.json());

    // 5. Test Game Stats (Frontend: GameDashboard.jsx)
    console.log(`\n[STEP 5] Testing GET /game/stats`);
    const statsRes = await fetch(`${BASE_URL}/game/stats`, { headers: authHeaders });
    console.log(`Status: ${statsRes.status}`);
    // Stats might return 404 if not implemented or empty, but shouldn't be 401
    if (statsRes.ok) {
        console.log(`Response:`, await statsRes.json());
    } else {
        console.log(`Response:`, await statsRes.text());
    }

    console.log('\n--- Verification Complete ---');
}

runTest().catch(console.error);
