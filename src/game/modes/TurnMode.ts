import { GameMode, GameState } from './GameMode.js';
import { ShotResult } from '../engine/PoolEngine.js';
import * as Constants from '../engine/Constants.js';

enum BallGroup {
    SOLIDS = 'solids',
    STRIPES = 'stripes',
    NONE = 'none'
}

export class TurnMode extends GameMode {
    private playerGroups: { [playerId: string]: BallGroup } = {};
    private groupAssigned: boolean = false;
    private foulOccurred: boolean = false;

    constructor(players: string[]) {
        super(players, Constants.GAME_MODE_EIGHT);
        this.players.forEach(id => this.playerGroups[id] = BallGroup.NONE);
    }

    handleShot(playerId: string, angle: number, power: number, sideSpin: number, backSpin: number): ShotResult {
        if (this.isGameOver) throw new Error('Game is already over');
        if (playerId !== this.players[this.currentTurnIndex]) {
            throw new Error('Not your turn');
        }

        this.foulOccurred = false;
        const result = this.engine.executeShot(angle, power, sideSpin, backSpin);

        this.processTurnResult(playerId, result);

        if (result.pocketedBalls.length === 0 || this.foulOccurred) {
            this.currentTurnIndex = (this.currentTurnIndex + 1) % 2;
        }

        this.updateStatus();
        return result;
    }

    private processTurnResult(playerId: string, result: ShotResult) {
        const playerGroup = this.playerGroups[playerId];
        if (result.cueBallScratched) this.foulOccurred = true;
        if (result.firstBallCollided === null) this.foulOccurred = true;

        if (this.groupAssigned && result.firstBallCollided !== null) {
            const firstHit = result.firstBallCollided;
            const is8Ball = firstHit === 8;
            let isCorrectGroup = false;

            if (playerGroup === BallGroup.SOLIDS) {
                isCorrectGroup = firstHit >= 1 && firstHit <= 7;
            } else if (playerGroup === BallGroup.STRIPES) {
                isCorrectGroup = firstHit >= 9 && firstHit <= 15;
            }

            const remainingInGroup = this.getRemainingBallsInGroup(playerGroup);
            if (remainingInGroup === 0 && is8Ball) isCorrectGroup = true;
            if (!isCorrectGroup) this.foulOccurred = true;
        }

        const railHit = result.events.some(e => e.type === 'edge_collision');
        if (!railHit && result.pocketedBalls.length === 0) this.foulOccurred = true;

        if (!this.foulOccurred && !this.groupAssigned && result.pocketedBalls.length > 0) {
            const firstPotted = result.pocketedBalls[0];
            if (firstPotted >= 1 && firstPotted <= 7) {
                this.assignGroups(playerId, BallGroup.SOLIDS);
            } else if (firstPotted >= 9 && firstPotted <= 15) {
                this.assignGroups(playerId, BallGroup.STRIPES);
            }
        }

        if (result.pocketedBalls.includes(8)) this.handleEightBallPocketed(playerId);
    }

    private getRemainingBallsInGroup(group: BallGroup): number {
        return this.engine.getBalls().filter(b => {
            if (!b.isBallOnTable()) return false;
            const num = b.getNumber();
            if (group === BallGroup.SOLIDS) return num >= 1 && num <= 7;
            if (group === BallGroup.STRIPES) return num >= 9 && num <= 15;
            return false;
        }).length;
    }

    private assignGroups(playerId: string, group: BallGroup) {
        this.groupAssigned = true;
        const opponentId = this.players.find(id => id !== playerId)!;
        this.playerGroups[playerId] = group;
        this.playerGroups[opponentId] = group === BallGroup.SOLIDS ? BallGroup.STRIPES : BallGroup.SOLIDS;
    }

    private handleEightBallPocketed(playerId: string) {
        this.isGameOver = true;
        const group = this.playerGroups[playerId];
        if (this.getRemainingBallsInGroup(group) === 0 && !this.foulOccurred) {
            this.winner = playerId;
        } else {
            this.winner = this.players.find(id => id !== playerId)!;
        }
    }

    updateStatus(): void { }

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
            winner: this.winner
        };
    }

    serialize(): any {
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

    hydrate(state: any): void {
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
