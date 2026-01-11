import { MatchmakingService } from './src/game/matchmaking/matchmaking.service.js';
import Redis from 'ioredis';
async function testMatchmaking() {
    const redis = new Redis();
    const service = new MatchmakingService(redis);
    console.log('--- Testing Matchmaking Brackets ---');
    // Clean up
    const keys = await redis.keys('matchmaking:queue:*');
    if (keys.length > 0)
        await redis.del(...keys);
    const player1 = { userId: 'user1', socketId: 'sock1', stake: 10, mode: 'speed' };
    const player2 = { userId: 'user2', socketId: 'sock2', stake: 12, mode: 'speed' };
    const player3 = { userId: 'user3', socketId: 'sock3', stake: 16, mode: 'speed' };
    console.log('Adding Player 1 (Stake: 10) to queue...');
    const match1 = await service.addToQueue(player1);
    console.log('Match 1 result:', match1 ? 'MATCHED' : 'QUEUED');
    console.log('Adding Player 2 (Stake: 12) to queue...');
    const match2 = await service.addToQueue(player2);
    console.log('Match 2 result:', match2 ? 'MATCHED' : 'QUEUED');
    if (match2) {
        console.log('Success: Player 1 and Player 2 matched within 10-15 bracket.');
    }
    else {
        console.log('Error: Player 1 and Player 2 should have matched.');
    }
    console.log('Adding Player 3 (Stake: 16) to queue...');
    const match3 = await service.addToQueue(player3);
    console.log('Match 3 result:', match3 ? 'MATCHED' : 'QUEUED');
    if (!match3) {
        console.log('Success: Player 3 (Stake: 16) did not match with others (Bracket 15-20).');
    }
    else {
        console.log('Error: Player 3 should NOT have matched.');
    }
    await redis.quit();
}
testMatchmaking();
