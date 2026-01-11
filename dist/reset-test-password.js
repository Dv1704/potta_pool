import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import * as bcrypt from 'bcrypt';
const prisma = new PrismaClient();
async function resetPassword() {
    try {
        const email = 'victorolanikanju@gmail.com';
        const newPassword = 'password123';
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const user = await prisma.user.update({
            where: { email },
            data: { password: hashedPassword }
        });
        console.log(`Password reset successfully for ${email}`);
    }
    catch (error) {
        console.error('Failed to reset password:', error.message);
    }
    finally {
        await prisma.$disconnect();
    }
}
resetPassword();
