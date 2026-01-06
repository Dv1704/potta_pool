import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';

export interface PlayerInfo {
    userId: string;
    socketId: string;
    stake: number;
    mode: 'speed' | 'turn';
}

@Injectable()
export class MatchmakingService {
    constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) { }

    private getQueueKey(mode: string, stake: number): string {
        return `matchmaking:queue:${mode}:${stake}`;
    }

    async addToQueue(player: PlayerInfo): Promise<PlayerInfo[] | null> {
        const key = this.getQueueKey(player.mode, player.stake);

        // Check if player is already in queue (simplified check)
        const existing = await this.redis.lrange(key, 0, -1);
        if (existing.some(p => JSON.parse(p).userId === player.userId)) {
            return null;
        }

        // Try to find a match
        const opponentJson = await this.redis.lpop(key);
        if (opponentJson) {
            const opponent = JSON.parse(opponentJson);
            return [player, opponent];
        }

        // No match found, add to queue
        await this.redis.rpush(key, JSON.stringify(player));
        return null;
    }

    async removeFromQueue(userId: string): Promise<void> {
        // This is expensive as we have to check all queues or maintain a mapping
        // For simplicity in this demo/refactor, we scan queues. 
        // In full prod, we'd maintain a `user:matchmaking:key` mapping.
        const keys = await this.redis.keys('matchmaking:queue:*');
        for (const key of keys) {
            const list = await this.redis.lrange(key, 0, -1);
            for (const item of list) {
                if (JSON.parse(item).userId === userId) {
                    await this.redis.lrem(key, 0, item);
                }
            }
        }
    }
}
