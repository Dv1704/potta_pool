import pkg from './src/generated/client/index.js';
const { PrismaClient, Prisma } = pkg;

const prisma = new PrismaClient();

async function injectBalance() {
    const emails = ['testp1@potta.com', 'testp2@potta.com'];

    for (const email of emails) {
        try {
            const user = await prisma.user.findUnique({
                where: { email },
                include: { wallet: true }
            });

            if (!user) {
                console.log(`User ${email} not found.`);
                continue;
            }

            if (!user.wallet) {
                await prisma.wallet.create({
                    data: {
                        userId: user.id,
                        availableBalance: new Prisma.Decimal(100)
                    }
                });
            } else {
                await prisma.wallet.update({
                    where: { userId: user.id },
                    data: {
                        availableBalance: new Prisma.Decimal(100)
                    }
                });
            }
            console.log(`Balance injected for ${email}`);
        } catch (e: any) {
            console.error(`Failed for ${email}:`, e.message);
        }
    }
    await prisma.$disconnect();
}

injectBalance();
