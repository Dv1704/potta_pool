var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { WalletModule } from './wallet/wallet.module.js';
import { GameModule } from './game/game.module.js';
import { RedisModule } from './redis/redis.module.js';
import { AdminModule } from './admin/admin.module.js';
let AppModule = class AppModule {
};
AppModule = __decorate([
    Module({
        imports: [
            ConfigModule.forRoot({ isGlobal: true }),
            ScheduleModule.forRoot(),
            ThrottlerModule.forRoot([{
                    ttl: 60000, // 60 seconds
                    limit: 100, // 100 requests per minute (global default)
                }]),
            PrismaModule,
            UsersModule,
            AuthModule,
            WalletModule,
            GameModule,
            RedisModule,
            AdminModule,
        ],
        controllers: [],
        providers: [
            {
                provide: APP_GUARD,
                useClass: ThrottlerGuard,
            },
        ],
    })
], AppModule);
export { AppModule };
