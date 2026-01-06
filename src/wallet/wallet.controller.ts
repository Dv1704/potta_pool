import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { WalletService } from './wallet.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DepositDto, BalanceResponseDto } from './dto/wallet.dto.js';

@ApiTags('Wallet')
@Controller('wallet')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WalletController {
    constructor(private readonly walletService: WalletService) { }

    @Get('balance')
    @ApiOperation({ summary: 'Get current wallet balance' })
    @ApiResponse({ status: 200, type: BalanceResponseDto })
    async getBalance(@Request() req: any) {
        return this.walletService.getBalance(req.user.id);
    }

    @Post('deposit')
    @ApiOperation({ summary: 'Deposit funds into wallet' })
    @ApiResponse({ status: 201, description: 'Deposit successful' })
    @ApiResponse({ status: 400, description: 'Invalid amount or currency' })
    async deposit(@Request() req: any, @Body() depositDto: DepositDto) {
        return this.walletService.deposit(req.user.id, depositDto.amount, depositDto.currency);
    }
}
