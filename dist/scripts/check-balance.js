import { PrismaClient } from '../src/generated/client/client.js';
import * as dotenv from 'dotenv';
dotenv.config();
const prisma = new PrismaClient();
async function main() {
    const users = await prisma.user.findMany({
        include: { wallet: true }
    });
    console.log('--- User Balances ---');
    users.forEach(u => {
        console.log(`User: ${u.email} | Name: ${u.name} | Balance: ${u.wallet?.availableBalance} ${u.wallet?.currency} | Locked: ${u.wallet?.lockedBalance}`);
    });
    console.log('---------------------');
}
main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
