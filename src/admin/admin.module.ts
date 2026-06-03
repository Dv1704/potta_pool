
import { Module, forwardRef } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { AdminController } from './admin.controller.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { UsersModule } from '../users/users.module.js';

@Module({
    imports: [forwardRef(() => WalletModule), UsersModule],
    controllers: [AdminController],
    providers: [AdminService, PrismaService],
    exports: [AdminService]
})
export class AdminModule { }
