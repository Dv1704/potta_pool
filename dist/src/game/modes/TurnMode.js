import { GameMode } from './GameMode.js';
import * as Constants from '../engine/Constants.js';
var BallGroup;
(function (BallGroup) {
    BallGroup["SOLIDS"] = "solids";
    BallGroup["STRIPES"] = "stripes";
    BallGroup["NONE"] = "none";
})(BallGroup || (BallGroup = {}));
export class TurnMode extends GameMode {
    playerGroups = {};
    groupAssigned = false;
    foulOccurred = false;
    constructor(players) {
        super(players, Constants.GAME_MODE_EIGHT);
        this.players.forEach(id => this.playerGroups[id] = BallGroup.NONE);
    }
    handleShot(playerId, angle, power, sideSpin, backSpin) {
        if (this.isGameOver)
            throw new Error('Game is already over');
        if (playerId !== this.players[this.currentTurnIndex]) {
            throw new Error('Not your turn');
        }
        this.foulOccurred = false;
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
        this.processTurnResult(playerId, result);
        if (result.pocketedBalls.length === 0 || this.foulOccurred) {
            this.currentTurnIndex = (this.currentTurnIndex + 1) % 2;
        }
        this.updateStatus();
        return result;
    }
    processTurnResult(playerId, result) {
        const playerGroup = this.playerGroups[playerId];
        if (result.cueBallScratched)
            this.foulOccurred = true;
        if (result.firstBallCollided === null)
            this.foulOccurred = true;
        if (this.groupAssigned && result.firstBallCollided !== null) {
            const firstHit = result.firstBallCollided;
            const is8Ball = firstHit === 8;
            let isCorrectGroup = false;
            if (playerGroup === BallGroup.SOLIDS) {
                isCorrectGroup = firstHit >= 1 && firstHit <= 7;
            }
            else if (playerGroup === BallGroup.STRIPES) {
                isCorrectGroup = firstHit >= 9 && firstHit <= 15;
            }
            const remainingInGroup = this.getRemainingBallsInGroup(playerGroup);
            if (remainingInGroup === 0 && is8Ball)
                isCorrectGroup = true;
            if (!isCorrectGroup)
                this.foulOccurred = true;
        }
        const railHit = result.events.some(e => e.type === 'edge_collision');
        if (!railHit && result.pocketedBalls.length === 0)
            this.foulOccurred = true;
        if (!this.foulOccurred && !this.groupAssigned && result.pocketedBalls.length > 0) {
            const firstPotted = result.pocketedBalls[0];
            if (firstPotted >= 1 && firstPotted <= 7) {
                this.assignGroups(playerId, BallGroup.SOLIDS);
            }
            else if (firstPotted >= 9 && firstPotted <= 15) {
                this.assignGroups(playerId, BallGroup.STRIPES);
            }
        }
        if (result.pocketedBalls.includes(8))
            this.handleEightBallPocketed(playerId);
    }
    getRemainingBallsInGroup(group) {
        return this.engine.getBalls().filter(b => {
            if (!b.isBallOnTable())
                return false;
            const num = b.getNumber();
            if (group === BallGroup.SOLIDS)
                return num >= 1 && num <= 7;
            if (group === BallGroup.STRIPES)
                return num >= 9 && num <= 15;
            return false;
        }).length;
    }
    assignGroups(playerId, group) {
        this.groupAssigned = true;
        const opponentId = this.players.find(id => id !== playerId);
        this.playerGroups[playerId] = group;
        this.playerGroups[opponentId] = group === BallGroup.SOLIDS ? BallGroup.STRIPES : BallGroup.SOLIDS;
    }
    handleEightBallPocketed(playerId) {
        this.isGameOver = true;
        const group = this.playerGroups[playerId];
        if (this.getRemainingBallsInGroup(group) === 0 && !this.foulOccurred) {
            this.winner = playerId;
        }
        else {
            this.winner = this.players.find(id => id !== playerId);
        }
    }
    updateStatus() { }
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
            winner: this.winner
        };
    }
    serialize() {
        return {
            turnIndex: this.currentTurnIndex,
            isGameOver: this.isGameOver,
            winner: this.winner,
            playerGroups: this.playerGroups,
            groupAssigned: this.groupAssigned,
            foulOccurred: this.foulOccurred,
            balls: this.getGameState().balls
        };
    }
    hydrate(state) {
        this.currentTurnIndex = state.turnIndex;
        this.isGameOver = state.isGameOver;
        this.winner = state.winner;
        this.playerGroups = state.playerGroups;
        this.groupAssigned = state.groupAssigned;
        this.foulOccurred = state.foulOccurred;
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
