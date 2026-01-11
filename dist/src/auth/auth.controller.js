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
import { Controller, Post, Body, UseGuards, Get, Request, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto, RegisterDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
let AuthController = class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async register(registerDto) {
        return this.authService.register(registerDto);
    }
    async login(loginDto) {
        const user = await this.authService.validateUser(loginDto.email, loginDto.password);
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }
        return this.authService.login(user);
    }
    async logout(req) {
        return { message: 'Logged out successfully' };
    }
    async forgotPassword(forgotPasswordDto) {
        return this.authService.forgotPassword(forgotPasswordDto.email);
    }
    async resetPassword(resetPasswordDto) {
        return this.authService.resetPassword(resetPasswordDto.token, resetPasswordDto.newPassword, resetPasswordDto.email);
    }
    getProfile(req) {
        return req.user;
    }
};
__decorate([
    Post('register'),
    ApiOperation({ summary: 'Register a new user' }),
    ApiResponse({ status: 201, description: 'User successfully registered' }),
    ApiResponse({ status: 409, description: 'Email already exists' }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [RegisterDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "register", null);
__decorate([
    Post('login'),
    ApiOperation({ summary: 'Login user' }),
    ApiResponse({ status: 200, description: 'Login successful, returns JWT token' }),
    ApiResponse({ status: 401, description: 'Invalid credentials or account suspended' }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [LoginDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    UseGuards(JwtAuthGuard),
    ApiBearerAuth('JWT-auth'),
    Post('logout'),
    ApiOperation({ summary: 'Logout user (Client-side token removal)' }),
    ApiResponse({ status: 200, description: 'User logged out successfully' }),
    __param(0, Request()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    Post('forgot-password'),
    ApiOperation({ summary: 'Request password reset token' }),
    ApiResponse({ status: 200, description: 'Reset instructions sent' }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ForgotPasswordDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "forgotPassword", null);
__decorate([
    Post('reset-password'),
    ApiOperation({ summary: 'Reset password using token' }),
    ApiResponse({ status: 200, description: 'Password reset successful' }),
    ApiResponse({ status: 401, description: 'Invalid token or expired' }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ResetPasswordDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "resetPassword", null);
__decorate([
    UseGuards(JwtAuthGuard),
    ApiBearerAuth('JWT-auth'),
    Get('profile'),
    ApiOperation({ summary: 'Get current user profile' }),
    ApiResponse({ status: 200, description: 'Returns user profile' }),
    ApiResponse({ status: 401, description: 'Unauthorized' }),
    __param(0, Request()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "getProfile", null);
AuthController = __decorate([
    ApiTags('Authentication'),
    Controller('auth'),
    __metadata("design:paramtypes", [AuthService])
], AuthController);
export { AuthController };
