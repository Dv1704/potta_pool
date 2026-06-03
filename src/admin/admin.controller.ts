
import { Controller, Get, Patch, Param, Body, UseGuards, Request } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { UsersService } from '../users/users.service.js';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/guards/roles.decorator.js';

@Controller('admin')
@ApiTags('Admin')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
    constructor(
        private adminService: AdminService,
        private usersService: UsersService,
    ) { }

    @Get('reconcile')
    async reconcile(@Request() req: any) {
        return this.adminService.reconcile();
    }

    @Get('dashboard')
    async getDashboard() {
        return this.adminService.getDashboardStats();
    }

    @Patch('users/:id/tier')
    @ApiOperation({ summary: 'Override creator tier and verified status (Admin only)' })
    async overrideTier(
        @Param('id') id: string,
        @Body() body: { tier: string; isVerified: boolean; customBranding?: any }
    ) {
        const brandingStr = body.customBranding ? JSON.stringify(body.customBranding) : undefined;
        return this.usersService.overrideCreatorTier(id, body.tier, body.isVerified, brandingStr);
    }
}
