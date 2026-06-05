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
import { Controller, Patch, Param, Body, UseGuards, Post, Request, Get, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../auth/guards/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
let UsersController = class UsersController {
    usersService;
    constructor(usersService) {
        this.usersService = usersService;
    }
    async banUser(id, isBanned) {
        return this.usersService.setBanStatus(id, isBanned);
    }
    async toggleEmail(req, status) {
        return this.usersService.toggleEmailVerification(req.user.id, status);
    }
    async sendVerification(req) {
        return this.usersService.generateAndSendVerificationCode(req.user.id, req.user.email);
    }
    async confirmVerification(req, body) {
        if (!body.sessionId || !body.code) {
            throw new BadRequestException('Session ID and code are required');
        }
        return this.usersService.verifyEmailCode(req.user.id, body.sessionId, body.code);
    }
    async toggle2FA(req, status) {
        return this.usersService.toggleTwoFactor(req.user.id, status);
    }
    async listUsers() {
        return this.usersService.findAll();
    }
    async updateRole(id, role) {
        return this.usersService.updateUserRole(id, role);
    }
    async influencerStats(req) {
        return this.usersService.getInfluencerStats(req.user.id);
    }
    async updateBranding(req, body) {
        const user = await this.usersService.findOne(req.user.email);
        if (!user || user.creatorTier !== 'ELITE') {
            throw new BadRequestException('Only Elite tier creators can customize their room branding');
        }
        const currentBranding = user.customBranding ? JSON.parse(user.customBranding) : {};
        const newBranding = {
            ...currentBranding,
            headerText: body.headerText || currentBranding.headerText || '',
            accentColor: body.accentColor || currentBranding.accentColor || '#A855F7',
        };
        return this.usersService.update({
            where: { id: user.id },
            data: { customBranding: JSON.stringify(newBranding) }
        });
    }
};
__decorate([
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ADMIN'),
    ApiBearerAuth('JWT-auth'),
    Patch(':id/ban'),
    ApiOperation({ summary: 'Ban or unban a user (Admin only)' }),
    ApiResponse({ status: 200, description: 'User ban status updated' }),
    ApiResponse({ status: 401, description: 'Unauthorized' }),
    ApiResponse({ status: 403, description: 'Forbidden - Admin role required' }),
    __param(0, Param('id')),
    __param(1, Body('isBanned')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Boolean]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "banUser", null);
__decorate([
    UseGuards(JwtAuthGuard),
    ApiBearerAuth('JWT-auth'),
    Post('verify-email') // Simulation endpoint (legacy)
    ,
    ApiOperation({ summary: 'Toggle email verification status' }),
    __param(0, Request()),
    __param(1, Body('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Boolean]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "toggleEmail", null);
__decorate([
    UseGuards(JwtAuthGuard),
    ApiBearerAuth('JWT-auth'),
    Post('verify-email/send'),
    ApiOperation({ summary: 'Send verification code to user email' }),
    __param(0, Request()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "sendVerification", null);
__decorate([
    UseGuards(JwtAuthGuard),
    ApiBearerAuth('JWT-auth'),
    Post('verify-email/confirm'),
    ApiOperation({ summary: 'Confirm email verification code' }),
    __param(0, Request()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "confirmVerification", null);
__decorate([
    UseGuards(JwtAuthGuard),
    ApiBearerAuth('JWT-auth'),
    Post('toggle-2fa') // Simulation endpoint
    ,
    ApiOperation({ summary: 'Toggle 2FA status' }),
    __param(0, Request()),
    __param(1, Body('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Boolean]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "toggle2FA", null);
__decorate([
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ADMIN'),
    ApiBearerAuth('JWT-auth'),
    Get(),
    ApiOperation({ summary: 'List all users (Admin only)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "listUsers", null);
__decorate([
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ADMIN'),
    ApiBearerAuth('JWT-auth'),
    Patch(':id/role'),
    ApiOperation({ summary: "Update a user's role (Admin only)" }),
    __param(0, Param('id')),
    __param(1, Body('role')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "updateRole", null);
__decorate([
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('INFLUENCER', 'USER', 'ADMIN'),
    ApiBearerAuth('JWT-auth'),
    Get('influencer/stats'),
    ApiOperation({ summary: 'Get influencer/creator stats and payouts' }),
    __param(0, Request()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "influencerStats", null);
__decorate([
    UseGuards(JwtAuthGuard),
    ApiBearerAuth('JWT-auth'),
    Patch('profile/branding'),
    ApiOperation({ summary: 'Update custom room branding (Elite creators only)' }),
    __param(0, Request()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "updateBranding", null);
UsersController = __decorate([
    ApiTags('Users'),
    Controller('users'),
    __metadata("design:paramtypes", [UsersService])
], UsersController);
export { UsersController };
