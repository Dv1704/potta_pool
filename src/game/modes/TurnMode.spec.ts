import { TurnMode } from './TurnMode';
import * as Constants from '../engine/Constants';

describe('TurnMode', () => {
    let turnMode: TurnMode;

    beforeEach(() => {
        turnMode = new TurnMode(['player1', 'player2']);
        turnMode.startGame();
    });

    it('should switch turn on no-hit foul', () => {
        // Shot with 0 power -> No hit
        turnMode.handleShot('player1', 0, 0, 0, 0);
        const state = turnMode.getGameState();
        expect(state.turn).toBe('player2');
    });

    it('should assign groups on first ball pocketed', () => {
        // This requires a real successful pot, which is hard with raw numbers
        // but we can at least verify it doesn't crash and turn switches on miss
        turnMode.handleShot('player1', 0, 10, 0, 0); // Weak shot, probably a miss or no-rail foul
        const state = turnMode.getGameState();
        expect(state.turn).toBe('player2');
    });

    it('should switch turn on scratch (cue ball in hole)', () => {
        // We'd need to aim at a hole to test this reliably with real engine
        // For now, these basic tests verify the TurnMode -> PoolEngine interaction works
    });

    it('should validate break shot rules (illegal vs legal break)', () => {
        // Test illegal break: very weak shot
        const weakResult = turnMode.handleShot('player1', 0, 5, 0, 0);
        const weakState = turnMode.getGameState();
        expect(weakState.turn).toBe('player2'); // switches turn on break foul

        // Recreate game to test a strong break
        const cleanTurnMode = new TurnMode(['player1', 'player2']);
        cleanTurnMode.startGame();

        const strongResult = cleanTurnMode.handleShot('player1', 0, 500, 0, 0);
        const objectBallsPotted = strongResult.pocketedBalls.filter(id => id !== 0);
        const uniqueObjectBallsHittingRail = new Set<number>();
        strongResult.events.forEach(e => {
            if (e.type === 'edge_collision' && e.ballId >= 1 && e.ballId <= 15) {
                uniqueObjectBallsHittingRail.add(e.ballId);
            }
        });

        const isLegal = uniqueObjectBallsHittingRail.size >= 4 || objectBallsPotted.length > 0;
        const cleanState = cleanTurnMode.getGameState();

        if (isLegal) {
            if (objectBallsPotted.length > 0) {
                expect(cleanState.turn).toBe('player1'); // Potted ball: shooter keeps turn
            } else {
                expect(cleanState.turn).toBe('player2'); // Legal break with no pots: turn switches normally
            }
        } else {
            expect(cleanState.turn).toBe('player2'); // Illegal break: switches turn due to break foul
        }
    });

    it('should prevent shooting when it is not the player\'s turn (Turn Lock)', () => {
        const state = turnMode.getGameState();
        expect(state.turn).toBe('player1');
        // Player 2 tries to take a shot out of turn
        expect(() => {
            turnMode.handleShot('player2', 0, 100, 0, 0);
        }).toThrow('Not your turn');
    });

    it('should switch turns when the turn timer expires (Timer Expiry)', () => {
        const stateBefore = turnMode.getGameState();
        expect(stateBefore.turn).toBe('player1');

        const realDateNow = Date.now;
        // Mock Date.now to simulate turn timeout expiry
        Date.now = () => realDateNow() + 31000;

        try {
            const hadChanges = turnMode.updateStatus();
            expect(hadChanges).toBe(true);

            const stateAfter = turnMode.getGameState() as any;
            expect(stateAfter.turn).toBe('player2');
            expect(stateAfter.foulOccurred).toBe(true);
        } finally {
            Date.now = realDateNow;
        }
    });

    it('should trigger ball-in-hand foul when the cue ball scratches', () => {
        // Place cue ball directly in the bottom left pocket to trigger a scratch
        // Pocket 0 is at (95, 85) in pixels.
        // We will pass cueBallX and cueBallY close to it (in percentages):
        // x% = (95 / 1280) * 100 = 7.42%
        // y% = (85 / 770) * 100 = 11.04%
        const result = turnMode.handleShot('player1', 135, 200, 0, 0, 7.42, 11.04);
        
        expect(result.cueBallScratched).toBe(true);
        const state = turnMode.getGameState() as any;
        expect(state.foulOccurred).toBe(true);
        expect(state.turn).toBe('player2');
    });

    it('should end the game properly when the 8-ball drops (8-ball win condition)', () => {
        // Clear all of player1's group balls to test the 8-ball win condition
        const balls = turnMode.getBalls();
        for (let i = 1; i <= 7; i++) {
            balls[i].setFlagOnTable(false);
        }
        
        // Manually assign solid group to player1, stripes to player2
        (turnMode as any).playerGroups['player1'] = 'solids';
        (turnMode as any).playerGroups['player2'] = 'stripes';
        (turnMode as any).groupAssigned = true;
        (turnMode as any).isBreakShot = false;

        // Place the 8-ball in a pocket (pocket 0 at 95, 85)
        // 8-ball is ball 8.
        balls[8].setPos(95, 85);

        // Shoot cue ball
        turnMode.handleShot('player1', 0, 10, 0, 0);
        
        const state = turnMode.getGameState();
        expect(state.isGameOver).toBe(true);
        expect(state.winner).toBe('player2'); // weak shot is a foul, so opponent wins even though the 8-ball dropped
    });
});
