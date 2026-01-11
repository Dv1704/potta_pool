import pkg from './src/generated/client/index.js';
const { PrismaClient } = pkg;
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://victor:deevictor@localhost:5432/potta?schema=public' });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
async function resetPasswords() {
    console.log('Resetting passwords...');
    const hashedPassword = await bcrypt.hash('PottaTest123!', 10);
    const emails = ['testp1@potta.com', 'testp2@potta.com'];
    for (const email of emails) {
        await prisma.user.update({
            where: { email },
            data: { password: hashedPassword }
        });
        console.log(`Password reset for ${email}`);
    }
    await prisma.$disconnect();
}
resetPasswords();
