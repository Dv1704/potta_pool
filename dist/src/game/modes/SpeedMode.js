import { GameMode } from './GameMode.js';
import * as Constants from '../engine/Constants.js';
export class SpeedMode extends GameMode {
    turnExpiration = 0;
    TIMEOUT_MS = 60000;
    constructor(players) {
        super(players, Constants.GAME_MODE_NINE); // Using 9-ball for speed mode as a default
        this.resetTimer();
    }
    resetTimer() {
        this.turnExpiration = Date.now() + this.TIMEOUT_MS;
    }
    handleShot(playerId, angle, power, sideSpin, backSpin) {
        if (this.isGameOver)
            throw new Error('Game is already over');
        if (playerId !== this.players[this.currentTurnIndex]) {
            throw new Error('Not your turn');
        }
        if (Date.now() > this.turnExpiration) {
            this.handleTimeout();
            throw new Error('Turn timed out');
        }
        // Use 30x power scaling for realistic feel (matches demo)
        const result = this.engine.executeShot(angle, power * 30, sideSpin, backSpin);
        // Convert animation frames back to percentages for frontend (0-100%)
        result.animationFrames = result.animationFrames.map(frame => {
            const converted = {};
            for (const [ballId, pos] of Object.entries(frame)) {
                converted[ballId] = {
                    x: (pos.x / Constants.CANVAS_WIDTH) * 100,
                    y: (pos.y / Constants.CANVAS_HEIGHT) * 100
                };
            }
            return converted;
        });
        // Keep turn if balls were pocketed and no foul (scratch) occurred
        // Simplified rule: Any pocket + No Scratch = Keep Turn
        const turnKept = result.pocketedBalls.length > 0 && !result.cueBallScratched && result.firstBallCollided !== null;
        if (!turnKept) {
            this.currentTurnIndex = (this.currentTurnIndex + 1) % 2;
        }
        this.resetTimer();
        this.updateStatus();
        return result;
    }
    handleTimeout() {
        this.isGameOver = true;
        this.winner = this.players[(this.currentTurnIndex + 1) % 2];
    }
    updateStatus() {
        if (!this.isGameOver && Date.now() > this.turnExpiration) {
            this.handleTimeout();
        }
        const balls = this.engine.getBalls();
        const remainingBalls = balls.filter(b => b.getNumber() !== 0 && b.isBallOnTable()).length;
        if (remainingBalls === 0) {
            this.isGameOver = true;
            this.winner = this.players[this.currentTurnIndex];
        }
    }
    getGameState() {
        const balls = this.engine.getBalls();
        const ballStates = {};
        balls.forEach(b => {
            ballStates[b.getNumber()] = {
                // Convert pixels to percentages (0-100%)
                x: (b.getX() / Constants.CANVAS_WIDTH) * 100,
                y: (b.getY() / Constants.CANVAS_HEIGHT) * 100,
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
    serialize() {
        return {
            turnIndex: this.currentTurnIndex,
            turnExpiration: this.turnExpiration,
            isGameOver: this.isGameOver,
            winner: this.winner,
            balls: this.getGameState().balls
        };
    }
    hydrate(state) {
        this.currentTurnIndex = state.turnIndex;
        this.turnExpiration = state.turnExpiration;
        this.isGameOver = state.isGameOver;
        this.winner = state.winner;
        const balls = this.getBalls();
        for (const ball of balls) {
            const bState = state.balls[ball.getNumber()];
            if (bState) {
                ball.setPos(bState.x, bState.y);
                ball.setFlagOnTable(bState.onTable);
            }
        }
    }
}
