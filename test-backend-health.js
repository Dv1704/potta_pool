import https from 'https';
import { io } from 'socket.io-client';

const BASE_URL = 'https://potta-pool-api-muddy-night-3627.fly.dev';

console.log('🔍 Testing Backend Health...\n');

// Test 1: HTTP Health Check
function testHTTP() {
    return new Promise((resolve) => {
        console.log('1️⃣ Testing HTTP endpoint...');
        https.get(BASE_URL, (res) => {
            console.log(`   ✅ HTTP Status: ${res.statusCode}`);
            resolve(true);
        }).on('error', (err) => {
            console.log(`   ❌ HTTP Error: ${err.message}`);
            resolve(false);
        });
    });
}

// Test 2: WebSocket Connection
function testWebSocket() {
    return new Promise((resolve) => {
        console.log('\n2️⃣ Testing WebSocket connection...');

        const socket = io(BASE_URL, {
            transports: ['websocket'],
            reconnection: false,
            timeout: 10000
        });

        socket.on('connect', () => {
            console.log('   ✅ WebSocket connected successfully!');
            socket.disconnect();
            resolve(true);
        });

        socket.on('connect_error', (err) => {
            console.log(`   ❌ WebSocket Error: ${err.message}`);
            socket.disconnect();
            resolve(false);
        });

        setTimeout(() => {
            console.log('   ❌ WebSocket timeout after 10s');
            socket.disconnect();
            resolve(false);
        }, 10000);
    });
}

// Test 3: Auth Endpoint
function testAuth() {
    return new Promise((resolve) => {
        console.log('\n3️⃣ Testing /auth/login endpoint...');

        const data = JSON.stringify({
            email: 'test@example.com',
            password: 'test123'
        });

        const options = {
            hostname: 'potta-pool-api-muddy-night-3627.fly.dev',
            path: '/auth/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            console.log(`   ✅ Auth endpoint responded: ${res.statusCode}`);
            resolve(true);
        });

        req.on('error', (err) => {
            console.log(`   ❌ Auth Error: ${err.message}`);
            resolve(false);
        });

        req.write(data);
        req.end();
    });
}

// Run all tests
async function runTests() {
    const httpOk = await testHTTP();
    const wsOk = await testWebSocket();
    const authOk = await testAuth();

    console.log('\n' + '='.repeat(50));
    console.log('📊 Test Results:');
    console.log(`   HTTP:      ${httpOk ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   WebSocket: ${wsOk ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Auth API:  ${authOk ? '✅ PASS' : '❌ FAIL'}`);
    console.log('='.repeat(50));

    if (httpOk && wsOk && authOk) {
        console.log('\n🎉 All tests passed! Backend is healthy.');
        process.exit(0);
    } else {
        console.log('\n⚠️  Some tests failed. Backend needs attention.');
        process.exit(1);
    }
}

runTests();
