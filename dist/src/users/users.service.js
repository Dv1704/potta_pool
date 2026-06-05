var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
let UsersService = class UsersService {
    prisma;
    emailService;
    configService;
    verificationCodes = new Map();
    constructor(prisma, emailService, configService) {
        this.prisma = prisma;
        this.emailService = emailService;
        this.configService = configService;
        // Run cleanup every 5 minutes
        setInterval(() => this.cleanExpiredVerificationCodes(), 5 * 60 * 1000);
    }
    async create(data) {
        return this.prisma.user.create({
            data,
        });
    }
    async findOne(email) {
        return this.prisma.user.findUnique({
            where: { email },
        });
    }
    async findById(id) {
        return this.prisma.user.findUnique({
            where: { id },
            include: { referrals: true }
        });
    }
    async findByReferralCode(referralCode) {
        return this.prisma.user.findUnique({
            where: { referralCode },
        });
    }
    async update(params) {
        const { where, data } = params;
        return this.prisma.user.update({
            data,
            where,
        });
    }
    async setBanStatus(userId, isBanned) {
        return this.update({
            where: { id: userId },
            data: { isBanned },
        });
    }
    async toggleEmailVerification(userId, status) {
        return this.update({
            where: { id: userId },
            data: { emailVerified: status },
        });
    }
    async toggleTwoFactor(userId, status) {
        return this.update({
            where: { id: userId },
            data: { isTwoFactorEnabled: status },
        });
    }
    async findAll() {
        return this.prisma.user.findMany({
            include: { wallet: true, referredBy: true, referrals: true }
        });
    }
    async updateUserRole(userId, role) {
        // Basic validation for roles
        const allowed = ['USER', 'ADMIN', 'INFLUENCER'];
        if (!allowed.includes(role))
            throw new Error('Invalid role');
        return this.update({ where: { id: userId }, data: { role } });
    }
    async updateCreatorTierIfNeeded(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { referrals: true }
        });
        if (!user)
            return null;
        const referralCount = user.referrals.length;
        let targetTier = 'BRONZE';
        let verifyStatus = user.isVerified;
        let role = user.role;
        if (referralCount >= 31) {
            targetTier = 'ELITE';
            verifyStatus = true;
            if (role === 'USER')
                role = 'INFLUENCER';
        }
        else if (referralCount >= 16) {
            targetTier = 'GOLD';
            verifyStatus = true;
            if (role === 'USER')
                role = 'INFLUENCER';
        }
        else if (referralCount >= 6) {
            targetTier = 'SILVER';
            verifyStatus = true;
            if (role === 'USER')
                role = 'INFLUENCER';
        }
        else {
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
    async overrideCreatorTier(userId, tier, isVerified, customBranding) {
        const allowedTiers = ['BRONZE', 'SILVER', 'GOLD', 'ELITE'];
        if (!allowedTiers.includes(tier))
            throw new Error('Invalid creator tier');
        return this.prisma.user.update({
            where: { id: userId },
            data: {
                creatorTier: tier,
                isVerified,
                customBranding: customBranding || undefined
            }
        });
    }
    async getInfluencerStats(influencerId) {
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
        const perReferral = [];
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
    cleanExpiredVerificationCodes() {
        const now = new Date();
        for (const [sessionId, data] of this.verificationCodes.entries()) {
            if (now > data.expiresAt) {
                this.verificationCodes.delete(sessionId);
            }
        }
    }
    async generateAndSendVerificationCode(userId, email) {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
        this.verificationCodes.set(sessionId, { code, email, expiresAt });
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { name: true }
        });
        const name = user?.name || 'Potta User';
        await this.emailService.sendVerificationCodeEmail(email, name, code);
        return { sessionId };
    }
    async verifyEmailCode(userId, sessionId, code) {
        const session = this.verificationCodes.get(sessionId);
        if (!session) {
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
        // Update database
        return this.toggleEmailVerification(userId, true);
    }
};
UsersService = __decorate([
    Injectable(),
    __param(0, Inject(PrismaService)),
    __param(1, Inject(EmailService)),
    __param(2, Inject(ConfigService)),
    __metadata("design:paramtypes", [PrismaService,
        EmailService,
        ConfigService])
], UsersService);
export { UsersService };
