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
import { IsNumber, IsString, IsPositive, Min, IsOptional } from 'class-validator';
export class DepositDto {
    amount;
    currency;
}
__decorate([
    ApiProperty({ example: 50.0 }),
    IsNumber(),
    IsPositive(),
    Min(10, { message: 'Minimum deposit is 10 GHS equivalent' }),
    __metadata("design:type", Number)
], DepositDto.prototype, "amount", void 0);
__decorate([
    ApiProperty({ example: 'GHS', required: false }),
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], DepositDto.prototype, "currency", void 0);
export class BalanceResponseDto {
    available;
    locked;
    currency;
}
__decorate([
    ApiProperty({ example: 100.0 }),
    __metadata("design:type", Number)
], BalanceResponseDto.prototype, "available", void 0);
__decorate([
    ApiProperty({ example: 20.0 }),
    __metadata("design:type", Number)
], BalanceResponseDto.prototype, "locked", void 0);
__decorate([
    ApiProperty({ example: 'GHS' }),
    __metadata("design:type", String)
], BalanceResponseDto.prototype, "currency", void 0);
