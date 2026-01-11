
import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/guards/roles.decorator.js';

@Controller('admin')
@ApiTags('Admin')
@ApiBearerAuth('JWT-auth')
export class AdminController {
    constructor(private adminService: AdminService) { }

    @Get('reconcile')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async reconcile(@Request() req: any) {
        return this.adminService.reconcile();
    }

    @Get('dashboard')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async getDashboard() {
        return this.adminService.getDashboardStats();
    }
}
