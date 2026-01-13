import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MatchmakingService } from '../matchmaking/matchmaking.service.js';
import { GameService } from '../services/game.service.js';
import { v4 as uuidv4 } from 'uuid';
import { WalletService } from '../../wallet/wallet.service.js';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@WebSocketGateway({ cors: { origin: '*' } })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server!: Server;

    private lastShotTime: Map<string, number> = new Map();

    constructor(
        private matchmakingService: MatchmakingService,
        private gameService: GameService,
        private walletService: WalletService,
        private prisma: PrismaService,
    ) {
        // Periodic check for timeouts (every 5 seconds)
        setInterval(async () => {
            const finishedGames = await this.gameService.checkAllTimeouts();
            for (const gameId of finishedGames) {
                this.server.to(gameId).emit('gameEnded', {
                    message: 'Game ended due to timeout'
                });
            }
        }, 5000);
    }

    handleConnection(client: Socket) {
        console.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        console.log(`Client disconnected: ${client.id}`);
        const userId = client.handshake.query.userId as string;
        if (userId) {
            this.matchmakingService.removeFromQueue(userId);
        }
    }

    @SubscribeMessage('joinQueue')
    async handleJoinQueue(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId: string; stake: number; mode: 'speed' | 'turn' },
    ) {
        console.log(`[JoinQueue] Request from ${data.userId} (Socket: ${client.id}) for stake ${data.stake}`);

        try {
            // 1. Insufficient Funds Guard
            const balance = await this.walletService.getBalance(data.userId);
            console.log(`[JoinQueue] User ${data.userId} balance: ${balance.available}`);

            if (balance.available < data.stake) {
                console.warn(`[JoinQueue] Insufficient funds for ${data.userId}: ${balance.available} < ${data.stake}`);
                client.emit('error', { message: 'Insufficient funds for this stake' });
                return;
            }

            const match = await this.matchmakingService.addToQueue({
                userId: data.userId,
                socketId: client.id,
                stake: data.stake,
                mode: data.mode,
            });

            if (match) {
                console.log(`[JoinQueue] Match found for ${data.userId}! Creating game...`);
                const gameId = uuidv4();
                const playerIds = match.map((p: any) => p.userId);

                try {
                    await this.gameService.createGame(gameId, playerIds, data.mode, data.stake);
                    const game = await this.gameService.getGame(gameId);

                    // Fetch opponent names from database
                    for (const p of match) {
                        const opponentId = playerIds.find((id: string) => id !== p.userId);
                        const opponent = await this.prisma.user.findUnique({
                            where: { id: opponentId },
                            select: { name: true, email: true }
                        });

                        this.server.to(p.socketId).emit('matchFound', {
                            gameId,
                            opponentId,
                            opponentName: opponent?.name || opponent?.email?.split('@')[0] || 'Player',
                            mode: data.mode,
                            stake: data.stake,
                            gameState: game?.mode.getGameState()
                        });
                    }
                    console.log(`[JoinQueue] Game ${gameId} created successfully.`);
                } catch (error: any) {
                    console.error(`[JoinQueue] Failed to create game: ${error.message}`);
                    match.forEach((p: any) => {
                        this.server.to(p.socketId).emit('error', { message: 'Failed to create game: ' + error.message });
                    });
                }
            } else {
                console.log(`[JoinQueue] No match found immediately. User ${data.userId} added to queue.`);
                client.emit('waitingInQueue', { message: 'Searching for opponent...' });
            }
        } catch (error: any) {
            console.error(`[JoinQueue] Error handling join queue: ${error.message}`);
            client.emit('error', { message: error.message || 'An unexpected error occurred' });
        }
    }

    @SubscribeMessage('takeShot')
    async handleTakeShot(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { gameId: string; userId: string; angle: number; power: number; sideSpin: number; backSpin: number },
    ) {
        // 2. Input Throttling
        const lastShot = this.lastShotTime.get(data.userId) || 0;
        const now = Date.now();
        if (now - lastShot < 1000) { // 1 second throttle
            // client.emit('error', { message: 'Shooting too fast' }); // Optional: don't spam error
            return;
        }
        this.lastShotTime.set(data.userId, now);

        try {
            const result = await this.gameService.handleShot(
                data.gameId,
                data.userId,
                data.angle,
                data.power,
                data.sideSpin || 0,
                data.backSpin || 0
            );

            const game = await this.gameService.getGame(data.gameId);
            if (game) {
                this.server.to(data.gameId).emit('shotResult', {
                    shotResult: result,
                    gameState: game.mode.getGameState()
                });
            }
        } catch (error: any) {
            client.emit('error', { message: error.message });
        }
    }

    @SubscribeMessage('joinGame')
    handleJoinGame(@ConnectedSocket() client: Socket, @MessageBody() data: { gameId: string }) {
        client.join(data.gameId);
    }

    @SubscribeMessage('leaveQueue')
    async handleLeaveQueue(@MessageBody() data: { userId: string }) {
        await this.matchmakingService.removeFromQueue(data.userId);
    }

    @SubscribeMessage('getGameState')
    async handleGetGameState(@ConnectedSocket() client: Socket, @MessageBody() data: { gameId: string }) {
        const game = await this.gameService.getGame(data.gameId);
        if (game) {
            const state = game.mode.getGameState();
            client.emit('gameState', state);
        }
    }
}
