"use strict";
// const BASE_URL = 'http://localhost:3000';
async function getToken() {
    const uniqueId = Math.random().toString(36).substring(7);
    const email = `token_user_${uniqueId}@example.com`;
    const password = 'password123';
    // Register
    await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name: 'Token User' })
    });
    // Login
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await loginRes.json();
    console.log('\n⬇️ COPY THIS TOKEN BELOW (No Quotes!) ⬇️\n');
    console.log(data.access_token);
    console.log('\n⬆️ ------------------------------------ ⬆️\n');
}
getToken().catch(console.error);
