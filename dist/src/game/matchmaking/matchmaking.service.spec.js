import { Test } from '@nestjs/testing';
import { MatchmakingService } from './matchmaking.service';
import RedisMock from 'ioredis-mock';
describe('MatchmakingService', () => {
    let service;
    let redisMock;
    beforeEach(async () => {
        redisMock = new RedisMock();
        const module = await Test.createTestingModule({
            providers: [
                MatchmakingService,
                {
                    provide: 'REDIS_CLIENT',
                    useValue: redisMock,
                },
            ],
        }).compile();
        service = module.get(MatchmakingService);
    });
    it('should pair two players with same stake and mode', async () => {
        const player1 = {
            userId: 'u1',
            socketId: 's1',
            stake: 100,
            mode: 'turn',
        };
        const player2 = {
            userId: 'u2',
            socketId: 's2',
            stake: 100,
            mode: 'turn',
        };
        const result1 = await service.addToQueue(player1);
        expect(result1).toBeNull();
        const result2 = await service.addToQueue(player2);
        expect(result2).toBeDefined();
        expect(result2?.[0].userId).toBe('u2');
        expect(result2?.[1].userId).toBe('u1');
    });
    it('should not pair players with different stakes', async () => {
        const player1 = {
            userId: 'u1',
            socketId: 's1',
            stake: 100,
            mode: 'turn',
        };
        const player2 = {
            userId: 'u2',
            socketId: 's2',
            stake: 200,
            mode: 'turn',
        };
        await service.addToQueue(player1);
        const result = await service.addToQueue(player2);
        expect(result).toBeNull();
    });
    it('should remove player from queue', async () => {
        const player1 = {
            userId: 'u1',
            socketId: 's1',
            stake: 100,
            mode: 'turn',
        };
        await service.addToQueue(player1);
        await service.removeFromQueue('u1');
        const key = 'matchmaking:queue:turn:100';
        const queueSize = await redisMock.llen(key);
        expect(queueSize).toBe(0);
    });
});
