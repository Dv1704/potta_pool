import { io } from 'socket.io-client';

const URL = 'https://potta-pool-api-muddy-night-3627.fly.dev';

console.log(`Connecting to ${URL}...`);

const socket = io(URL, {
    transports: ['websocket'],
    reconnection: false,
    query: { userId: 'debug-user-123' }
});

socket.on('connect', () => {
    console.log('✅ Connected! Emitting joinQueue...');

    socket.emit('joinQueue', {
        userId: 'debug-user-123',
        stake: 10,
        mode: 'speed'
    });
});

socket.on('waitingInQueue', (data) => {
    console.log('✅ Received waitingInQueue:', data);
    socket.disconnect();
    process.exit(0);
});

socket.on('error', (err) => {
    console.error('❌ Received Error:', err);
    socket.disconnect();
    process.exit(1);
});

setTimeout(() => {
    console.log('❌ Timeout - no response to joinQueue');
    socket.disconnect();
    process.exit(1);
}, 5000);
