import { GameMode, GameState } from './GameMode';
import { ShotResult } from '../engine/PoolEngine';
import * as Constants from '../engine/Constants';

export class SpeedMode extends GameMode {
    private turnExpiration: number = 0;
    private readonly TIMEOUT_MS = 60000;

    constructor(players: string[]) {
        super(players, Constants.GAME_MODE_NINE); // Using 9-ball for speed mode as a default
        this.resetTimer();
    }

    private resetTimer() {
        this.turnExpiration = Date.now() + this.TIMEOUT_MS;
    }

    handleShot(playerId: string, angle: number, power: number, sideSpin: number, backSpin: number): ShotResult {
        if (this.isGameOver) throw new Error('Game is already over');
        if (playerId !== this.players[this.currentTurnIndex]) {
            throw new Error('Not your turn');
        }

        if (Date.now() > this.turnExpiration) {
            this.handleTimeout();
            throw new Error('Turn timed out');
        }

        const result = this.engine.executeShot(angle, power, sideSpin, backSpin);

        // In Speed mode, we just alternate turns if no special rule applies?
        // Usually speed mode is "clear all balls as fast as possible" or just fast-paced PvP.
        // The requirement says "60-second timer per player (server-enforced)".

        this.currentTurnIndex = (this.currentTurnIndex + 1) % 2;
        this.resetTimer();
        this.updateStatus();

        return result;
    }

    private handleTimeout() {
        this.isGameOver = true;
        this.winner = this.players[(this.currentTurnIndex + 1) % 2];
    }

    updateStatus(): void {
        // Check if timeout has occurred if no shot was taken
        if (!this.isGameOver && Date.now() > this.turnExpiration) {
            this.handleTimeout();
        }

        // Check if all balls (except cue) are cleared
        const balls = this.engine.getBalls();
        const remainingBalls = balls.filter(b => b.getNumber() !== 0 && b.isBallOnTable()).length;

        if (remainingBalls === 0) {
            this.isGameOver = true;
            this.winner = this.players[this.currentTurnIndex]; // Last player to pot wins? Or based on points?
            // For now, let's say last player to pot wins if all cleared.
        }
    }

    getGameState(): GameState {
        const balls = this.engine.getBalls();
        const ballStates: any = {};
        balls.forEach(b => {
            ballStates[b.getNumber()] = {
                x: b.getX(),
                y: b.getY(),
                onTable: b.isBallOnTable()
            };
        });

        return {
            balls: ballStates,
            turn: this.players[this.currentTurnIndex],
            isGameOver: this.isGameOver,
            winner: this.winner,
            timer: Math.max(0, Math.floor((this.turnExpiration - Date.now()) / 1000))
        };
    }
}
