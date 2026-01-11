
import { PrismaClient } from './src/generated/client/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString = 'postgresql://victor:deevictor@localhost:5432/potta?schema=public';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    const email = 'victorolanikanju@gmail.com';
    console.log(`Checking user: ${email}`);

    const user = await prisma.user.findUnique({
        where: { email },
        include: { wallet: true }
    });

    if (user && user.wallet) {
        console.log(`Balance: ${user.wallet.availableBalance}`);
        console.log(`Wallet ID: ${user.wallet.id}`);

        const ledger = await prisma.ledger.findMany({
            where: { walletId: user.wallet.id },
            orderBy: { createdAt: 'desc' },
            take: 5
        });
        console.log('Recent Transactions:', JSON.stringify(ledger, null, 2));
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
