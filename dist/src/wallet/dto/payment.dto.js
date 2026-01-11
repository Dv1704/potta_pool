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
export class InitiateDepositDto {
    amount;
    currency;
    email;
    callbackUrl;
}
__decorate([
    ApiProperty({ example: 100 }),
    __metadata("design:type", Number)
], InitiateDepositDto.prototype, "amount", void 0);
__decorate([
    ApiProperty({ example: 'GHS' }),
    __metadata("design:type", String)
], InitiateDepositDto.prototype, "currency", void 0);
__decorate([
    ApiProperty({ example: 'test@example.com' }),
    __metadata("design:type", String)
], InitiateDepositDto.prototype, "email", void 0);
__decorate([
    ApiProperty({ example: 'http://localhost:5173/games', required: false }),
    __metadata("design:type", String)
], InitiateDepositDto.prototype, "callbackUrl", void 0);
export class InitiateWithdrawalDto {
    amount;
    bankCode; // e.g., "MTN", "VODAFONE", or bank code
    accountNumber;
    accountName;
}
__decorate([
    ApiProperty({ example: 50 }),
    __metadata("design:type", Number)
], InitiateWithdrawalDto.prototype, "amount", void 0);
__decorate([
    ApiProperty({ example: 'MTN' }),
    __metadata("design:type", String)
], InitiateWithdrawalDto.prototype, "bankCode", void 0);
__decorate([
    ApiProperty({ example: '0540000000' }),
    __metadata("design:type", String)
], InitiateWithdrawalDto.prototype, "accountNumber", void 0);
__decorate([
    ApiProperty({ example: 'John Doe' }),
    __metadata("design:type", String)
], InitiateWithdrawalDto.prototype, "accountName", void 0);
export class AdminWithdrawalDto {
    amount;
}
__decorate([
    ApiProperty({ example: 1000 }),
    __metadata("design:type", Number)
], AdminWithdrawalDto.prototype, "amount", void 0);
