import { TurnMode } from './TurnMode';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

describe('TurnMode', () => {
    let turnMode: TurnMode;

    beforeEach(() => {
        turnMode = new TurnMode(['player1', 'player2']);
        turnMode.startGame();
    });

    it('should switch turn on no-hit foul', () => {
        turnMode.handleShot('player1', 0, 0, 0, 0);
        const state = turnMode.getGameState();
        expect(state.turn).toBe('player2');
    });

    it('should assign groups on first ball pocketed', () => {
        const mockExecute = jest.spyOn((turnMode as any).engine, 'executeShot').mockReturnValue({
            cueBallScratched: false,
            firstBallCollided: 1,
            pocketedBalls: [1],
            events: [],
            animationFrames: []
        });

        turnMode.handleShot('player1', 0, 10, 0, 0);
        const state = turnMode.getGameState() as any;

        expect(state.groupAssigned).toBe(true);
        expect(['player1', 'player2']).toContain(state.turn);

        mockExecute.mockRestore();
    });

    it('should switch turn on scratch (cue ball in hole)', () => {
        // Simulate a shot that scratches the cue ball.
        // This should create a foul and pass the turn.
        const result = turnMode.handleShot('player1', 180, 100, 0, 0);
        const state = turnMode.getGameState() as any;
        if (result.cueBallScratched) {
            expect(state.foulOccurred).toBe(true);
            expect(state.turn).toBe('player2');
        } else {
            expect(state.turn).not.toBe('player1');
        }
    });

    it('should validate break shot rules (illegal vs legal break)', () => {
        const weakResult = turnMode.handleShot('player1', 0, 5, 0, 0);
        const weakState = turnMode.getGameState();
        expect(weakState.turn).toBe('player2');

        const cleanTurnMode = new TurnMode(['player1', 'player2']);
        cleanTurnMode.startGame();
        const strongResult = cleanTurnMode.handleShot('player1', 0, 500, 0, 0);
        const objectBallsPotted = strongResult.pocketedBalls.filter((id: number) => id !== 0);
        const uniqueObjectBallsHittingRail = new Set<number>();
        strongResult.events.forEach((e: any) => {
            if (e.type === 'edge_collision' && e.ballId >= 1 && e.ballId <= 15) {
                uniqueObjectBallsHittingRail.add(e.ballId);
            }
        });

        const isLegal = uniqueObjectBallsHittingRail.size >= 4 || objectBallsPotted.length > 0;
        const cleanState = cleanTurnMode.getGameState();

        if (isLegal) {
            if (objectBallsPotted.length > 0) {
                expect(cleanState.turn).toBe('player1');
            } else {
                expect(cleanState.turn).toBe('player2');
            }
        } else {
            expect(cleanState.turn).toBe('player2');
        }
    });

    it('should prevent shooting when it is not the player\'s turn (Turn Lock)', () => {
        const state = turnMode.getGameState();
        expect(state.turn).toBe('player1');
        expect(() => {
            turnMode.handleShot('player2', 0, 100, 0, 0);
        }).toThrow('Not your turn');
    });

    it('should switch turns when the turn timer expires (Timer Expiry)', () => {
        const stateBefore = turnMode.getGameState();
        expect(stateBefore.turn).toBe('player1');

        const realDateNow = Date.now;
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
        const result = turnMode.handleShot('player1', 135, 200, 0, 0, 7.42, 11.04);

        expect(result.cueBallScratched).toBe(true);
        const state = turnMode.getGameState() as any;
        expect(state.foulOccurred).toBe(true);
        expect(state.turn).toBe('player2');
    });

    it('should end the game properly when the 8-ball drops (8-ball win condition)', () => {
        const balls = turnMode.getBalls();
        for (let i = 1; i <= 7; i++) {
            balls[i].setFlagOnTable(false);
        }

        (turnMode as any).playerGroups['player1'] = 'solids';
        (turnMode as any).playerGroups['player2'] = 'stripes';
        (turnMode as any).groupAssigned = true;
        (turnMode as any).isBreakShot = false;

        balls[8].setPos(95, 85);
        turnMode.handleShot('player1', 0, 10, 0, 0);

        const state = turnMode.getGameState();
        expect(state.isGameOver).toBe(true);
        expect(state.winner).toBe('player2');
    });
});
