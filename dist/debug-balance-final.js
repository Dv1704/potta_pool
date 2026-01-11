import { PrismaClient } from './src/generated/client/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
const connectionString = 'postgresql://neondb_owner:npg_0IdaPWC9cZmy@ep-steep-wildflower-a218086y-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
async function main() {
    try {
        const email = 'victorolanikanju@gmail.com';
        console.log(`Searching for user: ${email}`);
        const user = await prisma.user.findUnique({
            where: { email },
            include: { wallet: true }
        });
        console.log('User:', user);
        if (user?.wallet) {
            const ledger = await prisma.ledger.findMany({
                where: { walletId: user.wallet.id },
                orderBy: { createdAt: 'desc' },
                take: 5
            });
            console.log('Ledger:', ledger);
        }
        const webhooks = await prisma.processedWebhook.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5
        });
        console.log('Webhooks:', webhooks);
    }
    catch (err) {
        console.error(err);
    }
    finally {
        await prisma.$disconnect();
        await pool.end();
    }
}
main();
