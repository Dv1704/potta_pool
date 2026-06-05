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
import { Controller, Post, Body, UseGuards, Request, Headers, HttpCode, Get, Param, Req } from '@nestjs/common';
import { PaymentService } from './payment.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/guards/roles.decorator.js';
import { InitiateDepositDto, InitiateWithdrawalDto, AdminWithdrawalDto, ConfirmWithdrawalDto } from './dto/payment.dto.js';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
let PaymentController = class PaymentController {
    paymentService;
    constructor(paymentService) {
        this.paymentService = paymentService;
    }
    async initializeDeposit(req, dto) {
        return this.paymentService.initializeDeposit(req.user.id, dto.email, dto.amount, dto.currency, dto.callbackUrl);
    }
    async verifyTransaction(req, reference) {
        return this.paymentService.verifyTransaction(reference, req.user.id);
    }
    /**
     * Paystack Webhook - Public
     * Paystack sends HMAC-SHA512(rawBody, secret_key) in the 'x-paystack-signature' header
     */
    async handlePaystackWebhook(req, payload, signature) {
        const rawBody = req.rawBody?.toString() ?? JSON.stringify(payload);
        return this.paymentService.handlePaystackWebhook(payload, rawBody, signature);
    }
    async withdraw(req, dto) {
        return this.paymentService.initiateUserWithdrawal(req.user.id, dto.amount, dto.bankCode, // reusing bankCode field for mobileNetwork (e.g. "MTN", "VODAFONE")
        dto.accountNumber);
    }
    async confirmWithdraw(req, dto) {
        return this.paymentService.confirmUserWithdrawal(req.user.id, dto.sessionId, dto.code);
    }
    async adminWithdraw(dto) {
        return this.paymentService.initiateAdminWithdrawal(dto.amount);
    }
};
__decorate([
    UseGuards(JwtAuthGuard),
    ApiBearerAuth('JWT-auth'),
    Post('deposit/initialize'),
    ApiOperation({ summary: 'Initialize a Paystack checkout deposit' }),
    __param(0, Request()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, InitiateDepositDto]),
    __metadata("design:returntype", Promise)
], PaymentController.prototype, "initializeDeposit", null);
__decorate([
    UseGuards(JwtAuthGuard),
    ApiBearerAuth('JWT-auth'),
    Get('verify/:reference'),
    ApiOperation({ summary: 'Verify a Paystack transaction manually by reference' }),
    __param(0, Request()),
    __param(1, Param('reference')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], PaymentController.prototype, "verifyTransaction", null);
__decorate([
    HttpCode(200),
    Post('webhook/paystack'),
    ApiOperation({ summary: 'Paystack Webhook' }),
    __param(0, Req()),
    __param(1, Body()),
    __param(2, Headers('x-paystack-signature')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", Promise)
], PaymentController.prototype, "handlePaystackWebhook", null);
__decorate([
    UseGuards(JwtAuthGuard),
    ApiBearerAuth('JWT-auth'),
    Post('withdraw'),
    ApiOperation({ summary: 'Request a mobile money withdrawal' }),
    __param(0, Request()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, InitiateWithdrawalDto]),
    __metadata("design:returntype", Promise)
], PaymentController.prototype, "withdraw", null);
__decorate([
    UseGuards(JwtAuthGuard),
    ApiBearerAuth('JWT-auth'),
    Post('withdraw/confirm'),
    ApiOperation({ summary: 'Confirm a mobile money withdrawal using 2FA' }),
    __param(0, Request()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ConfirmWithdrawalDto]),
    __metadata("design:returntype", Promise)
], PaymentController.prototype, "confirmWithdraw", null);
__decorate([
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ADMIN'),
    ApiBearerAuth('JWT-auth'),
    Post('admin/withdraw'),
    ApiOperation({ summary: 'Admin withdrawal to company mobile money account' }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [AdminWithdrawalDto]),
    __metadata("design:returntype", Promise)
], PaymentController.prototype, "adminWithdraw", null);
PaymentController = __decorate([
    ApiTags('Payments'),
    Controller('payments'),
    __metadata("design:paramtypes", [PaymentService])
], PaymentController);
export { PaymentController };
