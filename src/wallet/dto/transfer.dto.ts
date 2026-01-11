import { IsEmail, IsNotEmpty, IsNumber, IsPositive, IsString, Min, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TransferDto {
    @ApiProperty({ example: 50.0 })
    @IsNumber()
    @IsPositive()
    @Min(1)
    amount!: number;

    @ApiProperty({ example: 'player2@example.com' })
    @IsString()
    @IsNotEmpty()
    recipientIdentifier!: string; // Can be email or username
}

export class ConfirmTransferDto {
    @ApiProperty({ example: '123456' })
    @IsString()
    @IsNotEmpty()
    code!: string;

    @ApiProperty({ example: 'uuid-session-id' })
    @IsUUID()
    @IsNotEmpty()
    sessionId!: string;
}
