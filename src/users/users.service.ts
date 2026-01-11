import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { User, Prisma } from '../generated/client/client.js';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

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
}
