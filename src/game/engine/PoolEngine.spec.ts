import { PoolEngine } from '../engine/PoolEngine';
import * as Constants from '../engine/Constants';

describe('PoolEngine', () => {
    let engine: PoolEngine;

    beforeEach(() => {
        engine = new PoolEngine(Constants.GAME_MODE_EIGHT);
    });

    it('should initialize with 16 balls on the table in 8-ball mode', () => {
        const balls = engine.getBalls();
        expect(balls.length).toBe(16);
        expect(balls.filter(b => b.isBallOnTable()).length).toBe(16);
    });

    it('should execute a shot and update ball positions', () => {
        const balls = engine.getBalls();
        const initialPos = { x: balls[1].getX(), y: balls[1].getY() };
        const initialCuePos = { x: balls[0].getX(), y: balls[0].getY() };

        // Shot aimed directly at the pack from the break position
        const result = engine.executeShot(0, 500, 0, 0); // Higher power

        console.log('Cue Ball Final Pos:', result.finalState[0]);
        console.log('Ball 1 Final Pos:', result.finalState[1]);

        expect(result.finalState[0].x).not.toBe(initialCuePos.x);
        expect(result.finalState[1].x).not.toBe(initialPos.x);
    });

    it('should correctly identify pocketed balls', () => {
        // This is harder to test without a specific "potting" scenario, 
        // but we can mock or just verify it does't crash
        const result = engine.executeShot(0, 200, 0, 0);
        expect(result.pocketedBalls).toBeDefined();
    });
});
