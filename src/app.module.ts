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

@Module({
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
export class AppModule { }
