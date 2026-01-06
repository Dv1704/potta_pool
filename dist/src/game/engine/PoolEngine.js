import { Ball } from './Ball';
import { PhysicsController } from './PhysicsController';
import { Vector2 } from './Vector2';
import * as Constants from './Constants';
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
    executeShot(angle, power, sideSpin, backSpin) {
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
        const pocketedBalls = [];
        let cueBallScratched = false;
        // Simulation loop
        let frames = 0;
        const maxFrames = 6000; // 10 seconds at 60 FPS safety cap
        do {
            this._physics.update(this._balls);
            frames++;
            // Check for pocketed balls in this frame
            for (const ball of this._balls) {
                if (ball.getHole() && ball.isBallOnTable()) {
                    if (ball.getNumber() === 0) {
                        cueBallScratched = true;
                        ball.setFlagOnTable(false);
                    }
                    else {
                        pocketedBalls.push(ball.getNumber());
                        ball.setFlagOnTable(false);
                    }
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
        };
    }
    getBalls() {
        return this._balls;
    }
}
