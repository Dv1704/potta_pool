import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
    @ApiProperty({ example: 'user@example.com' })
    email!: string;

    @ApiProperty({ example: 'password123' })
    password!: string;
}

export class RegisterDto {
    @ApiProperty({ example: 'user@example.com' })
    email!: string;

    @ApiProperty({ example: 'password123' })
    password!: string;

    @ApiProperty({ example: 'John Doe', required: false })
    name?: string;

    @ApiProperty({ example: 'REF123', required: false })
    referralCode?: string;
}

export class ForgotPasswordDto {
    @ApiProperty({ example: 'user@example.com' })
    email!: string;
}

export class ResetPasswordDto {
    @ApiProperty({ example: 'user@example.com' })
    email!: string;

    @ApiProperty({ example: 'token123' })
    token!: string;

    @ApiProperty({ example: 'newPassword123' })
    newPassword!: string;
}
