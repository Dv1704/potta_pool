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
import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { WalletService } from './wallet.service.js';
import { FXService } from './fx.service.js';
import { TransferService } from './transfer.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BalanceResponseDto } from './dto/wallet.dto.js';
import { TransferDto, ConfirmTransferDto } from './dto/transfer.dto.js';
let WalletController = class WalletController {
    walletService;
    fxService;
    transferService;
    prisma;
    constructor(walletService, fxService, transferService, prisma) {
        this.walletService = walletService;
        this.fxService = fxService;
        this.transferService = transferService;
        this.prisma = prisma;
    }
    async getBalance(req) {
        return this.walletService.getBalance(req.user.id);
    }
    async getHistory(req) {
        return this.walletService.getHistory(req.user.id);
    }
    async getRates() {
        return this.fxService.getLiveRates();
    }
    async initiateTransfer(req, dto) {
        return this.transferService.initiateTransfer(req.user.id, dto.recipientIdentifier, dto.amount);
    }
    async confirmTransfer(req, dto) {
        return this.transferService.confirmTransfer(req.user.id, dto.sessionId, dto.code);
    }
    async injectBalance(body) {
        const user = await this.prisma.user.findUnique({ where: { email: body.email } });
        if (!user)
            return { error: 'User not found' };
        return this.walletService.deposit(user.id, body.amount);
    }
};
__decorate([
    Get('balance'),
    UseGuards(JwtAuthGuard),
    ApiOperation({ summary: 'Get current wallet balance' }),
    ApiResponse({ status: 200, type: BalanceResponseDto }),
    __param(0, Request()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WalletController.prototype, "getBalance", null);
__decorate([
    Get('history'),
    UseGuards(JwtAuthGuard),
    ApiOperation({ summary: 'Get transaction history' }),
    ApiResponse({ status: 200, description: 'Returns ledger entries' }),
    __param(0, Request()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WalletController.prototype, "getHistory", null);
__decorate([
    Get('rates'),
    ApiOperation({ summary: 'Get live currency exchange rates' }),
    ApiResponse({ status: 200, description: 'Returns current exchange rates with GHS as base' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], WalletController.prototype, "getRates", null);
__decorate([
    Post('transfer/initiate'),
    UseGuards(JwtAuthGuard),
    Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
    ,
    ApiOperation({ summary: 'Initiate a transfer (may require 2FA)' }),
    ApiResponse({ status: 200, description: 'Transfer initiated or 2FA required' }),
    __param(0, Request()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, TransferDto]),
    __metadata("design:returntype", Promise)
], WalletController.prototype, "initiateTransfer", null);
__decorate([
    Post('transfer/confirm'),
    UseGuards(JwtAuthGuard),
    Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
    ,
    ApiOperation({ summary: 'Confirm transfer with 2FA code' }),
    ApiResponse({ status: 200, description: 'Transfer completed' }),
    __param(0, Request()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ConfirmTransferDto]),
    __metadata("design:returntype", Promise)
], WalletController.prototype, "confirmTransfer", null);
__decorate([
    Post('debug/inject-balance'),
    ApiOperation({ summary: 'TEMPORARY: Inject balance for testing' }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WalletController.prototype, "injectBalance", null);
WalletController = __decorate([
    ApiTags('Wallet'),
    Controller('wallet'),
    ApiBearerAuth('JWT-auth'),
    __metadata("design:paramtypes", [WalletService,
        FXService,
        TransferService,
        PrismaService])
], WalletController);
export { WalletController };
