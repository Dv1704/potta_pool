import { io } from 'socket.io-client';

const URL = 'https://potta-pool-api-muddy-night-3627.fly.dev';

console.log(`Connecting to ${URL}...`);

const socket = io(URL, {
    transports: ['websocket'],
    reconnection: false,
    query: { userId: 'debug-user' }
});

socket.on('connect', () => {
    console.log('✅ Connected successfully via WebSocket transport!');
    socket.disconnect();
    process.exit(0);
});

socket.on('connect_error', (err) => {
    console.error(`❌ Connection Error: ${err.message}`);
    // Try to inspect the error object more deeply if possible
    console.error(err);
    socket.disconnect();
    process.exit(1);
});

// Timeout
setTimeout(() => {
    console.log('❌ Timeout - could not connect');
    process.exit(1);
}, 10000);
