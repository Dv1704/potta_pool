import { Controller, Patch, Param, Body, UseGuards, Post, Request } from '@nestjs/common';
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
    @Post('verify-email') // Simulation endpoint
    @ApiOperation({ summary: 'Toggle email verification status' })
    async toggleEmail(@Request() req: any, @Body('status') status: boolean) {
        return this.usersService.toggleEmailVerification(req.user.id, status);
    }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @Post('toggle-2fa') // Simulation endpoint
    @ApiOperation({ summary: 'Toggle 2FA status' })
    async toggle2FA(@Request() req: any, @Body('status') status: boolean) {
        return this.usersService.toggleTwoFactor(req.user.id, status);
    }
}
