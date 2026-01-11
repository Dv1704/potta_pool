
import { Module, forwardRef } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { AdminController } from './admin.controller.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletModule } from '../wallet/wallet.module.js';

@Module({
    imports: [forwardRef(() => WalletModule)],
    controllers: [AdminController],
    providers: [AdminService, PrismaService],
    exports: [AdminService]
})
export class AdminModule { }
