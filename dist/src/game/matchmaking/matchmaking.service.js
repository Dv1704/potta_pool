var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
let MatchmakingService = class MatchmakingService {
    redis;
    constructor(redis) {
        this.redis = redis;
    }
    getBracket(stake) {
        return stake.toString();
    }
    getAdjacentBrackets(bracket) {
        return [];
    }
    getQueueKey(mode, bracket) {
        return `matchmaking:queue:${mode}:${bracket}`;
    }
    async addToQueue(player) {
        const bracket = this.getBracket(player.stake);
        const key = this.getQueueKey(player.mode, bracket);
        const lockKey = `${key}:lock`;
        // simple distributed lock for matchmaking
        const lock = await this.redis.set(lockKey, 'locked', 'EX', 2, 'NX');
        if (!lock) {
            // If locked, retry slightly later
            await new Promise(resolve => setTimeout(resolve, 100));
            return this.addToQueue(player);
        }
        try {
            // Check if player is already in queue
            const existing = await this.redis.lrange(key, 0, -1);
            if (existing.some(p => JSON.parse(p).userId === player.userId)) {
                return null;
            }
            // Try to find a match in primary bracket
            let opponentJson = await this.redis.lpop(key);
            // If no match in primary bracket, try adjacent brackets
            if (!opponentJson) {
                const adjacentBrackets = this.getAdjacentBrackets(bracket);
                for (const adjBracket of adjacentBrackets) {
                    const adjKey = this.getQueueKey(player.mode, adjBracket);
                    opponentJson = await this.redis.lpop(adjKey);
                    if (opponentJson)
                        break;
                }
            }
            if (opponentJson) {
                const opponent = JSON.parse(opponentJson);
                return [player, opponent];
            }
            // No match found, add to queue
            await this.redis.rpush(key, JSON.stringify(player));
            return null;
        }
        finally {
            await this.redis.del(lockKey);
        }
    }
    async removeFromQueue(userId) {
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
};
MatchmakingService = __decorate([
    Injectable(),
    __param(0, Inject('REDIS_CLIENT')),
    __metadata("design:paramtypes", [Redis])
], MatchmakingService);
export { MatchmakingService };
