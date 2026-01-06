var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
let RedisModule = class RedisModule {
};
RedisModule = __decorate([
    Global(),
    Module({
        providers: [
            {
                provide: 'REDIS_CLIENT',
                useFactory: (configService) => {
                    const redisUrl = configService.get('REDIS_URL') || 'redis://localhost:6379';
                    return new Redis(redisUrl);
                },
                inject: [ConfigService],
            },
        ],
        exports: ['REDIS_CLIENT'],
    })
], RedisModule);
export { RedisModule };
