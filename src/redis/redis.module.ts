import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import RedisMock from 'ioredis-mock';

@Global()
@Module({
    providers: [
        {
            provide: 'REDIS_CLIENT',
            useFactory: (configService: ConfigService) => {
                const redisUrl = configService.get<string>('REDIS_URL');
                if (redisUrl) {
                    try {
                        console.log('Connecting to Redis at:', redisUrl);
                        return new Redis(redisUrl, {
                            maxRetriesPerRequest: 3,
                        });
                    } catch (e: any) {
                        console.warn('Failed to connect to Redis, falling back to mock:', e.message);
                    }
                }
                console.log('Using in-memory Redis (ioredis-mock)');
                return new RedisMock();
            },
            inject: [ConfigService],
        },
    ],
    exports: ['REDIS_CLIENT'],
})
export class RedisModule { }

