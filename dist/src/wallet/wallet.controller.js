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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DepositDto, BalanceResponseDto } from './dto/wallet.dto.js';
let WalletController = class WalletController {
    walletService;
    constructor(walletService) {
        this.walletService = walletService;
    }
    async getBalance(req) {
        return this.walletService.getBalance(req.user.id);
    }
    async deposit(req, depositDto) {
        return this.walletService.deposit(req.user.id, depositDto.amount, depositDto.currency);
    }
};
__decorate([
    Get('balance'),
    ApiOperation({ summary: 'Get current wallet balance' }),
    ApiResponse({ status: 200, type: BalanceResponseDto }),
    __param(0, Request()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WalletController.prototype, "getBalance", null);
__decorate([
    Post('deposit'),
    ApiOperation({ summary: 'Deposit funds into wallet' }),
    ApiResponse({ status: 201, description: 'Deposit successful' }),
    ApiResponse({ status: 400, description: 'Invalid amount or currency' }),
    __param(0, Request()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, DepositDto]),
    __metadata("design:returntype", Promise)
], WalletController.prototype, "deposit", null);
WalletController = __decorate([
    ApiTags('Wallet'),
    Controller('wallet'),
    UseGuards(JwtAuthGuard),
    ApiBearerAuth(),
    __metadata("design:paramtypes", [WalletService])
], WalletController);
export { WalletController };
