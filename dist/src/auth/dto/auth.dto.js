var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ApiProperty } from '@nestjs/swagger';
export class LoginDto {
    email;
    password;
}
__decorate([
    ApiProperty({ example: 'user@example.com' }),
    __metadata("design:type", String)
], LoginDto.prototype, "email", void 0);
__decorate([
    ApiProperty({ example: 'password123' }),
    __metadata("design:type", String)
], LoginDto.prototype, "password", void 0);
export class RegisterDto {
    email;
    password;
    name;
}
__decorate([
    ApiProperty({ example: 'user@example.com' }),
    __metadata("design:type", String)
], RegisterDto.prototype, "email", void 0);
__decorate([
    ApiProperty({ example: 'password123' }),
    __metadata("design:type", String)
], RegisterDto.prototype, "password", void 0);
__decorate([
    ApiProperty({ example: 'John Doe', required: false }),
    __metadata("design:type", String)
], RegisterDto.prototype, "name", void 0);
export class ForgotPasswordDto {
    email;
}
__decorate([
    ApiProperty({ example: 'user@example.com' }),
    __metadata("design:type", String)
], ForgotPasswordDto.prototype, "email", void 0);
export class ResetPasswordDto {
    email;
    token;
    newPassword;
}
__decorate([
    ApiProperty({ example: 'user@example.com' }),
    __metadata("design:type", String)
], ResetPasswordDto.prototype, "email", void 0);
__decorate([
    ApiProperty({ example: 'token123' }),
    __metadata("design:type", String)
], ResetPasswordDto.prototype, "token", void 0);
__decorate([
    ApiProperty({ example: 'newPassword123' }),
    __metadata("design:type", String)
], ResetPasswordDto.prototype, "newPassword", void 0);
