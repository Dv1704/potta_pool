import { Ball } from './Ball.js';
import { PhysicsController } from './PhysicsController.js';
import { Vector2 } from './Vector2.js';
import * as Constants from './Constants.js';
export class PoolEngine {
    _physics;
    _balls = [];
    _mode;
    constructor(mode) {
        this._mode = mode;
        this._physics = new PhysicsController();
        this.initBalls();
    }
    initBalls() {
        this._balls = [];
        for (let i = 0; i < 16; i++) {
            this._balls.push(new Ball(i));
        }
        this.resetRack();
    }
    resetRack() {
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
        }
        else if (this._mode === Constants.GAME_MODE_NINE) {
            for (let i = 1; i <= 9; i++) {
                this._balls[i].setPos(rackPos[i - 1].x, rackPos[i - 1].y);
                this._balls[i].setFlagOnTable(true);
            }
            for (let i = 10; i < 16; i++) {
                this._balls[i].setFlagOnTable(false);
            }
        }
    }
    executeShot(angle, power, sideSpin, backSpin, cueBallX, cueBallY) {
        const cueBall = this._balls[0];
        if (cueBallX !== undefined && cueBallY !== undefined) {
            cueBall.setPos((cueBallX / 100) * Constants.CANVAS_WIDTH, (cueBallY / 100) * Constants.CANVAS_HEIGHT);
            cueBall.setFlagOnTable(true);
        }
        else if (!cueBall.isBallOnTable()) {
            cueBall.setPos(Constants.CUE_BALL_POS.x, Constants.CUE_BALL_POS.y);
            cueBall.setFlagOnTable(true);
        }
        this._physics.resetEvents();
        this._physics.setBackSpin(backSpin);
        const fRad = (angle * Math.PI) / 180;
        const force = new Vector2(Math.cos(fRad), Math.sin(fRad));
        // Match frontend scaling
        const cappedPower = Math.min(power, Constants.MAX_POWER_SHOT || 200);
        force.scalarProduct(cappedPower * 0.2);
        cueBall.addForce(force);
        cueBall.setSideEffect(sideSpin);
        const pocketedBalls = [];
        let cueBallScratched = false;
        const animationFrames = [];
        let frames = 0;
        const maxFrames = 1000; // 15 seconds @ 60fps safety cap
        do {
            this._physics.update(this._balls);
            frames++;
            // Record frame data (every 2 frames for efficiency)
            if (frames % 2 === 0) {
                const frameData = {};
                let hasMovement = false;
                for (const ball of this._balls) {
                    if (ball.isBallOnTable()) {
                        frameData[ball.getNumber()] = { x: ball.getX(), y: ball.getY() };
                        if (ball.getVelocity().length2() > 0.001)
                            hasMovement = true;
                    }
                }
                if (hasMovement || frames === 2) {
                    animationFrames.push(frameData);
                }
            }
            // Handle pocketing
            for (const ball of this._balls) {
                if (ball.getHole() && ball.isBallOnTable()) {
                    if (ball.getNumber() === 0) {
                        cueBallScratched = true;
                    }
                    else {
                        pocketedBalls.push(ball.getNumber());
                    }
                    ball.setFlagOnTable(false);
                }
            }
        } while (!this._physics.areBallsStopped() && frames < maxFrames);
        const finalState = {};
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
    getBalls() {
        return this._balls;
    }
}
