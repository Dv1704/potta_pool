import { Redis } from 'ioredis';
import * as dotenv from 'dotenv';
dotenv.config();
async function testRedis() {
    console.log("Connecting to Redis...");
    const redisUrl = process.env.REDIS_URL;
    console.log("Using URL:", redisUrl.replace(/:[^:@]+@/, ':****@')); // Mask password
    try {
        const redis = new Redis(redisUrl, {
            tls: { rejectUnauthorized: false } // Upstash often needs this or standard tls options
        });
        redis.on('error', (err) => {
            console.error("Redis Error:", err);
        });
        console.log("Setting key...");
        await redis.set('potta_test_key', 'Hello Upstash successfully connected!');
        console.log("Getting key...");
        const value = await redis.get('potta_test_key');
        console.log("---------------------------------------------------");
        console.log("SUCCESS! Retrieved from Redis:", value);
        console.log("---------------------------------------------------");
        await redis.quit();
    }
    catch (error) {
        console.error("Test Failed:", error);
    }
}
testRedis();
