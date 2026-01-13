import { Module } from '@nestjs/common';
import { MatchmakingService } from './matchmaking/matchmaking.service.js';
import { GameService } from './services/game.service.js';
import { GameGateway } from './gateway/game.gateway.js';
import { GameController } from './controllers/game.controller.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { GameCleanupService } from './services/game-cleanup.service.js';

@Module({
    imports: [WalletModule, PrismaModule],
    controllers: [GameController],
    providers: [MatchmakingService, GameService, GameGateway, GameCleanupService],
    exports: [GameService],
})
export class GameModule { }

