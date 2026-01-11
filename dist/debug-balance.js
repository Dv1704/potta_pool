import { PrismaClient } from './src/generated/client/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_0IdaPWC9cZmy@ep-steep-wildflower-a218086y-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
async function main() {
    const email = 'victorolanikanju@gmail.com';
    console.log(`Searching for user: ${email}`);
    try {
        const user = await prisma.user.findUnique({
            where: { email },
            include: { wallet: true },
        });
        if (!user) {
            console.log('User not found');
            return;
        }
        console.log('User found:', user.id);
        console.log('Wallet:', user.wallet);
        if (user.wallet) {
            const ledger = await prisma.ledger.findMany({
                where: { walletId: user.wallet.id },
                orderBy: { createdAt: 'desc' },
                take: 10,
            });
            console.log('Recent 10 Ledger Entries:');
            console.table(ledger.map(l => ({
                id: l.id,
                type: l.type,
                amount: l.amount.toString(),
                desc: l.description,
                date: l.createdAt
            })));
        }
        // Check processed webhooks
        const webhooks = await prisma.processedWebhook.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5
        });
        console.log('Recent Processed Webhooks:', webhooks);
    }
    catch (e) {
        console.error('Error in main:', e);
    }
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
