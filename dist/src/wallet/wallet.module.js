var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module, forwardRef } from '@nestjs/common';
import { WalletService } from './wallet.service.js';
import { FXService } from './fx.service.js';
import { TransferService } from './transfer.service.js';
import { Transfer2FAService } from './transfer-2fa.service.js';
import { WalletController } from './wallet.controller.js';
import { PaymentController } from './payment.controller.js';
import { PaymentService } from './payment.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from '../admin/admin.module.js';
import { EmailModule } from '../email/email.module.js';
let WalletModule = class WalletModule {
};
WalletModule = __decorate([
    Module({
        imports: [PrismaModule, ConfigModule, EmailModule, forwardRef(() => AdminModule)],
        controllers: [WalletController, PaymentController],
        providers: [WalletService, FXService, TransferService, Transfer2FAService, PaymentService],
        exports: [WalletService, PaymentService],
    })
], WalletModule);
export { WalletModule };
