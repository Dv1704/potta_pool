import { PrismaService } from './src/prisma/prisma.service.ts';
import { WalletService } from './src/wallet/wallet.service.ts';
import { FXService } from './src/wallet/fx.service.ts';
import { Prisma } from '@prisma/client';
async function main() {
    const prisma = new PrismaService();
    const fxService = new FXService();
    const walletService = new WalletService(prisma, fxService);
    await prisma.$connect();
    const influencerUser = await prisma.user.findUnique({ where: { email: 'influencer@test.com' } });
    const playerUser = await prisma.user.findUnique({ where: { email: 'player@test.com' } });
    const player2User = await prisma.user.findUnique({ where: { email: 'player2@test.com' } });
    if (!influencerUser || !playerUser || !player2User) {
        throw new Error('Required users not found');
    }
    const matchId = 'test-match-0001';
    const totalPot = 200;
    const stake = new Prisma.Decimal(100);
    await prisma.game.upsert({
        where: { id: matchId },
        update: {
            mode: 'speed',
            stake: new Prisma.Decimal(totalPot),
            status: 'COMPLETED',
            players: [playerUser.id, player2User.id],
            winnerId: playerUser.id,
            influencerId: influencerUser.id,
            updatedAt: new Date(),
        },
        create: {
            id: matchId,
            mode: 'speed',
            stake: new Prisma.Decimal(totalPot),
            status: 'COMPLETED',
            players: [playerUser.id, player2User.id],
            winnerId: playerUser.id,
            influencerId: influencerUser.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        }
    });
    for (const player of [playerUser, player2User]) {
        const wallet = await prisma.wallet.upsert({
            where: { userId: player.id },
            update: {
                availableBalance: new Prisma.Decimal(0),
                lockedBalance: stake,
                version: { increment: 1 },
            },
            create: {
                userId: player.id,
                availableBalance: new Prisma.Decimal(0),
                lockedBalance: stake,
                currency: 'GHS',
            }
        });
        console.log(`Prepared wallet for ${player.email}: available=${wallet.availableBalance.toString()} locked=${wallet.lockedBalance.toString()}`);
    }
    const result = await walletService.processPayout(matchId, playerUser.id, [player2User.id], totalPot);
    console.log('processPayout result:', result);
    const winnerWallet = await prisma.wallet.findUnique({ where: { userId: playerUser.id } });
    const influencerWallet = await prisma.wallet.findUnique({ where: { userId: influencerUser.id } });
    const systemUser = await prisma.user.findUnique({ where: { email: 'system@pottagame.com' }, include: { wallet: true } });
    console.log('Winner wallet:', winnerWallet ? { available: winnerWallet.availableBalance.toString(), locked: winnerWallet.lockedBalance.toString() } : null);
    console.log('Influencer wallet:', influencerWallet ? { available: influencerWallet.availableBalance.toString(), locked: influencerWallet.lockedBalance.toString() } : null);
    console.log('System wallet:', systemUser?.wallet ? { available: systemUser.wallet.availableBalance.toString(), locked: systemUser.wallet.lockedBalance.toString() } : null);
    const earnings = await prisma.influencerEarning.findMany({ where: { influencerId: influencerUser.id } });
    console.log('Influencer earnings records:', earnings.map(e => ({ matchId: e.matchId, amount: e.amount.toString(), platformFee: e.platformFee.toString() })));
    const ledgers = await prisma.ledger.findMany({ where: { referenceId: matchId } });
    console.log('Ledger entries for match:', ledgers.map(l => ({ walletId: l.walletId, amount: l.amount.toString(), type: l.type, description: l.description })));
    await prisma.$disconnect();
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
