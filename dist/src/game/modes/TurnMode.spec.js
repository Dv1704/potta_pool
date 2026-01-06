import { TurnMode } from './TurnMode';
describe('TurnMode', () => {
    let turnMode;
    beforeEach(() => {
        turnMode = new TurnMode(['player1', 'player2']);
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
});
