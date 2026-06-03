import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class FraudService {
    private readonly logger = new Logger(FraudService.name);

    constructor(private prisma: PrismaService) {}

    async trackUserConnection(userId: string, ip: string) {
        if (!ip || ip.includes('127.0.0.1') || ip === '::1') return; // Skip local loopback in dev if needed, or track it
        
        try {
            const user = await this.prisma.user.findUnique({ where: { id: userId } });
            if (!user) return;

            const updateData: any = { lastLoginIp: ip };
            if (!user.registrationIp) {
                updateData.registrationIp = ip;
            }

            await this.prisma.user.update({
                where: { id: userId },
                data: updateData
            });
        } catch (err: any) {
            this.logger.error(`Failed to track IP for user ${userId}: ${err.message}`);
        }
    }

    async checkMatchmakingFraud(playerIds: string[], clientIps: Record<string, string>): Promise<void> {
        if (playerIds.length < 2) return;
        const [playerA, playerB] = playerIds;
        const ipA = clientIps[playerA];
        const ipB = clientIps[playerB];

        try {
            // 1. IP Collusion Check
            if (ipA && ipB && ipA === ipB) {
                await this.createAlert({
                    userId: playerA,
                    type: 'SAME_IP_PLAY',
                    severity: 'HIGH',
                    description: `Players ${playerA} and ${playerB} entered matchmaking with the same IP address (${ipA}).`,
                    details: { playerA, playerB, ip: ipA }
                });
                return; // Trigger only one main alert per match check
            }

            // Fetch users to inspect referrals
            const users = await this.prisma.user.findMany({
                where: { id: { in: playerIds } },
                select: { id: true, email: true, referredById: true }
            });
            const userMap = new Map(users.map(u => [u.id, u]));

            const uA = userMap.get(playerA);
            const uB = userMap.get(playerB);

            if (!uA || !uB) return;

            // 2. Referral Abuse Check (collusion between referrer and referee)
            const isReferralRelation = uA.referredById === uB.id || uB.referredById === uA.id;
            if (isReferralRelation) {
                // Count games played between them in the last 15 minutes
                const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
                const recentGamesCount = await this.prisma.game.count({
                    where: {
                        players: { hasEvery: [playerA, playerB] },
                        createdAt: { gte: fifteenMinutesAgo }
                    }
                });

                if (recentGamesCount >= 3) {
                    await this.createAlert({
                        userId: uA.referredById || uB.referredById || playerA,
                        type: 'REFERRAL_ABUSE',
                        severity: 'CRITICAL',
                        description: `Suspicious game frequency (${recentGamesCount} games in 15 mins) between referrer and referred user.`,
                        details: { playerA, playerB, recentGamesCount }
                    });
                }
            }
        } catch (err: any) {
            this.logger.error(`Error in matchmaking fraud check: ${err.message}`);
        }
    }

    async checkGamePayoutFraud(gameId: string): Promise<void> {
        try {
            const game = await this.prisma.game.findUnique({
                where: { id: gameId },
                include: { influencer: true }
            });

            if (!game || game.status !== 'COMPLETED' || Number(game.stake) <= 0) return;

            const durationSeconds = (game.updatedAt.getTime() - game.createdAt.getTime()) / 1000;

            // 1. Same-IP Play Check at Payout Level
            const players = await this.prisma.user.findMany({
                where: { id: { in: game.players } },
                select: { id: true, lastLoginIp: true, email: true, referredById: true }
            });

            if (players.length === 2) {
                const [pA, pB] = players;
                if (pA.lastLoginIp && pB.lastLoginIp && pA.lastLoginIp === pB.lastLoginIp) {
                    await this.createAlert({
                        userId: pA.id,
                        type: 'SELF_PLAY',
                        severity: 'CRITICAL',
                        description: `Payout processed for game ${gameId} where both players share IP ${pA.lastLoginIp}.`,
                        details: { gameId, stake: game.stake, playerA: pA.id, playerB: pB.id, ip: pA.lastLoginIp }
                    });
                }

                // 2. Commission Farming / Rapid Win Check
                // E.g., game finishes in under 15 seconds (likely instant forfeit to transfer coins/cash)
                if (durationSeconds < 15) {
                    const isCommissionFarming = game.influencerId !== null || pA.referredById === pB.id || pB.referredById === pA.id;
                    await this.createAlert({
                        userId: game.influencerId || pA.id,
                        type: isCommissionFarming ? 'COMMISSION_FARMING' : 'SELF_PLAY',
                        severity: 'HIGH',
                        description: `Game ${gameId} ended extremely fast (${durationSeconds}s) with stake ${game.stake} GHS. Possible cash transfer/farming.`,
                        details: { gameId, durationSeconds, stake: game.stake, winner: game.winnerId }
                    });
                }
            }
        } catch (err: any) {
            this.logger.error(`Error in game payout fraud check: ${err.message}`);
        }
    }

    private async createAlert(data: { userId: string | null; type: string; severity: string; description: string; details: any }) {
        this.logger.warn(`[FraudAlert] ${data.type} (${data.severity}): ${data.description}`);
        try {
            await this.prisma.fraudAlert.create({
                data: {
                    userId: data.userId,
                    type: data.type,
                    severity: data.severity,
                    description: data.description,
                    details: JSON.stringify(data.details)
                }
            });
        } catch (err: any) {
            this.logger.error(`Failed to create fraud alert: ${err.message}`);
        }
    }

    async getAlerts() {
        return this.prisma.fraudAlert.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: {
                        name: true,
                        email: true,
                        creatorTier: true
                    }
                }
            }
        });
    }

    async resolveAlert(id: string, status: string) {
        if (!['RESOLVED', 'DISMISSED'].includes(status)) {
            throw new Error('Invalid status update for fraud alert');
        }
        return this.prisma.fraudAlert.update({
            where: { id },
            data: { status }
        });
    }
}
