import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
async function main() {
    const url = process.env.DATABASE_URL;
    console.log('Testing connection to URL (masked pass):', url?.replace(/:[^:@/]+@/, ':****@'));
    const prisma = new PrismaClient({
        datasourceUrl: url,
    });
    try {
        const user = await prisma.user.findFirst();
        console.log('Success! Found user:', user ? user.email : 'None');
    }
    catch (error) {
        console.error('Connection failed:', error.message);
    }
    finally {
        await prisma.$disconnect();
    }
}
main();
