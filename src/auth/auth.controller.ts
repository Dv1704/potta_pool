import { Controller, Post, Body, UseGuards, Get, Request, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto, RegisterDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Post('register')
    @ApiOperation({ summary: 'Register a new user' })
    @ApiResponse({ status: 201, description: 'User successfully registered' })
    @ApiResponse({ status: 409, description: 'Email already exists' })
    async register(@Body() registerDto: RegisterDto, @Request() req: any) {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const ipStr = Array.isArray(ip) ? ip[0] : ip;
        return this.authService.register(registerDto, ipStr);
    }

    @Post('login')
    @ApiOperation({ summary: 'Login user' })
    @ApiResponse({ status: 200, description: 'Login successful, returns JWT token' })
    @ApiResponse({ status: 401, description: 'Invalid credentials or account suspended' })
    async login(@Body() loginDto: LoginDto, @Request() req: any) {
        const user = await this.authService.validateUser(loginDto.email, loginDto.password);
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const ipStr = Array.isArray(ip) ? ip[0] : ip;
        return this.authService.login(user, ipStr);
    }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @Post('logout')
    @ApiOperation({ summary: 'Logout user (Client-side token removal)' })
    @ApiResponse({ status: 200, description: 'User logged out successfully' })
    async logout(@Request() req: any) {
        return { message: 'Logged out successfully' };
    }

    @Post('forgot-password')
    @ApiOperation({ summary: 'Request password reset token' })
    @ApiResponse({ status: 200, description: 'Reset instructions sent' })
    async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
        return this.authService.forgotPassword(forgotPasswordDto.email);
    }

    @Post('reset-password')
    @ApiOperation({ summary: 'Reset password using token' })
    @ApiResponse({ status: 200, description: 'Password reset successful' })
    @ApiResponse({ status: 401, description: 'Invalid token or expired' })
    async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
        return this.authService.resetPassword(
            resetPasswordDto.token,
            resetPasswordDto.newPassword,
            resetPasswordDto.email,
        );
    }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @Get('profile')
    @ApiOperation({ summary: 'Get current user profile' })
    @ApiResponse({ status: 200, description: 'Returns user profile' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    getProfile(@Request() req: any) {
        return req.user;
    }
}
