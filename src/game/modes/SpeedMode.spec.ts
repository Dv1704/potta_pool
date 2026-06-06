import { SpeedMode } from './SpeedMode';
import * as Constants from '../engine/Constants';

describe('SpeedMode', () => {
    let speedMode: SpeedMode;

    beforeEach(() => {
        speedMode = new SpeedMode(['player1', 'player2']);
        speedMode.startGame();
    });

    it('should initialize scores and streaks to 0', () => {
        const state = speedMode.getGameState() as any;
        expect(state.scores['player1']).toBe(0);
        expect(state.scores['player2']).toBe(0);
        expect(state.streaks['player1']).toBe(0);
        expect(state.streaks['player2']).toBe(0);
    });

    it('should apply speed bonus and streak bonus on pocketing a ball', () => {
        // Mock the engine to return pocketed balls but no scratch on next shot
        const mockExecute = jest.spyOn((speedMode as any).engine, 'executeShot').mockReturnValue({
            cueBallScratched: false,
            firstBallCollided: 1,
            pocketedBalls: [1],
            events: [],
            animationFrames: []
        });

        // Take a shot immediately (0 seconds elapsed)
        speedMode.handleShot('player1', 0, 10, 0, 0);

        const state = speedMode.getGameState() as any;
        // 100 base points for ball 1 + speed bonus of 150 points (elapsed ~0, so 15 * 10 = 150)
        expect(state.scores['player1']).toBeGreaterThanOrEqual(240); // 100 + speed bonus
        expect(state.streaks['player1']).toBe(1);
        expect(state.turn).toBe('player1'); // keeps turn because ball pocketed and no foul

        // Take a second shot immediately (streak = 2)
        speedMode.handleShot('player1', 0, 10, 0, 0);
        const state2 = speedMode.getGameState() as any;
        expect(state2.streaks['player1']).toBe(2);
        // Score should have added base (100) + speed bonus (~150) + streak bonus (50)
        expect(state2.scores['player1']).toBeGreaterThanOrEqual(540); // 240 + 100 + 150 + 50
        
        mockExecute.mockRestore();
    });

    it('should reset streak and apply penalty on foul', () => {
        // Mock a scratch foul
        const mockExecute = jest.spyOn((speedMode as any).engine, 'executeShot').mockReturnValue({
            cueBallScratched: true,
            firstBallCollided: 1,
            pocketedBalls: [],
            events: [],
            animationFrames: []
        });

        // Set player1 score to 100 first to test subtraction
        (speedMode as any).scores['player1'] = 100;
        (speedMode as any).streaks['player1'] = 3;

        speedMode.handleShot('player1', 0, 10, 0, 0);

        const state = speedMode.getGameState() as any;
        expect(state.scores['player1']).toBe(50); // 100 - 50 foul penalty
        expect(state.streaks['player1']).toBe(0); // streak reset
        expect(state.turn).toBe('player2'); // turn passes to player2

        mockExecute.mockRestore();
    });

    it('should handle shot timeout in updateStatus', () => {
        // Artificially expire the shot timer
        (speedMode as any).turnExpiration = Date.now() - 1000;
        (speedMode as any).scores['player1'] = 100;
        (speedMode as any).streaks['player1'] = 2;

        const hadChanges = speedMode.updateStatus();

        expect(hadChanges).toBe(true);
        const state = speedMode.getGameState() as any;
        expect(state.scores['player1']).toBe(50); // -50 penalty
        expect(state.streaks['player1']).toBe(0); // reset
        expect(state.turn).toBe('player2'); // turn passed
    });

    it('should handle overall clock expiration in updateStatus and declare winner', () => {
        // Set scores
        (speedMode as any).scores['player1'] = 500;
        (speedMode as any).scores['player2'] = 300;

        // Artificially expire the overall game clock (180s elapsed)
        (speedMode as any).gameStartTime = Date.now() - 185000;

        const hadChanges = speedMode.updateStatus();

        expect(hadChanges).toBe(true);
        expect(speedMode.isFinished()).toBe(true);
        expect(speedMode.getWinner()).toBe('player1');
    });
});
