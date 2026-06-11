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

    it('should end game immediately when player scratches cue ball and opponent wins', () => {
        const mockExecute = jest.spyOn((speedMode as any).engine, 'executeShot').mockReturnValue({
            cueBallScratched: true,
            firstBallCollided: 1,
            pocketedBalls: [2],
            events: [],
            animationFrames: []
        });

        speedMode.handleShot('player1', 0, 10, 0, 0);
        const state = speedMode.getGameState() as any;

        expect(state.isGameOver).toBe(true);
        expect(state.winner).toBe('player2'); // Opponent wins
        expect(state.scores['player1']).toBe(0); // Cue ball scratch = no score
        expect(state.streaks['player1']).toBe(0);

        mockExecute.mockRestore();
    });

    it('should end game when player2 scratches and player1 wins', () => {
        const mockExecute = jest.spyOn((speedMode as any).engine, 'executeShot').mockReturnValue({
            cueBallScratched: true,
            firstBallCollided: 1,
            pocketedBalls: [],
            events: [],
            animationFrames: []
        });

        speedMode.handleShot('player2', 0, 10, 0, 0);
        const state = speedMode.getGameState() as any;

        expect(state.isGameOver).toBe(true);
        expect(state.winner).toBe('player1');

        mockExecute.mockRestore();
    });

    it('should reset streak on foul but continue game', () => {
        const mockExecute = jest.spyOn((speedMode as any).engine, 'executeShot').mockReturnValue({
            cueBallScratched: false,
            firstBallCollided: null, // No ball hit = foul
            pocketedBalls: [],
            events: [],
            animationFrames: []
        });

        // First, build up a streak
        (speedMode as any).streaks['player1'] = 5;

        // Then foul
        speedMode.handleShot('player1', 0, 10, 0, 0);
        const state = speedMode.getGameState() as any;

        expect(state.isGameOver).toBe(false); // Game continues
        expect(state.streaks['player1']).toBe(0); // Streak reset
        expect(state.scores['player1']).toBe(0); // No score for foul

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

    it('should correctly assign winner when player1 has higher score', () => {
        const mockExecute = jest.spyOn((speedMode as any).engine, 'executeShot').mockReturnValue({
            cueBallScratched: false,
            firstBallCollided: 1,
            pocketedBalls: [1, 2],
            events: [],
            animationFrames: []
        });

        // Player1 pots 2 balls twice = 4 points
        speedMode.handleShot('player1', 0, 10, 0, 0);
        speedMode.handleShot('player1', 0, 10, 0, 0);

        // Player2 pots 2 balls once = 2 points
        speedMode.handleShot('player2', 0, 10, 0, 0);

        // End game
        (speedMode as any).gameStartTime = Date.now() - 61000;
        speedMode.updateStatus();

        expect(speedMode.getWinner()).toBe('player1');
        const state = speedMode.getGameState() as any;
        expect(state.scores['player1']).toBe(4);
        expect(state.scores['player2']).toBe(2);

        mockExecute.mockRestore();
    });

    it('should correctly assign winner when player2 has higher score', () => {
        const mockExecute = jest.spyOn((speedMode as any).engine, 'executeShot').mockReturnValue({
            cueBallScratched: false,
            firstBallCollided: 1,
            pocketedBalls: [3, 4, 5],
            events: [],
            animationFrames: []
        });

        // Player1 pots 3 balls once = 3 points
        speedMode.handleShot('player1', 0, 10, 0, 0);

        // Player2 pots 3 balls twice = 6 points
        speedMode.handleShot('player2', 0, 10, 0, 0);
        speedMode.handleShot('player2', 0, 10, 0, 0);

        // End game
        (speedMode as any).gameStartTime = Date.now() - 61000;
        speedMode.updateStatus();

        expect(speedMode.getWinner()).toBe('player2');
        const state = speedMode.getGameState() as any;
        expect(state.scores['player1']).toBe(3);
        expect(state.scores['player2']).toBe(6);

        mockExecute.mockRestore();
    });

    it('should real-world scenario: player2 scratches after player1 has scored, player1 wins', () => {
        const mockExecute = jest.spyOn((speedMode as any).engine, 'executeShot');

        // First shot: Player1 scores
        mockExecute.mockReturnValueOnce({
            cueBallScratched: false,
            firstBallCollided: 1,
            pocketedBalls: [1, 2, 3],
            events: [],
            animationFrames: []
        });

        speedMode.handleShot('player1', 0, 10, 0, 0);
        let state = speedMode.getGameState() as any;
        expect(state.scores['player1']).toBe(3);
        expect(state.isGameOver).toBe(false);

        // Second shot: Player2 scratches
        mockExecute.mockReturnValueOnce({
            cueBallScratched: true,
            firstBallCollided: 1,
            pocketedBalls: [0], // Cue ball scratched
            events: [],
            animationFrames: []
        });

        speedMode.handleShot('player2', 0, 10, 0, 0);
        state = speedMode.getGameState() as any;

        expect(state.isGameOver).toBe(true);
        expect(state.winner).toBe('player1'); // Player1 wins because player2 scratched
        expect(state.scores['player1']).toBe(3);
        expect(state.scores['player2']).toBe(0);

        mockExecute.mockRestore();
    });
});

