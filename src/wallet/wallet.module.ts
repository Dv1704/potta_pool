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

@Module({
    imports: [PrismaModule, ConfigModule, EmailModule, forwardRef(() => AdminModule)],
    controllers: [WalletController, PaymentController],
    providers: [WalletService, FXService, TransferService, Transfer2FAService, PaymentService],
    exports: [WalletService, PaymentService],
})
export class WalletModule { }
