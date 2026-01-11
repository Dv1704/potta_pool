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

    private getBracket(stake: number): string {
        // Define brackets: 1-5, 5-10, 10-15, 15-20, 20-50, 50-100, 100+
        if (stake < 5) return '1-5';
        if (stake < 10) return '5-10';
        if (stake < 15) return '10-15';
        if (stake < 20) return '15-20';
        if (stake < 50) return '20-50';
        if (stake < 100) return '50-100';
        return '100+';
    }

    private getQueueKey(mode: string, bracket: string): string {
        return `matchmaking:queue:${mode}:${bracket}`;
    }

    async addToQueue(player: PlayerInfo): Promise<PlayerInfo[] | null> {
        const bracket = this.getBracket(player.stake);
        const key = this.getQueueKey(player.mode, bracket);

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
