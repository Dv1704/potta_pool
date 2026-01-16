import { Ball } from './Ball.js';
import { PhysicsController } from './PhysicsController.js';
import { Vector2 } from './Vector2.js';
import * as Constants from './Constants.js';

export interface ShotResult {
    pocketedBalls: number[];
    cueBallCollisionWithTable: boolean;
    firstBallCollided: number | null;
    cueBallScratched: boolean;
    finalState: { [key: number]: { x: number; y: number; onTable: boolean } };
    events: any[];
    animationFrames: { [key: number]: { x: number; y: number } }[];
}

export class PoolEngine {
    private _physics: PhysicsController;
    private _balls: Ball[] = [];
    private _mode: number;

    constructor(mode: number) {
        this._mode = mode;
        this._physics = new PhysicsController();
        this.initBalls();
    }

    private initBalls(): void {
        this._balls = [];
        for (let i = 0; i < 16; i++) {
            this._balls.push(new Ball(i));
        }
        this.resetRack();
    }

    public resetRack(): void {
        const rackPos = Constants.STARTING_RACK_POS[this._mode];

        // Cue ball
        this._balls[0].setPos(Constants.CUE_BALL_POS.x, Constants.CUE_BALL_POS.y);
        this._balls[0].setFlagOnTable(true);

        if (this._mode === Constants.GAME_MODE_EIGHT) {
            // 8-ball specific rack logic (simplified)
            for (let i = 1; i < 16; i++) {
                this._balls[i].setPos(rackPos[i - 1].x, rackPos[i - 1].y);
                this._balls[i].setFlagOnTable(true);
            }
        } else if (this._mode === Constants.GAME_MODE_NINE) {
            for (let i = 1; i <= 9; i++) {
                this._balls[i].setPos(rackPos[i - 1].x, rackPos[i - 1].y);
                this._balls[i].setFlagOnTable(true);
            }
            for (let i = 10; i < 16; i++) {
                this._balls[i].setFlagOnTable(false);
            }
        }
    }

    public executeShot(angle: number, power: number, sideSpin: number, backSpin: number): ShotResult {
        const cueBall = this._balls[0];
        if (!cueBall.isBallOnTable()) {
            // Logic for re-placing cue ball if it was scratched
            cueBall.setPos(Constants.CUE_BALL_POS.x, Constants.CUE_BALL_POS.y);
            cueBall.setFlagOnTable(true);
        }

        this._physics.resetEvents();

        const force = new Vector2(Math.cos(angle), Math.sin(angle));
        force.scalarProduct(power);
        cueBall.addForce(force);
        cueBall.setSideEffect(sideSpin);

        const pocketedBalls: number[] = [];
        let cueBallScratched = false;
        const animationFrames: { [key: number]: { x: number; y: number } }[] = [];

        // Simulation loop
        let frames = 0;
        const maxFrames = 6000; // 10 seconds at 60 FPS safety cap

        do {
            this._physics.update(this._balls);
            frames++;

            // Record Frame (Every 2 frames to save bandwidth, 30fps effective for network)
            if (frames % 2 === 0) {
                const frameData: { [key: number]: { x: number; y: number } } = {};
                let hasMovement = false;
                for (const ball of this._balls) {
                    if (ball.isBallOnTable() && (ball.getVelocity().length() > 0.01 || frames === 2)) {
                        frameData[ball.getNumber()] = { x: ball.getX(), y: ball.getY() };
                        hasMovement = true;
                    }
                }
                // Only push frames if something is moving (or it's the start)
                if (hasMovement) {
                    animationFrames.push(frameData);
                }
            }

            // Check for pocketed balls in this frame
            for (const ball of this._balls) {
                if (ball.getHole() && ball.isBallOnTable()) {
                    if (ball.getNumber() === 0) {
                        cueBallScratched = true;
                        ball.setFlagOnTable(false);
                    } else {
                        pocketedBalls.push(ball.getNumber());
                        ball.setFlagOnTable(false);
                    }
                }
            }
        } while (!this._physics.areBallsStopped() && frames < maxFrames);

        const finalState: { [key: number]: { x: number; y: number; onTable: boolean } } = {};
        for (const ball of this._balls) {
            finalState[ball.getNumber()] = {
                x: ball.getX(),
                y: ball.getY(),
                onTable: ball.isBallOnTable(),
            };
        }

        return {
            pocketedBalls,
            cueBallCollisionWithTable: this._physics.getEvents().some(e => e.type === 'edge_collision' && e.ballId === 0),
            firstBallCollided: this._physics.getFirstBallCollided(),
            cueBallScratched,
            finalState,
            events: this._physics.getEvents(),
            animationFrames
        };
    }

    public getBalls(): Ball[] {
        return this._balls;
    }
}
