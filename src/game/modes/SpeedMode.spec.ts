import { SpeedMode } from './SpeedMode';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

describe('SpeedMode', () => {
    let speedMode: SpeedMode;

    beforeEach(() => {
        speedMode = new SpeedMode(['player1', 'player2']);
        speedMode.startGame();
    });

    it('should initialize scores to 0 and have no turn field in game state', () => {
        const state = speedMode.getGameState() as any;
        expect(state.scores['player1']).toBe(0);
        expect(state.scores['player2']).toBe(0);
        expect(state.turn).toBeUndefined();
        expect(state.overallTimeRemaining).toBeGreaterThanOrEqual(0);
    });

    it('should add one point per potted object ball', () => {
        const mockExecute = jest.spyOn((speedMode as any).engine, 'executeShot').mockReturnValue({
            cueBallScratched: false,
            firstBallCollided: 1,
            pocketedBalls: [1, 2, 0],
            events: [],
            animationFrames: []
        });

        speedMode.handleShot('player1', 0, 10, 0, 0);
        const state = speedMode.getGameState() as any;

        expect(state.scores['player1']).toBe(2);
        expect(state.scores['player2']).toBe(0);
        expect(state.turn).toBeUndefined();

        mockExecute.mockRestore();
    });

    it('should allow any player to shoot without turn validation', () => {
        const mockExecute = jest.spyOn((speedMode as any).engine, 'executeShot').mockReturnValue({
            cueBallScratched: false,
            firstBallCollided: 1,
            pocketedBalls: [3],
            events: [],
            animationFrames: []
        });

        speedMode.handleShot('player1', 0, 10, 0, 0);
        speedMode.handleShot('player2', 0, 10, 0, 0);

        const state = speedMode.getGameState() as any;
        expect(state.scores['player1']).toBe(1);
        expect(state.scores['player2']).toBe(1);
        expect(state.turn).toBeUndefined();

        mockExecute.mockRestore();
    });

    it('should not add score for a foul and still return no turn field', () => {
        const mockExecute = jest.spyOn((speedMode as any).engine, 'executeShot').mockReturnValue({
            cueBallScratched: true,
            firstBallCollided: 1,
            pocketedBalls: [2],
            events: [],
            animationFrames: []
        });

        speedMode.handleShot('player1', 0, 10, 0, 0);
        const state = speedMode.getGameState() as any;

        expect(state.scores['player1']).toBe(0);
        expect(state.turn).toBeUndefined();
        expect(state.overallTimeRemaining).toBeGreaterThanOrEqual(0);

        mockExecute.mockRestore();
    });

    it('should end game after 60 seconds and declare higher score winner', () => {
        (speedMode as any).scores['player1'] = 5;
        (speedMode as any).scores['player2'] = 4;
        (speedMode as any).gameStartTime = Date.now() - 61000;

        const hadChanges = speedMode.updateStatus();

        expect(hadChanges).toBe(true);
        expect(speedMode.isFinished()).toBe(true);
        expect(speedMode.getWinner()).toBe('player1');
    });

    it('should end game when no balls remain on table', () => {
        (speedMode as any).engine.getBalls = jest.fn().mockReturnValue([
            { getNumber: () => 0, isBallOnTable: () => true }
        ]);
        (speedMode as any).gameStartTime = Date.now() - 10000;

        const hadChanges = speedMode.updateStatus();

        expect(hadChanges).toBe(true);
        expect(speedMode.isFinished()).toBe(true);
    });

    it('should declare tie-break winner by streak when scores are equal', () => {
        (speedMode as any).scores['player1'] = 3;
        (speedMode as any).scores['player2'] = 3;
        (speedMode as any).streaks = { player1: 1, player2: 3 };
        (speedMode as any).gameStartTime = Date.now() - 61000;

        speedMode.updateStatus();

        expect(speedMode.getWinner()).toBe('player2');
    });

    it('should not accept shots after game has ended', () => {
        (speedMode as any).gameStartTime = Date.now() - 61000;
        speedMode.updateStatus(); // ends the game

        const mockExecute = jest.spyOn((speedMode as any).engine, 'executeShot');
        expect(() => speedMode.handleShot('player1', 0, 10, 0, 0)).toThrow('Game is already over');
        expect(mockExecute).not.toHaveBeenCalled();
        mockExecute.mockRestore();
    });

    it('should return overallTimeRemaining close to 60 on fresh start', () => {
        const fresh = new SpeedMode(['player1', 'player2']);
        fresh.startGame();
        const state = fresh.getGameState() as any;
        expect(state.overallTimeRemaining).toBeGreaterThanOrEqual(58);
        expect(state.overallTimeRemaining).toBeLessThanOrEqual(60);
    });

    it('should accumulate scores across multiple shots from same player', () => {
        const mockExecute = jest.spyOn((speedMode as any).engine, 'executeShot').mockReturnValue({
            cueBallScratched: false,
            firstBallCollided: 1,
            pocketedBalls: [1],
            events: [],
            animationFrames: []
        });

        speedMode.handleShot('player1', 0, 10, 0, 0);
        speedMode.handleShot('player1', 0, 10, 0, 0);
        speedMode.handleShot('player1', 0, 10, 0, 0);

        const state = speedMode.getGameState() as any;
        expect(state.scores['player1']).toBe(3);

        mockExecute.mockRestore();
    });
});
