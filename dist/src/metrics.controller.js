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
import { Controller, Get, Res } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';
import { register } from 'prom-client';
let MetricsController = class MetricsController {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getMetrics(res) {
        res.set('Content-Type', register.contentType);
        try {
            const appMetrics = await register.metrics();
            const prismaMetrics = await this.prisma.$metrics.prometheus();
            res.end(appMetrics + '\n' + prismaMetrics);
        }
        catch (error) {
            res.status(500).send(error.message);
        }
    }
};
__decorate([
    Get('metrics'),
    __param(0, Res()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MetricsController.prototype, "getMetrics", null);
MetricsController = __decorate([
    Controller(),
    __metadata("design:paramtypes", [PrismaService])
], MetricsController);
export { MetricsController };
