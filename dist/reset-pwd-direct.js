import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import * as bcrypt from 'bcrypt';
const prisma = new PrismaClient();
async function resetPassword() {
    const email = 'victorolanikanju@gmail.com';
    const password = 'deevictor';
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        const user = await prisma.user.update({
            where: { email },
            data: { password: hashedPassword }
        });
        console.log('Password reset successful for:', user.email);
    }
    catch (e) {
        console.error('Password reset failed:', e.message);
    }
    finally {
        await prisma.$disconnect();
    }
}
resetPassword();
