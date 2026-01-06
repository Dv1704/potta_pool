import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { WalletModule } from './wallet/wallet.module.js';
import { GameModule } from './game/game.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        UsersModule,
        AuthModule,
        WalletModule,
        GameModule,
        RedisModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule { }
