import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';

export class RedisIoAdapter extends IoAdapter {
    private adapterConstructor: any;

    async connectToRedis(redisUrl: string): Promise<void> {
        const pubClient = new Redis(redisUrl, { lazyConnect: true });
        const subClient = new Redis(redisUrl, { lazyConnect: true }); // duplicate might inherit verify? Safer to new.

        await Promise.all([
            pubClient.connect(),
            subClient.connect(),
        ]).catch((err) => {
            // Already connected usually if URL is handled implicitly
            if (err.message.includes('already connected')) return;
            throw err;
        });

        this.adapterConstructor = createAdapter(pubClient, subClient);
    }

    createIOServer(port: number, options?: ServerOptions): any {
        const server = super.createIOServer(port, options);
        server.adapter(this.adapterConstructor);
        return server;
    }
}
