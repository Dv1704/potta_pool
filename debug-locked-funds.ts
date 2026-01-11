import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './src/generated/client/client.js';

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function checkLockedFunds() {
    try {
        const userId = '4e6fa260-9085-4158-81d1-96e2249e55e7';

        // Check wallet
        const wallet = await prisma.wallet.findUnique({
            where: { userId }
        });

        console.log('Wallet Status:');
        console.log(`Available: ${wallet?.availableBalance} GHS`);
        console.log(`Locked: ${wallet?.lockedBalance} GHS`);
        console.log(`Total: ${Number(wallet?.availableBalance || 0) + Number(wallet?.lockedBalance || 0)} GHS`);
        console.log('');

        // Check in-progress games
        const games = await prisma.game.findMany({
            where: {
                players: {
                    has: userId
                },
                status: 'IN_PROGRESS'
            }
        });

        console.log(`In-Progress Games: ${games.length}`);
        games.forEach(g => {
            console.log(`- Game ${g.id}: ${g.stake} GHS locked (Mode: ${g.mode})`);
        });

        if (games.length > 0) {
            console.log('');
            console.log('⚠️ These games have locked funds. Complete or cancel them to unlock.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkLockedFunds();
