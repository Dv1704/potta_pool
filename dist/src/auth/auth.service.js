var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { EmailService } from '../email/email.service.js';
let AuthService = class AuthService {
    usersService;
    jwtService;
    emailService;
    constructor(usersService, jwtService, emailService) {
        this.usersService = usersService;
        this.jwtService = jwtService;
        this.emailService = emailService;
    }
    async validateUser(email, pass) {
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
    async login(user) {
        const payload = { email: user.email, sub: user.id, role: user.role };
        return {
            access_token: this.jwtService.sign(payload),
        };
    }
    async register(registerDto) {
        const existingUser = await this.usersService.findOne(registerDto.email);
        if (existingUser) {
            throw new ConflictException('Email already exists');
        }
        const hashedPassword = await bcrypt.hash(registerDto.password, 10);
        const user = await this.usersService.create({
            email: registerDto.email,
            password: hashedPassword,
            name: registerDto.name,
            role: 'USER', // Default role
            wallet: { create: {} }, // Initialize wallet
        });
        const { password, ...result } = user;
        return result;
    }
    async forgotPassword(email) {
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
    async resetPassword(token, newPass, email) {
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
};
AuthService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [UsersService,
        JwtService,
        EmailService])
], AuthService);
export { AuthService };
