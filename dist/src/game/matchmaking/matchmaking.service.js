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
    getQueueKey(mode, stake) {
        return `matchmaking:queue:${mode}:${stake}`;
    }
    async addToQueue(player) {
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
