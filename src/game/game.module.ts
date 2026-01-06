import { Module } from '@nestjs/common';
import { MatchmakingService } from './matchmaking/matchmaking.service';
import { GameService } from './services/game.service';
import { GameGateway } from './gateway/game.gateway';
import { WalletModule } from '../wallet/wallet.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [WalletModule, PrismaModule],
    providers: [MatchmakingService, GameService, GameGateway],
    exports: [GameService],
})
export class GameModule { }
