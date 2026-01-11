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

@ApiTags('Wallet')
@Controller('wallet')
@ApiBearerAuth('JWT-auth')
export class WalletController {
    constructor(
        private readonly walletService: WalletService,
        private readonly fxService: FXService,
        private readonly transferService: TransferService,
        private readonly prisma: PrismaService
    ) { }

    @Get('balance')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get current wallet balance' })
    @ApiResponse({ status: 200, type: BalanceResponseDto })
    async getBalance(@Request() req: any) {
        return this.walletService.getBalance(req.user.id);
    }

    @Get('history')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get transaction history' })
    @ApiResponse({ status: 200, description: 'Returns ledger entries' })
    async getHistory(@Request() req: any) {
        return this.walletService.getHistory(req.user.id);
    }

    @Get('rates')
    @ApiOperation({ summary: 'Get live currency exchange rates' })
    @ApiResponse({ status: 200, description: 'Returns current exchange rates with GHS as base' })
    async getRates() {
        return this.fxService.getLiveRates();
    }

    @Post('transfer/initiate')
    @UseGuards(JwtAuthGuard)
    @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
    @ApiOperation({ summary: 'Initiate a transfer (may require 2FA)' })
    @ApiResponse({ status: 200, description: 'Transfer initiated or 2FA required' })
    async initiateTransfer(@Request() req: any, @Body() dto: TransferDto) {
        return this.transferService.initiateTransfer(req.user.id, dto.recipientIdentifier, dto.amount);
    }

    @Post('transfer/confirm')
    @UseGuards(JwtAuthGuard)
    @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
    @ApiOperation({ summary: 'Confirm transfer with 2FA code' })
    @ApiResponse({ status: 200, description: 'Transfer completed' })
    async confirmTransfer(@Request() req: any, @Body() dto: ConfirmTransferDto) {
        return this.transferService.confirmTransfer(req.user.id, dto.sessionId, dto.code);
    }

    @Post('debug/inject-balance')
    @ApiOperation({ summary: 'TEMPORARY: Inject balance for testing' })
    async injectBalance(@Body() body: { email: string, amount: number }) {
        const user = await this.prisma.user.findUnique({ where: { email: body.email } });
        if (!user) return { error: 'User not found' };
        return this.walletService.deposit(user.id, body.amount);
    }
}
