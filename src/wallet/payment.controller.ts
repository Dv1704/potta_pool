import { Controller, Post, Body, UseGuards, Request, Headers, HttpCode, Get, Param } from '@nestjs/common';
import { PaymentService } from './payment.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/guards/roles.decorator.js';
import { InitiateDepositDto, InitiateWithdrawalDto, AdminWithdrawalDto } from './dto/payment.dto.js';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Payments')
@Controller('payments')
export class PaymentController {
    constructor(private paymentService: PaymentService) { }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @Post('deposit/initialize')
    @ApiOperation({ summary: 'Initialize a Paystack deposit' })
    async initializeDeposit(@Request() req: any, @Body() dto: InitiateDepositDto) {
        return this.paymentService.initializeDeposit(req.user.id, dto.email, dto.amount, dto.currency, dto.callbackUrl);
    }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @Get('verify/:reference')
    @ApiOperation({ summary: 'Verify a Paystack transaction manually' })
    async verifyTransaction(@Request() req: any, @Param('reference') reference: string) {
        return this.paymentService.verifyTransaction(reference, req.user.id);
    }

    /**
     * Paystack Webhook - Public
     */
    @HttpCode(200)
    @Post('webhook/paystack')
    @ApiOperation({ summary: 'Paystack Webhook' })
    async handlePaystackWebhook(
        @Body() payload: any,
        @Headers('x-paystack-signature') signature: string,
    ) {
        return this.paymentService.handleWebhook(payload, signature);
    }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @Post('withdraw')
    @ApiOperation({ summary: 'Request a withdrawal' })
    async withdraw(@Request() req: any, @Body() dto: InitiateWithdrawalDto) {
        return this.paymentService.initiateUserWithdrawal(
            req.user.id,
            dto.amount,
            dto.bankCode,
            dto.accountNumber,
        );
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    @ApiBearerAuth('JWT-auth')
    @Post('admin/withdraw')
    @ApiOperation({ summary: 'Admin withdrawal to company account' })
    async adminWithdraw(@Body() dto: AdminWithdrawalDto) {
        return this.paymentService.initiateAdminWithdrawal(dto.amount);
    }
}
