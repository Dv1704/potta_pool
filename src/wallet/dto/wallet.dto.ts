import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsPositive, Min, IsOptional } from 'class-validator';

export class DepositDto {
    @ApiProperty({ example: 50.0 })
    @IsNumber()
    @IsPositive()
    @Min(10, { message: 'Minimum deposit is 10 GHS equivalent' })
    amount!: number;

    @ApiProperty({ example: 'GHS', required: false })
    @IsString()
    @IsOptional()
    currency?: string;
}

export class BalanceResponseDto {
    @ApiProperty({ example: 100.0 })
    available!: number;

    @ApiProperty({ example: 20.0 })
    locked!: number;

    @ApiProperty({ example: 'GHS' })
    currency!: string;
}
