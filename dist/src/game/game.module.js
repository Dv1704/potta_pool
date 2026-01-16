var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { MatchmakingService } from './matchmaking/matchmaking.service.js';
import { GameService } from './services/game.service.js';
import { GameGateway } from './gateway/game.gateway.js';
import { GameController } from './controllers/game.controller.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { GameCleanupService } from './services/game-cleanup.service.js';
let GameModule = class GameModule {
};
GameModule = __decorate([
    Module({
        imports: [WalletModule, PrismaModule],
        controllers: [GameController],
        providers: [MatchmakingService, GameService, GameGateway, GameCleanupService],
        exports: [GameService],
    })
], GameModule);
export { GameModule };
