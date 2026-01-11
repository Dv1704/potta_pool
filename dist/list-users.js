import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();
async function listUsers() {
    try {
        const users = await prisma.user.findMany({
            select: { email: true }
        });
        console.log('Registered Users:');
        users.forEach(u => console.log(`- ${u.email}`));
    }
    catch (e) {
        console.error('Failed to list users:', e.message);
    }
    finally {
        await prisma.$disconnect();
    }
}
listUsers();
