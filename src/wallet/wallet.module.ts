import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service.js';
import { FXService } from './fx.service.js';
import { WalletController } from './wallet.controller.js';
import { PaymentController } from './payment.controller.js';
import { PaymentService } from './payment.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [PrismaModule, ConfigModule],
    controllers: [WalletController, PaymentController],
    providers: [WalletService, FXService, PaymentService],
    exports: [WalletService, PaymentService],
})
export class WalletModule { }
