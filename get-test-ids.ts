import pkg from './src/generated/client/index.js';
const { PrismaClient } = pkg;

const prisma = new PrismaClient();

async function listUsers() {
    try {
        const users = await prisma.user.findMany({
            where: { email: { in: ['testp1@potta.com', 'testp2@potta.com'] } },
            select: { id: true, email: true }
        });
        console.log(JSON.stringify(users));
    } catch (e: any) {
        console.error('Failed to list users:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

listUsers();
