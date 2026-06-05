import { Controller, Post, Body, UseGuards, Request, Headers, HttpCode, Get, Param, RawBodyRequest, Req } from '@nestjs/common';
import { PaymentService } from './payment.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/guards/roles.decorator.js';
import { InitiateDepositDto, InitiateWithdrawalDto, AdminWithdrawalDto, ConfirmWithdrawalDto } from './dto/payment.dto.js';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Payments')
@Controller('payments')
export class PaymentController {
    constructor(private paymentService: PaymentService) { }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @Post('deposit/initialize')
    @ApiOperation({ summary: 'Initialize a Korapay checkout deposit' })
    async initializeDeposit(@Request() req: any, @Body() dto: InitiateDepositDto) {
        return this.paymentService.initializeDeposit(req.user.id, dto.email, dto.amount, dto.currency, dto.callbackUrl);
    }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @Get('verify/:reference')
    @ApiOperation({ summary: 'Verify a Korapay transaction manually by reference' })
    async verifyTransaction(@Request() req: any, @Param('reference') reference: string) {
        return this.paymentService.verifyTransaction(reference, req.user.id);
    }

    /**
     * Korapay Webhook - Public
     * Korapay sends HMAC-SHA256(rawBody, secret_key) in the 'x-korapay-signature' header
     */
    @HttpCode(200)
    @Post('webhook/korapay')
    @ApiOperation({ summary: 'Korapay Webhook' })
    async handleKorapayWebhook(
        @Req() req: RawBodyRequest<Request>,
        @Body() payload: any,
        @Headers('x-korapay-signature') signature: string,
    ) {
        const rawBody = req.rawBody?.toString() ?? JSON.stringify(payload);
        return this.paymentService.handleWebhook(payload, rawBody, signature);
    }

    /**
     * Paystack Webhook - Public
     * Paystack sends HMAC-SHA512(rawBody, secret_key) in the 'x-paystack-signature' header
     */
    @HttpCode(200)
    @Post('webhook/paystack')
    @ApiOperation({ summary: 'Paystack Webhook' })
    async handlePaystackWebhook(
        @Req() req: RawBodyRequest<Request>,
        @Body() payload: any,
        @Headers('x-paystack-signature') signature: string,
    ) {
        const rawBody = req.rawBody?.toString() ?? JSON.stringify(payload);
        return this.paymentService.handlePaystackWebhook(payload, rawBody, signature);
    }


    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @Post('withdraw')
    @ApiOperation({ summary: 'Request a mobile money withdrawal' })
    async withdraw(@Request() req: any, @Body() dto: InitiateWithdrawalDto) {
        return this.paymentService.initiateUserWithdrawal(
            req.user.id,
            dto.amount,
            dto.bankCode,       // reusing bankCode field for mobileNetwork (e.g. "MTN", "VODAFONE")
            dto.accountNumber,  // reusing accountNumber field for mobileNumber
        );
    }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @Post('withdraw/confirm')
    @ApiOperation({ summary: 'Confirm a mobile money withdrawal using 2FA' })
    async confirmWithdraw(@Request() req: any, @Body() dto: ConfirmWithdrawalDto) {
        return this.paymentService.confirmUserWithdrawal(
            req.user.id,
            dto.sessionId,
            dto.code
        );
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    @ApiBearerAuth('JWT-auth')
    @Post('admin/withdraw')
    @ApiOperation({ summary: 'Admin withdrawal to company mobile money account' })
    async adminWithdraw(@Body() dto: AdminWithdrawalDto) {
        return this.paymentService.initiateAdminWithdrawal(dto.amount);
    }
}
