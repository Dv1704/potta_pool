import { Module } from '@nestjs/common';
import { FraudService } from './fraud.service.js';
import { FraudController } from './fraud.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
    imports: [PrismaModule],
    providers: [FraudService],
    controllers: [FraudController],
    exports: [FraudService]
})
export class FraudModule {}
