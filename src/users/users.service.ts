import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { User, Prisma } from '@prisma/client';
import { EmailService } from '../email/email.service.js';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

type VerificationPurpose = 'emailVerification' | 'login';

interface VerificationSession {
    code: string;
    email: string;
    expiresAt: Date;
    userId: string;
    purpose: VerificationPurpose;
}

@Injectable()
export class UsersService {
    private verificationCodes = new Map<string, VerificationSession>();

    constructor(
        @Inject(PrismaService) private prisma: PrismaService,
        @Inject(EmailService) private emailService: EmailService,
        @Inject(ConfigService) private configService: ConfigService,
    ) {
        // Run cleanup every 5 minutes
        setInterval(() => this.cleanExpiredVerificationCodes(), 5 * 60 * 1000);
    }

    async create(data: Prisma.UserCreateInput): Promise<User> {
        return this.prisma.user.create({
            data,
        });
    }

    async findOne(email: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { email },
        });
    }

    async findById(id: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { id },
            include: { referrals: true }
        });
    }

    async findByReferralCode(referralCode: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { referralCode },
        });
    }

    async update(params: {
        where: Prisma.UserWhereUniqueInput;
        data: Prisma.UserUpdateInput;
    }): Promise<User> {
        const { where, data } = params;
        return this.prisma.user.update({
            data,
            where,
        });
    }



    async setBanStatus(userId: string, isBanned: boolean): Promise<User> {
        return this.update({
            where: { id: userId },
            data: { isBanned },
        });
    }

    async toggleEmailVerification(userId: string, status: boolean): Promise<User> {
        return this.update({
            where: { id: userId },
            data: { emailVerified: status },
        });
    }

    async toggleTwoFactor(userId: string, status: boolean): Promise<User> {
        return this.update({
            where: { id: userId },
            data: { isTwoFactorEnabled: status },
        });
    }

    async findAll(): Promise<User[]> {
        return this.prisma.user.findMany({
            include: { wallet: true, referredBy: true, referrals: true }
        });
    }

    async updateUserRole(userId: string, role: string): Promise<User> {
        // Basic validation for roles
        const allowed = ['USER', 'ADMIN', 'INFLUENCER'];
        if (!allowed.includes(role)) throw new Error('Invalid role');
        return this.update({ where: { id: userId }, data: { role } });
    }

    async updateCreatorTierIfNeeded(userId: string): Promise<User> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { referrals: true }
        });

        if (!user) return null as any;

        const referralCount = user.referrals.length;
        let targetTier = 'BRONZE';
        let verifyStatus = user.isVerified;
        let role = user.role;

        if (referralCount >= 31) {
            targetTier = 'ELITE';
            verifyStatus = true;
            if (role === 'USER') role = 'INFLUENCER';
        } else if (referralCount >= 16) {
            targetTier = 'GOLD';
            verifyStatus = true;
            if (role === 'USER') role = 'INFLUENCER';
        } else if (referralCount >= 6) {
            targetTier = 'SILVER';
            verifyStatus = true;
            if (role === 'USER') role = 'INFLUENCER';
        } else {
            targetTier = 'BRONZE';
        }

        if (user.creatorTier !== targetTier || user.isVerified !== verifyStatus || user.role !== role) {
            return this.prisma.user.update({
                where: { id: userId },
                data: {
                    creatorTier: targetTier,
                    isVerified: verifyStatus,
                    role
                }
            });
        }

        return user;
    }

    async overrideCreatorTier(userId: string, tier: string, isVerified: boolean, customBranding?: string): Promise<User> {
        const allowedTiers = ['BRONZE', 'SILVER', 'GOLD', 'ELITE'];
        if (!allowedTiers.includes(tier)) throw new Error('Invalid creator tier');

        return this.prisma.user.update({
            where: { id: userId },
            data: {
                creatorTier: tier,
                isVerified,
                customBranding: customBranding || undefined
            }
        });
    }

    async getInfluencerStats(influencerId: string) {
        const userDetails = await this.prisma.user.findUnique({
            where: { id: influencerId },
            select: { creatorTier: true, isVerified: true, customBranding: true }
        });

        // Total earnings
        const total = await this.prisma.influencerEarning.aggregate({
            _sum: { amount: true },
            where: { influencerId }
        });

        const totalEarnings = total._sum.amount ? total._sum.amount.toNumber() : 0;

        // Referral list
        const referrals = await this.prisma.user.findMany({ where: { referredById: influencerId } });

        // Games played as influencer
        const gamesPlayed = await this.prisma.game.count({ where: { influencerId } });

        // Commission generated per referral
        const perReferral: Array<{ userId: string, email?: string, totalCommission: number }> = [];
        for (const r of referrals) {
            const agg = await this.prisma.influencerEarning.aggregate({
                _sum: { amount: true },
                where: {
                    influencerId,
                    game: { players: { has: r.id } }
                }
            });
            perReferral.push({ userId: r.id, email: r.email || undefined, totalCommission: agg._sum.amount ? agg._sum.amount.toNumber() : 0 });
        }

        // Recent earnings history
        const earnings = await this.prisma.influencerEarning.findMany({
            where: { influencerId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });

        return {
            totalEarnings,
            gamesPlayed,
            referrals: referrals.map(r => ({ id: r.id, email: r.email })),
            perReferral,
            earnings,
            creatorTier: userDetails?.creatorTier || 'BRONZE',
            isVerified: userDetails?.isVerified || false,
            customBranding: userDetails?.customBranding ? JSON.parse(userDetails.customBranding) : null
        };
    }

    private cleanExpiredVerificationCodes() {
        const now = new Date();
        for (const [sessionId, data] of this.verificationCodes.entries()) {
            if (now > data.expiresAt) {
                this.verificationCodes.delete(sessionId);
            }
        }
    }

    async generateAndSendVerificationCode(userId: string, email: string, purpose: VerificationPurpose = 'emailVerification'): Promise<{ sessionId: string }> {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

        this.verificationCodes.set(sessionId, { code, email, expiresAt, userId, purpose });

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { name: true }
        });

        const name = user?.name || 'Potta User';

        await this.emailService.sendVerificationCodeEmail(email, name, code);

        return { sessionId };
    }

    async verifyEmailCode(userId: string, sessionId: string, code: string): Promise<User> {
        const session = this.verificationCodes.get(sessionId);
        if (!session || session.purpose !== 'emailVerification' || session.userId !== userId) {
            throw new BadRequestException('Invalid or expired verification session');
        }
        if (new Date() > session.expiresAt) {
            this.verificationCodes.delete(sessionId);
            throw new BadRequestException('Verification code has expired');
        }
        if (session.code !== code) {
            throw new BadRequestException('Invalid verification code');
        }

        this.verificationCodes.delete(sessionId);

        return this.toggleEmailVerification(userId, true);
    }

    async verifyLoginCode(sessionId: string, code: string): Promise<User> {
        const session = this.verificationCodes.get(sessionId);
        if (!session || session.purpose !== 'login') {
            throw new BadRequestException('Invalid or expired login verification session');
        }
        if (new Date() > session.expiresAt) {
            this.verificationCodes.delete(sessionId);
            throw new BadRequestException('Verification code has expired');
        }
        if (session.code !== code) {
            throw new BadRequestException('Invalid verification code');
        }

        this.verificationCodes.delete(sessionId);

        const user = await this.findById(session.userId);
        if (!user) {
            throw new BadRequestException('Verification session user not found');
        }

        return user;
    }
}
