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
import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { FraudService } from './fraud.service.js';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/guards/roles.decorator.js';
let FraudController = class FraudController {
    fraudService;
    constructor(fraudService) {
        this.fraudService = fraudService;
    }
    async getAlerts() {
        return this.fraudService.getAlerts();
    }
    async updateAlert(id, status) {
        return this.fraudService.resolveAlert(id, status);
    }
};
__decorate([
    Get('alerts'),
    ApiOperation({ summary: 'Get all fraud alerts (Admin only)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FraudController.prototype, "getAlerts", null);
__decorate([
    Patch('alerts/:id'),
    ApiOperation({ summary: 'Resolve or dismiss a fraud alert (Admin only)' }),
    __param(0, Param('id')),
    __param(1, Body('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], FraudController.prototype, "updateAlert", null);
FraudController = __decorate([
    Controller('admin/fraud'),
    ApiTags('Admin Fraud'),
    ApiBearerAuth('JWT-auth'),
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ADMIN'),
    __metadata("design:paramtypes", [FraudService])
], FraudController);
export { FraudController };
