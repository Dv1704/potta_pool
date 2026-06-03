import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { FraudService } from './fraud.service.js';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/guards/roles.decorator.js';

@Controller('admin/fraud')
@ApiTags('Admin Fraud')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class FraudController {
    constructor(private fraudService: FraudService) {}

    @Get('alerts')
    @ApiOperation({ summary: 'Get all fraud alerts (Admin only)' })
    async getAlerts() {
        return this.fraudService.getAlerts();
    }

    @Patch('alerts/:id')
    @ApiOperation({ summary: 'Resolve or dismiss a fraud alert (Admin only)' })
    async updateAlert(
        @Param('id') id: string,
        @Body('status') status: 'RESOLVED' | 'DISMISSED'
    ) {
        return this.fraudService.resolveAlert(id, status);
    }
}
