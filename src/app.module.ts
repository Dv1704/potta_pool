import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { WalletModule } from './wallet/wallet.module.js';
import { GameModule } from './game/game.module.js';
import { RedisModule } from './redis/redis.module.js';
import { AdminModule } from './admin/admin.module.js';
import { FraudModule } from './fraud/fraud.module.js';
import { MetricsController } from './metrics.controller.js';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor.js';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrometheusModule.register({
            path: '/prometheus-metrics',
            defaultMetrics: {
                enabled: true,
            },
        }),
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
        FraudModule,
    ],
    controllers: [MetricsController],
    providers: [
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: MetricsInterceptor,
        },
    ],
})
export class AppModule { }
