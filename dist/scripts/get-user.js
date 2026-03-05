import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    try {
        const user = await prisma.user.findFirst({
            select: { id: true, email: true }
        });
        if (user) {
            console.log(JSON.stringify(user));
        }
        else {
            console.log('No user found');
        }
    }
    catch (error) {
        console.error('Connection error:', error.message);
    }
    finally {
        await prisma.$disconnect();
    }
}
main();
