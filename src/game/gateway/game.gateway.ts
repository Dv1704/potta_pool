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
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { GameService } from '../services/game.service';
import { v4 as uuidv4 } from 'uuid';

@WebSocketGateway({ cors: { origin: '*' } })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server!: Server;

    constructor(
        private matchmakingService: MatchmakingService,
        private gameService: GameService,
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
        const match = await this.matchmakingService.addToQueue({
            userId: data.userId,
            socketId: client.id,
            stake: data.stake,
            mode: data.mode,
        });

        if (match) {
            const gameId = uuidv4();
            const playerIds = match.map((p: any) => p.userId);

            try {
                await this.gameService.createGame(gameId, playerIds, data.mode, data.stake);

                match.forEach((p: any) => {
                    this.server.to(p.socketId).emit('matchFound', {
                        gameId,
                        opponentId: playerIds.find((id: string) => id !== p.userId),
                        mode: data.mode,
                        stake: data.stake,
                        gameState: this.gameService.getGame(gameId)?.mode.getGameState()
                    });
                });
            } catch (error: any) {
                match.forEach((p: any) => {
                    this.server.to(p.socketId).emit('error', { message: 'Failed to create game: ' + error.message });
                });
            }
        } else {
            client.emit('waitingInQueue', { message: 'Searching for opponent...' });
        }
    }

    @SubscribeMessage('takeShot')
    async handleTakeShot(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { gameId: string; userId: string; angle: number; power: number; sideSpin: number; backSpin: number },
    ) {
        try {
            const result = await this.gameService.handleShot(
                data.gameId,
                data.userId,
                data.angle,
                data.power,
                data.sideSpin || 0,
                data.backSpin || 0
            );

            const game = this.gameService.getGame(data.gameId);
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

    @SubscribeMessage('getGameState')
    handleGetGameState(@ConnectedSocket() client: Socket, @MessageBody() data: { gameId: string }) {
        const game = this.gameService.getGame(data.gameId);
        if (game) {
            const state = game.mode.getGameState();
            client.emit('gameState', state);

            if (state.isGameOver) {
                // Trigger any cleanup or payout logic if it ended due to timeout
                // Actually handleShot usually does this, but for timeout we might need special handling
                // For now, getGameState triggers the status update.
            }
        }
    }
}
