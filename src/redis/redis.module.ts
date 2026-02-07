import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import RedisMock from 'ioredis-mock';

@Global()
@Module({
    providers: [
        {
            provide: 'REDIS_CLIENT',
            useFactory: (configService: ConfigService) => {
                // Using in-memory Redis mock for single-node cost optimization
                console.log('Using in-memory Redis (ioredis-mock)');
                return new RedisMock();
            },
            inject: [ConfigService],
        },
    ],
    exports: ['REDIS_CLIENT'],
})
export class RedisModule { }
