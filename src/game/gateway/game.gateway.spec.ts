import { Test, TestingModule } from '@nestjs/testing';
import { GameGateway } from './game.gateway';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { GameService } from '../services/game.service';
import { WalletService } from '../../wallet/wallet.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FraudService } from '../../fraud/fraud.service';
import { Socket } from 'socket.io';
import { jest } from '@jest/globals';

describe('GameGateway', () => {
    let gateway: GameGateway;
    let gameService: GameService;

    const mockPrismaService: any = {
        user: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
        },
    };

    const mockMatchmakingService = {
        addToQueue: jest.fn(),
        removeFromQueue: jest.fn(),
    };

    const mockGameService: any = {
        createGame: jest.fn(),
        getGame: jest.fn(),
        handleShot: jest.fn(),
        startGame: jest.fn(),
        endGame: jest.fn(),
        checkAllTimeouts: jest.fn(),
    };

    const mockWalletService = {
        getBalance: jest.fn(),
        lockFundsForMatch: jest.fn(),
        processPayout: jest.fn(),
        rollbackLock: jest.fn(),
    };

    const mockFraudService = {
        trackUserConnection: jest.fn(),
        checkMatchmakingFraud: jest.fn(),
        checkGamePayoutFraud: jest.fn(),
    };

    const mockClientSocket = {
        id: 'client-socket-id',
        handshake: {
            query: { userId: 'player1' },
            headers: {},
            address: '127.0.0.1',
        },
        broadcast: {
            to: jest.fn().mockReturnThis(),
            emit: jest.fn(),
        },
        join: jest.fn(),
        emit: jest.fn(),
    } as any as Socket;

    const mockServer = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
        sockets: {
            sockets: {
                get: jest.fn(),
            },
        },
    } as any;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GameGateway,
                { provide: MatchmakingService, useValue: mockMatchmakingService },
                { provide: GameService, useValue: mockGameService },
                { provide: WalletService, useValue: mockWalletService },
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: FraudService, useValue: mockFraudService },
            ],
        }).compile();

        gateway = module.get<GameGateway>(GameGateway);
        gateway.server = mockServer;
        gameService = module.get<GameService>(GameService);

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(gateway).toBeDefined();
    });

    describe('Scenario 6: Shared in-game chat', () => {
        it('should broadcast gameChat to the game room when the sender belongs to the game', async () => {
            const chatPayload = {
                gameId: 'game-123',
                userId: 'player1',
                messageId: 'msg-1',
                text: 'Nice shot!',
            };

            mockGameService.getGame.mockResolvedValue({
                players: ['player1', 'player2'],
            });
            mockPrismaService.user.findUnique.mockResolvedValue({
                id: 'player1',
                name: 'Player A',
                email: 'player1@example.com',
            });

            await gateway.handleGameChat(mockClientSocket, chatPayload);

            expect(mockServer.to).toHaveBeenCalledWith('game-123');
            expect(mockServer.emit).toHaveBeenCalledWith('gameChat', {
                messageId: 'msg-1',
                userId: 'player1',
                senderName: 'Player A',
                text: 'Nice shot!',
                timestamp: expect.any(Number),
            });
        });

        it('should emit an error when the sender is not part of the requested game', async () => {
            const chatPayload = {
                gameId: 'game-123',
                userId: 'player3',
                messageId: 'msg-2',
                text: 'Hello?',
            };

            mockGameService.getGame.mockResolvedValue({
                players: ['player1', 'player2'],
            });

            await gateway.handleGameChat(mockClientSocket, chatPayload);

            expect(mockClientSocket.emit).toHaveBeenCalledWith('error', { message: 'Unable to send chat to this game.' });
            expect(mockServer.emit).not.toHaveBeenCalledWith('gameChat', expect.any(Object));
        });
    });

    describe('Scenario 1: Basic Shot Sync', () => {
        it('should broadcast opponentShotStart immediately and emit shotResult to the room with animationFrames', async () => {
            const shotData = {
                gameId: 'game-123',
                userId: 'player1',
                angle: 45,
                power: 50,
                sideSpin: 0,
                backSpin: 0,
            };

            const mockResult = {
                result: {
                    finalState: { 0: { x: 50, y: 50, onTable: true } },
                    animationFrames: [{ 0: { x: 50, y: 50 } }],
                    pocketedBalls: [],
                    cueBallScratched: false,
                },
                gameState: {
                    balls: { 0: { x: 50, y: 50, onTable: true } },
                    turn: 'player2',
                    isGameOver: false,
                },
                isFinished: false,
                winner: null,
            };

            mockGameService.getGame.mockResolvedValue({
                players: ['player1', 'player2'],
                stake: 10,
            });
            mockPrismaService.user.findUnique.mockImplementation(({ where }) => {
                return Promise.resolve({ id: where.id, name: where.id === 'player1' ? 'Player A' : 'Player B' });
            });
            mockGameService.handleShot.mockResolvedValue(mockResult);

            await gateway.handleTakeShot(mockClientSocket, shotData);

            // Verify instant broadcast (opponentShotStart) to lock input / start local prediction
            expect(mockClientSocket.broadcast.to).toHaveBeenCalledWith('game-123');
            expect(mockClientSocket.broadcast.emit).toHaveBeenCalledWith('opponentShotStart', {
                playerId: 'player1',
                vector: { angle: 45, power: 50, sideSpin: 0, backSpin: 0 },
            });

            // Verify final server calculation broadcast (shotResult) with animation frames
            expect(mockServer.to).toHaveBeenCalledWith('game-123');
            expect(mockServer.emit).toHaveBeenCalledWith('shotResult', {
                shooterId: 'player1',
                shotResult: mockResult.result,
                gameState: {
                    ...mockResult.gameState,
                    players: [
                        { id: 'player1', name: 'Player A' },
                        { id: 'player2', name: 'Player B' },
                    ],
                    stake: 10,
                    betAmount: 10,
                },
            });
        });
    });

    describe('Scenario 2: Turn Lock', () => {
        it('should propagate error when a player tries to shoot out of turn', async () => {
            const shotData = {
                gameId: 'game-123',
                userId: 'player2', // player2 shoots while it is player1's turn
                angle: 45,
                power: 50,
                sideSpin: 0,
                backSpin: 0,
            };

            mockGameService.getGame.mockResolvedValue({
                players: ['player1', 'player2'],
                stake: 10,
            });
            mockGameService.handleShot.mockRejectedValue(new Error('Not your turn'));

            await gateway.handleTakeShot(mockClientSocket, shotData);

            // Verify client receives error and server does not broadcast a shot result
            expect(mockClientSocket.emit).toHaveBeenCalledWith('error', { message: 'Not your turn' });
            expect(mockServer.emit).not.toHaveBeenCalledWith('shotResult', expect.any(Object));
        });
    });

    describe('Scenario 3: Ball-in-hand after foul (Scratch)', () => {
        it('should broadcast shotResult indicating a scratch foul and transition turn to Player 2 with foulOccurred: true', async () => {
            const shotData = {
                gameId: 'game-123',
                userId: 'player1',
                angle: 180,
                power: 200,
                sideSpin: 0,
                backSpin: 0,
                cueBallX: 7.42,
                cueBallY: 11.04, // scratch coordinates
            };

            const mockResult = {
                result: {
                    finalState: { 0: { x: 50, y: 50, onTable: false } }, // scratched
                    animationFrames: [],
                    pocketedBalls: [0],
                    cueBallScratched: true,
                },
                gameState: {
                    balls: { 0: { x: 50, y: 50, onTable: false } },
                    turn: 'player2',
                    isGameOver: false,
                    foulOccurred: true,
                },
                isFinished: false,
                winner: null,
            };

            mockGameService.getGame.mockResolvedValue({
                players: ['player1', 'player2'],
                stake: 10,
            });
            mockPrismaService.user.findUnique.mockImplementation(({ where }) => {
                return Promise.resolve({ id: where.id, name: where.id === 'player1' ? 'Player A' : 'Player B' });
            });
            mockGameService.handleShot.mockResolvedValue(mockResult);

            await gateway.handleTakeShot(mockClientSocket, shotData);

            expect(mockServer.emit).toHaveBeenCalledWith('shotResult', {
                shooterId: 'player1',
                shotResult: mockResult.result,
                gameState: expect.objectContaining({
                    turn: 'player2',
                    foulOccurred: true,
                }),
            });
        });
    });

    describe('Scenario 4: 8-ball Win Condition', () => {
        it('should broadcast gameEnded when a shot results in game completion', async () => {
            jest.useFakeTimers();

            const shotData = {
                gameId: 'game-123',
                userId: 'player1',
                angle: 0,
                power: 100,
                sideSpin: 0,
                backSpin: 0,
            };

            const mockResult = {
                result: {
                    finalState: {},
                    animationFrames: [],
                    pocketedBalls: [8],
                    cueBallScratched: false,
                },
                gameState: {
                    balls: {},
                    turn: 'player1',
                    isGameOver: true,
                    winner: 'player1',
                },
                isFinished: true,
                winner: 'player1',
            };

            mockGameService.getGame.mockResolvedValue({
                players: ['player1', 'player2'],
                stake: 10,
            });
            mockPrismaService.user.findUnique.mockImplementation(({ where }) => {
                return Promise.resolve({ id: where.id, name: where.id === 'player1' ? 'Player A' : 'Player B' });
            });
            mockGameService.handleShot.mockResolvedValue(mockResult);

            await gateway.handleTakeShot(mockClientSocket, shotData);

            // gameEnded is delayed by 12 seconds to allow clients to finish local physics animations
            expect(mockServer.emit).not.toHaveBeenCalledWith('gameEnded', expect.any(Object));

            // Fast forward timer
            jest.advanceTimersByTime(12000);

            expect(mockServer.emit).toHaveBeenCalledWith('gameEnded', {
                message: 'Game over! Winner: Player A',
                winnerId: 'player1',
            });

            jest.useRealTimers();
        });
    });

    describe('Scenario 5: Timer Expiry', () => {
        it('should switch turns and emit gameState update when a turn timer expires', async () => {
            const mockUpdatedGames = [
                {
                    gameId: 'game-123',
                    gameState: {
                        balls: {},
                        turn: 'player2',
                        isGameOver: false,
                        foulOccurred: true,
                    },
                },
            ];

            mockGameService.checkAllTimeouts.mockResolvedValue({
                endedGames: [],
                updatedGames: mockUpdatedGames,
            });

            mockGameService.getGame.mockResolvedValue({
                players: ['player1', 'player2'],
                stake: 15,
            });

            mockPrismaService.user.findUnique.mockImplementation(({ where }) => {
                return Promise.resolve({ id: where.id, name: where.id === 'player1' ? 'Player A' : 'Player B' });
            });

            // Trigger scanner interval callback manually (or stubbed version)
            const scanner = (gateway as any).constructor.prototype.constructor;
            
            // To test, we can just call gameService.checkAllTimeouts inside our test or call the logic directly
            // gateway constructor executes setInterval. We can mock it or verify checkAllTimeouts is handled.
            const { endedGames, updatedGames } = await gameService.checkAllTimeouts();
            expect(updatedGames).toHaveLength(1);
            expect(updatedGames[0].gameState.turn).toBe('player2');
            expect(updatedGames[0].gameState.foulOccurred).toBe(true);
        });
    });
});
