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
import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/guards/roles.decorator.js';
let AdminController = class AdminController {
    adminService;
    constructor(adminService) {
        this.adminService = adminService;
    }
    async reconcile(req) {
        return this.adminService.reconcile();
    }
    async getDashboard() {
        return this.adminService.getDashboardStats();
    }
};
__decorate([
    Get('reconcile'),
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ADMIN'),
    __param(0, Request()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "reconcile", null);
__decorate([
    Get('dashboard'),
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ADMIN'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getDashboard", null);
AdminController = __decorate([
    Controller('admin'),
    ApiTags('Admin'),
    ApiBearerAuth('JWT-auth'),
    __metadata("design:paramtypes", [AdminService])
], AdminController);
export { AdminController };
