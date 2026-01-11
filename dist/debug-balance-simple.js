import { PrismaClient } from './src/generated/client/client.ts';
process.env.DATABASE_URL = 'postgresql://neondb_owner:npg_0IdaPWC9cZmy@ep-steep-wildflower-a218086y-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require';
const prisma = new PrismaClient();
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
                take: 5,
            });
            console.log('Recent 5 Ledger Entries:');
            console.log(JSON.stringify(ledger, null, 2));
        }
        const events = await prisma.processedWebhook.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5
        });
        console.log('Recent Webhooks:', events);
    }
    catch (e) {
        console.error('Error:', e);
    }
}
main().finally(() => prisma.$disconnect());
