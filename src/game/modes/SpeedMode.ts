import { GameMode, GameState } from './GameMode.js';
import { ShotResult } from '../engine/PoolEngine.js';
import * as Constants from '../engine/Constants.js';

export class SpeedMode extends GameMode {
    private gameStartTime: number = 0;
    private readonly GAME_DURATION_MS = 60000; // 60 seconds overall game clock
    private scores: { [playerId: string]: number } = {};
    private streaks: { [playerId: string]: number } = {};

    constructor(players: string[]) {
        super(players, Constants.GAME_MODE_NINE); // Using 9-ball rules for Speed Mode
        this.players.forEach(p => {
            this.scores[p] = 0;
            this.streaks[p] = 0;
        });
    }

    startGame() {
        this.isGameStarted = true;
        this.gameStartTime = Date.now();
    }

    handleShot(playerId: string, angle: number, power: number, sideSpin: number, backSpin: number, cueBallX?: number, cueBallY?: number): ShotResult {
        if (this.isGameOver) throw new Error('Game is already over');
        if (!this.isGameStarted) throw new Error('Game has not started yet');

        const result = this.engine.executeShot(angle, power, sideSpin, backSpin, cueBallX, cueBallY);

        // Convert animation frames back to percentages for frontend (0-100%)
        result.animationFrames = result.animationFrames.map(frame => {
            const converted: any = {};
            for (const [ballId, pos] of Object.entries(frame)) {
                converted[ballId] = {
                    x: ((pos as any).x / Constants.CANVAS_WIDTH) * 100,
                    y: ((pos as any).y / Constants.CANVAS_HEIGHT) * 100
                };
            }
            return converted;
        });

        // Cue ball scratch = immediate foul, player loses
        if (result.cueBallScratched) {
            this.isGameOver = true;
            this.streaks[playerId] = 0;
            const opponent = this.players.find(p => p !== playerId);
            this.winner = opponent || '';
            return result;
        }

        // 9-ball rules foul detection:
        // - No ball hit (firstBallCollided === null)
        const isFoul = result.firstBallCollided === null;
        const pottedObjectBalls = result.pocketedBalls.filter(id => id !== 0);
        const numPocketed = pottedObjectBalls.length;

        if (!isFoul && numPocketed > 0) {
            this.scores[playerId] = (this.scores[playerId] || 0) + numPocketed;
            this.streaks[playerId] = (this.streaks[playerId] || 0) + 1;
        } else if (isFoul) {
            this.streaks[playerId] = 0;
        }

        this.updateStatus();
        return result;
    }

    private handleGameEndByTime() {
        this.isGameOver = true;
        const p1 = this.players[0];
        const p2 = this.players[1];
        const score1 = this.scores[p1] || 0;
        const score2 = this.scores[p2] || 0;

        if (score1 > score2) {
            this.winner = p1;
        } else if (score2 > score1) {
            this.winner = p2;
        } else {
            const streak1 = this.streaks[p1] || 0;
            const streak2 = this.streaks[p2] || 0;
            if (streak1 > streak2) {
                this.winner = p1;
            } else if (streak2 > streak1) {
                this.winner = p2;
            } else {
                this.winner = p1;
            }
        }
    }

    updateStatus(): boolean {
        if (!this.isGameStarted || this.isGameOver) return false;

        const elapsedGameTime = Date.now() - this.gameStartTime;
        if (elapsedGameTime >= this.GAME_DURATION_MS) {
            this.handleGameEndByTime();
            return true;
        }

        const balls = this.engine.getBalls();
        const remainingBalls = balls.filter(b => b.getNumber() !== 0 && b.isBallOnTable()).length;

        if (remainingBalls === 0) {
            this.handleGameEndByTime();
            return true;
        }

        return false;
    }

    getGameState(): GameState {
        const balls = this.engine.getBalls();
        const ballStates: any = {};
        balls.forEach(b => {
            ballStates[b.getNumber()] = {
                x: (b.getX() / Constants.CANVAS_WIDTH) * 100,
                y: (b.getY() / Constants.CANVAS_HEIGHT) * 100,
                onTable: b.isBallOnTable()
            };
        });

        const elapsedGameTime = this.isGameStarted ? Date.now() - this.gameStartTime : 0;
        const overallTimeRemaining = Math.max(0, Math.ceil((this.GAME_DURATION_MS - elapsedGameTime) / 1000));

        return {
            balls: ballStates,
            isGameOver: this.isGameOver,
            winner: this.winner,
            isGameStarted: this.isGameStarted,
            scores: this.scores,
            streaks: this.streaks,
            overallTimeRemaining: overallTimeRemaining
        } as any;
    }

    serialize(): any {
        return {
            turnIndex: this.currentTurnIndex,
            isGameOver: this.isGameOver,
            isGameStarted: this.isGameStarted,
            winner: this.winner,
            balls: this.getGameState().balls,
            gameStartTime: this.gameStartTime,
            scores: this.scores,
            streaks: this.streaks
        };
    }

    hydrate(state: any): void {
        this.currentTurnIndex = state.turnIndex;
        this.isGameOver = state.isGameOver;
        this.isGameStarted = state.isGameStarted;
        this.winner = state.winner;
        this.gameStartTime = state.gameStartTime || Date.now();
        this.scores = state.scores || {};
        this.streaks = state.streaks || {};

        const balls = this.getBalls();
        for (const ball of balls) {
            const bState = state.balls[ball.getNumber()];
            if (bState) {
                ball.setPos(
                    (bState.x / 100) * Constants.CANVAS_WIDTH,
                    (bState.y / 100) * Constants.CANVAS_HEIGHT
                );
                ball.setFlagOnTable(bState.onTable);
            }
        }
    }
}
