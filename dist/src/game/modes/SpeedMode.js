import { GameMode } from './GameMode.js';
import * as Constants from '../engine/Constants.js';
export class SpeedMode extends GameMode {
    turnExpiration = 0;
    TIMEOUT_MS = 15000; // 15 seconds per shot
    FIRST_SHOT_TIMEOUT_MS = 120000; // 2 min buffer for loading
    firstShotTaken = false;
    // Speed Mode state fields
    gameStartTime = 0;
    turnStartTime = 0;
    GAME_DURATION_MS = 180000; // 180 seconds overall game clock
    scores = {};
    streaks = {};
    constructor(players) {
        super(players, Constants.GAME_MODE_NINE); // Using 9-ball rules for Speed Mode
        this.players.forEach(p => {
            this.scores[p] = 0;
            this.streaks[p] = 0;
        });
    }
    startGame() {
        this.isGameStarted = true;
        this.gameStartTime = Date.now();
        this.turnStartTime = Date.now();
        this.turnExpiration = Date.now() + this.FIRST_SHOT_TIMEOUT_MS;
    }
    resetTimer() {
        this.turnExpiration = Date.now() + this.TIMEOUT_MS;
        this.turnStartTime = Date.now();
    }
    handleShot(playerId, angle, power, sideSpin, backSpin, cueBallX, cueBallY) {
        if (this.isGameOver)
            throw new Error('Game is already over');
        if (!this.isGameStarted)
            throw new Error('Game has not started yet');
        if (playerId !== this.players[this.currentTurnIndex]) {
            throw new Error('Not your turn');
        }
        if (Date.now() > this.turnExpiration) {
            this.updateStatus();
            throw new Error('Turn timed out');
        }
        const elapsedSecs = (Date.now() - this.turnStartTime) / 1000;
        const result = this.engine.executeShot(angle, power, sideSpin, backSpin, cueBallX, cueBallY);
        // Switch to standard timeout after first shot
        if (!this.firstShotTaken) {
            this.firstShotTaken = true;
        }
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
        // 9-ball rules foul detection:
        // - Cue ball scratch (cueBallScratched)
        // - No ball hit (firstBallCollided === null)
        const isFoul = result.cueBallScratched || result.firstBallCollided === null;
        // Potted object balls (exclude cue ball)
        const pottedObjectBalls = result.pocketedBalls.filter(id => id !== 0);
        const numPocketed = pottedObjectBalls.length;
        const turnKept = numPocketed > 0 && !isFoul;
        if (isFoul) {
            // Foul penalty: -50 points
            this.scores[playerId] = Math.max(0, (this.scores[playerId] || 0) - 50);
            this.streaks[playerId] = 0;
        }
        else if (numPocketed > 0) {
            // Speed Mode scoring calculation:
            // 1. +100 points per pocketed object ball
            let pointsEarned = numPocketed * 100;
            // 2. Speed bonus: (15 - timeTaken) * 10
            const speedBonus = Math.max(0, Math.ceil((15 - elapsedSecs) * 10));
            pointsEarned += speedBonus;
            // 3. Combo/streak bonus for consecutive pots:
            // (+50 for double, +100 for triple, +200 for 4+ consecutive)
            this.streaks[playerId] = (this.streaks[playerId] || 0) + 1;
            const streak = this.streaks[playerId];
            if (streak === 2) {
                pointsEarned += 50;
            }
            else if (streak === 3) {
                pointsEarned += 100;
            }
            else if (streak >= 4) {
                pointsEarned += 200;
            }
            this.scores[playerId] = (this.scores[playerId] || 0) + pointsEarned;
        }
        else {
            // No pocketed balls and no foul, just reset streak
            this.streaks[playerId] = 0;
        }
        if (!turnKept) {
            this.currentTurnIndex = (this.currentTurnIndex + 1) % 2;
        }
        this.resetTimer();
        this.updateStatus();
        return result;
    }
    handleShotTimeout() {
        const currentId = this.players[this.currentTurnIndex];
        // Deduct 50 points for timeout foul
        this.scores[currentId] = Math.max(0, (this.scores[currentId] || 0) - 50);
        // Reset streak
        this.streaks[currentId] = 0;
        // Pass turn
        this.currentTurnIndex = (this.currentTurnIndex + 1) % 2;
        // Reset timer
        this.resetTimer();
    }
    handleGameEndByTime() {
        this.isGameOver = true;
        const p1 = this.players[0];
        const p2 = this.players[1];
        const score1 = this.scores[p1] || 0;
        const score2 = this.scores[p2] || 0;
        if (score1 > score2) {
            this.winner = p1;
        }
        else if (score2 > score1) {
            this.winner = p2;
        }
        else {
            // Tie-breaker: higher streak, otherwise player 1
            const streak1 = this.streaks[p1] || 0;
            const streak2 = this.streaks[p2] || 0;
            if (streak1 > streak2) {
                this.winner = p1;
            }
            else if (streak2 > streak1) {
                this.winner = p2;
            }
            else {
                this.winner = p1;
            }
        }
    }
    updateStatus() {
        if (!this.isGameStarted || this.isGameOver)
            return false;
        // 1. Check overall game clock expiration
        const elapsedGameTime = Date.now() - this.gameStartTime;
        if (elapsedGameTime >= this.GAME_DURATION_MS) {
            this.handleGameEndByTime();
            return true;
        }
        // 2. Check remaining balls (excluding cue ball)
        const balls = this.engine.getBalls();
        const remainingBalls = balls.filter(b => b.getNumber() !== 0 && b.isBallOnTable()).length;
        if (remainingBalls === 0) {
            this.handleGameEndByTime();
            return true;
        }
        // 3. Check shot timer expiration
        if (Date.now() > this.turnExpiration) {
            this.handleShotTimeout();
            return true;
        }
        return false;
    }
    getGameState() {
        const balls = this.engine.getBalls();
        const ballStates = {};
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
            turn: this.players[this.currentTurnIndex],
            isGameOver: this.isGameOver,
            winner: this.winner,
            timer: this.isGameStarted ? Math.max(0, Math.floor((this.turnExpiration - Date.now()) / 1000)) : 15,
            turnExpiration: this.turnExpiration,
            isGameStarted: this.isGameStarted,
            // Custom Speed Mode fields
            scores: this.scores,
            streaks: this.streaks,
            overallTimeRemaining: overallTimeRemaining
        };
    }
    serialize() {
        return {
            turnIndex: this.currentTurnIndex,
            turnExpiration: this.turnExpiration,
            isGameOver: this.isGameOver,
            isGameStarted: this.isGameStarted,
            winner: this.winner,
            firstShotTaken: this.firstShotTaken,
            balls: this.getGameState().balls,
            // Custom fields to serialize
            gameStartTime: this.gameStartTime,
            turnStartTime: this.turnStartTime,
            scores: this.scores,
            streaks: this.streaks
        };
    }
    hydrate(state) {
        this.currentTurnIndex = state.turnIndex;
        this.turnExpiration = state.turnExpiration;
        this.isGameOver = state.isGameOver;
        this.isGameStarted = state.isGameStarted;
        this.winner = state.winner;
        this.firstShotTaken = state.firstShotTaken ?? false;
        // Restore custom fields
        this.gameStartTime = state.gameStartTime || Date.now();
        this.turnStartTime = state.turnStartTime || Date.now();
        this.scores = state.scores || {};
        this.streaks = state.streaks || {};
        const balls = this.getBalls();
        for (const ball of balls) {
            const bState = state.balls[ball.getNumber()];
            if (bState) {
                ball.setPos((bState.x / 100) * Constants.CANVAS_WIDTH, (bState.y / 100) * Constants.CANVAS_HEIGHT);
                ball.setFlagOnTable(bState.onTable);
            }
        }
    }
}
