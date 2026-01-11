import { ApiProperty } from '@nestjs/swagger';

export class InitiateDepositDto {
    @ApiProperty({ example: 100 })
    amount!: number;

    @ApiProperty({ example: 'GHS' })
    currency!: string;

    @ApiProperty({ example: 'test@example.com' })
    email!: string;

    @ApiProperty({ example: 'http://localhost:5173/games', required: false })
    callbackUrl?: string;
}

export class InitiateWithdrawalDto {
    @ApiProperty({ example: 50 })
    amount!: number;

    @ApiProperty({ example: 'MTN' })
    bankCode!: string; // e.g., "MTN", "VODAFONE", or bank code

    @ApiProperty({ example: '0540000000' })
    accountNumber!: string;

    @ApiProperty({ example: 'John Doe' })
    accountName!: string;
}

export class AdminWithdrawalDto {
    @ApiProperty({ example: 1000 })
    amount!: number;
}
