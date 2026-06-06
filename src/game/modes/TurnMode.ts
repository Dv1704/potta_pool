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
    private turnExpiration: number = 0;
    private readonly SHOT_TIMEOUT_MS = 30000;
    private isBreakShot: boolean = true;

    constructor(players: string[]) {
        super(players, Constants.GAME_MODE_EIGHT);
        this.players.forEach(id => this.playerGroups[id] = BallGroup.NONE);
        // Timer does NOT start here.
    }

    startGame() {
        this.isGameStarted = true;
        this.resetTimer();
    }

    private resetTimer() {
        this.turnExpiration = Date.now() + this.SHOT_TIMEOUT_MS;
    }

    handleShot(playerId: string, angle: number, power: number, sideSpin: number, backSpin: number, cueBallX?: number, cueBallY?: number): ShotResult {
        if (this.isGameOver) throw new Error('Game is already over');
        if (!this.isGameStarted) throw new Error('Game has not started yet');

        if (playerId !== this.players[this.currentTurnIndex]) {
            throw new Error('Not your turn');
        }

        if (Date.now() > this.turnExpiration) {
            this.updateStatus();
            throw new Error('Turn timed out');
        }

        this.foulOccurred = false;
        // Use 1.0x power scaling (matches frontend)
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

        this.processTurnResult(playerId, result);

        if (result.pocketedBalls.length === 0 || this.foulOccurred) {
            this.currentTurnIndex = (this.currentTurnIndex + 1) % 2;
        }

        this.resetTimer();
        this.updateStatus();
        return result;
    }

    private processTurnResult(playerId: string, result: ShotResult) {
        const playerGroup = this.playerGroups[playerId];
        if (result.cueBallScratched) this.foulOccurred = true;

        if (this.isBreakShot) {
            // For the break shot, at least 4 object balls (1-15) must hit cushions (rails)
            // or at least one object ball must be pocketed.
            const objectBallsPotted = result.pocketedBalls.filter(id => id !== 0);
            
            const uniqueObjectBallsHittingRail = new Set<number>();
            result.events.forEach(e => {
                if (e.type === 'edge_collision' && e.ballId >= 1 && e.ballId <= 15) {
                    uniqueObjectBallsHittingRail.add(e.ballId);
                }
            });

            const hasScatter = uniqueObjectBallsHittingRail.size >= 4 || objectBallsPotted.length > 0;
            if (!hasScatter) {
                console.log(`[TurnMode] Foul: Illegal break shot. Cushion hits: ${uniqueObjectBallsHittingRail.size}, pocketed: ${objectBallsPotted.length}`);
                this.foulOccurred = true;
            }
            this.isBreakShot = false; // Next shot is not a break shot
        } else {
            // Normal shot foul rules
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
        }

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

    updateStatus(): boolean {
        if (!this.isGameStarted || this.isGameOver) return false;

        if (Date.now() > this.turnExpiration) {
            this.foulOccurred = true;
            this.currentTurnIndex = (this.currentTurnIndex + 1) % 2;
            this.resetTimer();
            return true;
        }
        return false;
    }

    getGameState(): GameState {
        const balls = this.engine.getBalls();
        const ballStates: any = {};
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
            timer: this.isGameStarted ? Math.max(0, Math.ceil((this.turnExpiration - Date.now()) / 1000)) : 30,
            turnExpiration: this.turnExpiration,
            isGameStarted: this.isGameStarted,
            // Custom Turn Mode fields
            foulOccurred: this.foulOccurred,
            playerGroups: this.playerGroups,
            groupAssigned: this.groupAssigned
        } as any;
    }

    serialize(): any {
        return {
            turnIndex: this.currentTurnIndex,
            turnExpiration: this.turnExpiration,
            isGameOver: this.isGameOver,
            isGameStarted: this.isGameStarted,
            winner: this.winner,
            playerGroups: this.playerGroups,
            groupAssigned: this.groupAssigned,
            foulOccurred: this.foulOccurred,
            isBreakShot: this.isBreakShot,
            balls: this.getGameState().balls
        };
    }

    hydrate(state: any): void {
        this.currentTurnIndex = state.turnIndex;
        this.turnExpiration = state.turnExpiration || 0;
        this.isGameOver = state.isGameOver;
        this.isGameStarted = state.isGameStarted;
        this.winner = state.winner;
        this.playerGroups = state.playerGroups;
        this.groupAssigned = state.groupAssigned;
        this.foulOccurred = state.foulOccurred;
        this.isBreakShot = state.isBreakShot !== undefined ? state.isBreakShot : true;

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
