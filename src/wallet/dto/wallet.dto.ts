import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsPositive, Min, IsOptional } from 'class-validator';



export class BalanceResponseDto {
    @ApiProperty({ example: 100.0 })
    available!: number;

    @ApiProperty({ example: 20.0 })
    locked!: number;

    @ApiProperty({ example: 'GHS' })
    currency!: string;
}
