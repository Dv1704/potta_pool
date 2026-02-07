var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import RedisMock from 'ioredis-mock';
let RedisModule = class RedisModule {
};
RedisModule = __decorate([
    Global(),
    Module({
        providers: [
            {
                provide: 'REDIS_CLIENT',
                useFactory: (configService) => {
                    // Using in-memory Redis mock for single-node cost optimization
                    console.log('Using in-memory Redis (ioredis-mock)');
                    return new RedisMock();
                },
                inject: [ConfigService],
            },
        ],
        exports: ['REDIS_CLIENT'],
    })
], RedisModule);
export { RedisModule };
