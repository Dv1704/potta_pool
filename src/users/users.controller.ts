import { Controller, Patch, Param, Body, UseGuards, Post, Request, Get, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../auth/guards/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';

@ApiTags('Users')
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    @ApiBearerAuth('JWT-auth')
    @Patch(':id/ban')
    @ApiOperation({ summary: 'Ban or unban a user (Admin only)' })
    @ApiResponse({ status: 200, description: 'User ban status updated' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
    async banUser(@Param('id') id: string, @Body('isBanned') isBanned: boolean) {
        return this.usersService.setBanStatus(id, isBanned);
    }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @Post('verify-email/send')
    @ApiOperation({ summary: 'Send verification code to user email' })
    async sendVerification(@Request() req: any) {
        return this.usersService.generateAndSendVerificationCode(req.user.id, req.user.email);
    }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @Post('verify-email/confirm')
    @ApiOperation({ summary: 'Confirm email verification code' })
    async confirmVerification(@Request() req: any, @Body() body: { sessionId: string; code: string }) {
        if (!body.sessionId || !body.code) {
            throw new BadRequestException('Session ID and code are required');
        }
        return this.usersService.verifyEmailCode(req.user.id, body.sessionId, body.code);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    @ApiBearerAuth('JWT-auth')
    @Get()
    @ApiOperation({ summary: 'List all users (Admin only)' })
    async listUsers() {
        return this.usersService.findAll();
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    @ApiBearerAuth('JWT-auth')
    @Patch(':id/role')
    @ApiOperation({ summary: "Update a user's role (Admin only)" })
    async updateRole(@Param('id') id: string, @Body('role') role: string) {
        return this.usersService.updateUserRole(id, role);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('INFLUENCER', 'USER', 'ADMIN')
    @ApiBearerAuth('JWT-auth')
    @Get('influencer/stats')
    @ApiOperation({ summary: 'Get influencer/creator stats and payouts' })
    async influencerStats(@Request() req: any) {
        return this.usersService.getInfluencerStats(req.user.id);
    }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @Patch('profile/branding')
    @ApiOperation({ summary: 'Update custom room branding (Elite creators only)' })
    async updateBranding(@Request() req: any, @Body() body: { headerText?: string; accentColor?: string }) {
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
}
