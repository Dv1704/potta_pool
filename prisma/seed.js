const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const systemEmail = "system@pottagame.com";

    // Create System User
    const system = await prisma.user.upsert({
        where: { email: systemEmail },
        update: {},
        create: {
            email: systemEmail,
            name: "System Treasury",
            wallet: {
                create: {
                    availableBalance: 0,
                    lockedBalance: 0
                }
            }
        },
    });

    console.log('System wallet:', system);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
