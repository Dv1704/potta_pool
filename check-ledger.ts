import pkg from './src/generated/client/index.js';
const { PrismaClient } = pkg;

const prisma = new PrismaClient();

async function checkLedger() {
    const userId = 'fc5cdaf2-9a76-4446-a7b0-77bfe3d4e637';
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { wallet: true }
        });
        if (!user || !user.wallet) return;

        const ledger = await prisma.ledger.findMany({
            where: { walletId: user.wallet.id },
            orderBy: { createdAt: 'desc' },
            take: 10
        });
        console.log(JSON.stringify(ledger, null, 2));
    } catch (e: any) {
        console.error(e.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkLedger();
