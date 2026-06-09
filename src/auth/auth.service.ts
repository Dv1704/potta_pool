import { Injectable, UnauthorizedException, ConflictException, Logger, Inject } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginDto, RegisterDto } from './dto/auth.dto.js';
import { JwtPayload } from './interfaces/jwt-payload.interface.js';
import { EmailService } from '../email/email.service.js';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        @Inject(UsersService) private usersService: UsersService,
        @Inject(JwtService) private jwtService: JwtService,
        @Inject(EmailService) private emailService: EmailService,
    ) { }

    async validateUser(email: string, pass: string): Promise<any> {
        const user = await this.usersService.findOne(email);
        if (user && user.isBanned) {
            throw new UnauthorizedException('Account is suspended');
        }
        if (user && (await bcrypt.compare(pass, user.password))) {
            const { password, ...result } = user;
            return result;
        }
        return null;
    }

    async login(user: any, ip?: string) {
        if (ip) {
            try {
                await this.usersService.update({
                    where: { id: user.id },
                    data: { lastLoginIp: ip, lastLoginAt: new Date() }
                });
            } catch (err) {
                // Ignore IP update failure to not block login
            }
        }
        const payload: JwtPayload = { email: user.email, sub: user.id, role: user.role };
        return {
            access_token: this.jwtService.sign(payload),
        };
    }

    async verifyLogin(sessionId: string, code: string, ip?: string) {
        const user = await this.usersService.verifyLoginCode(sessionId, code);
        if (ip) {
            try {
                await this.usersService.update({
                    where: { id: user.id },
                    data: { lastLoginIp: ip, lastLoginAt: new Date() }
                });
            } catch (_err) {
                // Ignore IP update failure to not block login
            }
        }

        const payload: JwtPayload = { email: user.email, sub: user.id, role: user.role };
        return {
            access_token: this.jwtService.sign(payload),
        };
    }

    async register(registerDto: RegisterDto, ip?: string) {
        const existingUser = await this.usersService.findOne(registerDto.email);
        if (existingUser) {
            throw new ConflictException('Email already exists');
        }

        let referredById: string | undefined;
        if (registerDto.referralCode) {
            const referrer = await this.usersService.findByReferralCode(registerDto.referralCode);
            if (referrer) {
                referredById = referrer.id;
            }
        }

        // Generate unique referral code for the new user
        let newReferralCode: string;
        let codeExists = true;
        do {
            newReferralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            const existingCode = await this.usersService.findByReferralCode(newReferralCode);
            if (!existingCode) {
                codeExists = false;
            }
        } while (codeExists);

        const hashedPassword = await bcrypt.hash(registerDto.password, 10);
        const user = await this.usersService.create({
            email: registerDto.email,
            password: hashedPassword,
            name: registerDto.name,
            referralCode: newReferralCode,
            referredBy: referredById ? { connect: { id: referredById } } : undefined,
            role: 'USER', // Default role
            wallet: { create: {} }, // Initialize wallet
            registrationIp: ip,
            lastLoginIp: ip,
            lastLoginAt: new Date()
        });

        // Trigger creator tier evaluation for referrer
        if (referredById) {
            try {
                await this.usersService.updateCreatorTierIfNeeded(referredById);
            } catch (err) {
                // Ignore scaling errors to prevent breaking signup flow
            }
        }

        // Send welcome email (asynchronous, non-blocking)
        this.emailService.sendWelcomeEmail(user.email, user.name || 'Potta User').catch(err => {
            this.logger.error(`Failed to send welcome email to ${user.email}: ${err.message}`);
        });

        const { password, ...result } = user;
        return result;
    }

    async generateLoginVerification(user: any, ip?: string) {
        const session = await this.usersService.generateAndSendVerificationCode(user.id, user.email, 'login');
        if (ip) {
            try {
                await this.usersService.update({
                    where: { id: user.id },
                    data: { lastLoginIp: ip }
                });
            } catch (_err) {
                // Ignore IP update failure to not block login flow
            }
        }
        return session;
    }

    async forgotPassword(email: string) {
        const user = await this.usersService.findOne(email);
        if (!user) {
            // Return true even if user not found to prevent enumeration
            return { message: 'If the email exists, a reset instructions have been sent.' };
        }

        // Generate token
        const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

        // Hash token for storage
        const hashedToken = await bcrypt.hash(resetToken, 10);

        await this.usersService.update({
            where: { id: user.id },
            data: {
                resetToken: hashedToken,
                resetTokenExpiry,
            },
        });

        // Send Email
        await this.emailService.sendPasswordResetEmail(user.email, resetToken);

        return {
            message: 'Reset instructions sent to email.',
        };
    }

    async resetPassword(token: string, newPass: string, email: string) {
        const user = await this.usersService.findOne(email);
        if (!user || !user.resetToken || !user.resetTokenExpiry) {
            throw new UnauthorizedException('Invalid token or request');
        }

        if (new Date() > user.resetTokenExpiry) {
            throw new UnauthorizedException('Token expired');
        }

        const isMatch = await bcrypt.compare(token, user.resetToken);
        if (!isMatch) {
            throw new UnauthorizedException('Invalid token');
        }

        const hashedPassword = await bcrypt.hash(newPass, 10);

        await this.usersService.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetToken: null,
                resetTokenExpiry: null,
            },
        });

        return { message: 'Password successfully reset' };
    }
}
