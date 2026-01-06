var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { MatchmakingService } from './matchmaking/matchmaking.service';
import { GameService } from './services/game.service';
import { GameGateway } from './gateway/game.gateway';
import { WalletModule } from '../wallet/wallet.module';
import { PrismaModule } from '../prisma/prisma.module';
let GameModule = class GameModule {
};
GameModule = __decorate([
    Module({
        imports: [WalletModule, PrismaModule],
        providers: [MatchmakingService, GameService, GameGateway],
        exports: [GameService],
    })
], GameModule);
export { GameModule };
