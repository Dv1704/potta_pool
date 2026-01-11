var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import * as crypto from 'crypto';
let Transfer2FAService = class Transfer2FAService {
    prisma;
    emailService;
    LARGE_TRANSFER_THRESHOLD = 1000; // GHS
    CODE_EXPIRY_MINUTES = 10;
    transferCodes = new Map();
    constructor(prisma, emailService) {
        this.prisma = prisma;
        this.emailService = emailService;
        // Clean expired codes every 5 minutes
        setInterval(() => this.cleanExpiredCodes(), 5 * 60 * 1000);
    }
    async requiresConfirmation(amount) {
        return amount >= this.LARGE_TRANSFER_THRESHOLD;
    }
    async generateAndSendCode(userId, amount, recipientIdentifier) {
        // Generate 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + this.CODE_EXPIRY_MINUTES * 60 * 1000);
        // Store code
        this.transferCodes.set(sessionId, {
            code,
            amount,
            recipient: recipientIdentifier,
            expiresAt
        });
        // Get user email
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, name: true }
        });
        if (!user)
            throw new BadRequestException('User not found');
        // Send email
        await this.emailService.sendEmail(user.email, 'Transfer Confirmation Code', `
            <h2>Transfer Confirmation Required</h2>
            <p>Hi ${user.name || 'there'},</p>
            <p>You are attempting to transfer <strong>${amount} GHS</strong> to <strong>${recipientIdentifier}</strong>.</p>
            <p>Your confirmation code is:</p>
            <h1 style="color: #4CAF50; font-size: 32px; letter-spacing: 5px;">${code}</h1>
            <p>This code expires in ${this.CODE_EXPIRY_MINUTES} minutes.</p>
            <p>If you did not request this transfer, please ignore this email and secure your account.</p>
            `);
        return { sessionId };
    }
    async verifyCode(sessionId, code) {
        const session = this.transferCodes.get(sessionId);
        if (!session) {
            throw new UnauthorizedException('Invalid or expired session');
        }
        if (new Date() > session.expiresAt) {
            this.transferCodes.delete(sessionId);
            throw new UnauthorizedException('Code has expired');
        }
        if (session.code !== code) {
            throw new UnauthorizedException('Invalid confirmation code');
        }
        // Code verified - delete session and return data
        this.transferCodes.delete(sessionId);
        return {
            amount: session.amount,
            recipient: session.recipient
        };
    }
    cleanExpiredCodes() {
        const now = new Date();
        for (const [sessionId, session] of this.transferCodes.entries()) {
            if (now > session.expiresAt) {
                this.transferCodes.delete(sessionId);
            }
        }
    }
};
Transfer2FAService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [PrismaService,
        EmailService])
], Transfer2FAService);
export { Transfer2FAService };
