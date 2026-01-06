import { Vector2 } from './Vector2';
import { Edge } from './Edge';
import { Ball } from './Ball';
import * as Constants from './Constants';
import * as PhysicsUtils from './PhysicsUtils';

export class PhysicsController {
    private _bAllBallsStopped: boolean = true;
    private _aBalls: Ball[] = [];
    private _events: { type: string, ballId: number, otherId?: number, edgeId?: number }[] = [];
    private _firstBallCollided: number | null = null;
    private _aEdgesTopLeft: Edge[] = [];
    private _aEdgesTopRight: Edge[] = [];
    private _aEdgesBottomLeft: Edge[] = [];
    private _aEdgesBottomRight: Edge[] = [];
    private _aFieldEdges: Edge[] = [];
    private _aHoleEdges: Edge[] = [];
    private _aPoints: Vector2[] = [];
    private _aPointsNormals: Vector2[] = [];
    private _aPointsNormalsTopLeft: { oPoint: Vector2; oNormal: Vector2 }[] = [];
    private _aPointsNormalsTopRight: { oPoint: Vector2; oNormal: Vector2 }[] = [];
    private _aPointsNormalsBottomLeft: { oPoint: Vector2; oNormal: Vector2 }[] = [];
    private _aPointsNormalsBottomRight: { oPoint: Vector2; oNormal: Vector2 }[] = [];
    private _aHoles: Vector2[] = [];
    private _aHolesTopLeft: Vector2[] = [];
    private _aHolesTopRight: Vector2[] = [];
    private _aHolesBottomLeft: Vector2[] = [];
    private _aHolesBottomRight: Vector2[] = [];

    constructor() {
        this._initCollisions();
    }

    private _initCollisions(): void {
        this._aFieldEdges = [];
        for (let k = 0; k < Constants.FIELD_POINTS.length - 1; k++) {
            const oEdge = new Edge(
                Constants.FIELD_POINTS[k].x,
                Constants.FIELD_POINTS[k].y,
                Constants.FIELD_POINTS[k + 1].x,
                Constants.FIELD_POINTS[k + 1].y,
                k
            );
            this._aFieldEdges.push(oEdge);
        }

        const oLastEdge = new Edge(
            Constants.FIELD_POINTS[Constants.FIELD_POINTS.length - 1].x,
            Constants.FIELD_POINTS[Constants.FIELD_POINTS.length - 1].y,
            Constants.FIELD_POINTS[0].x,
            Constants.FIELD_POINTS[0].y,
            Constants.FIELD_POINTS.length - 1
        );
        this._aFieldEdges.push(oLastEdge);

        this._aEdgesTopLeft = [
            this._aFieldEdges[21],
            this._aFieldEdges[22],
            this._aFieldEdges[23],
            this._aFieldEdges[0],
            this._aFieldEdges[1],
            this._aFieldEdges[2],
            this._aFieldEdges[3],
            this._aFieldEdges[4],
        ];

        this._aHoleEdges = [
            this._aFieldEdges[0],
            this._aFieldEdges[2],
            this._aFieldEdges[3],
            this._aFieldEdges[4],
            this._aFieldEdges[8],
            this._aFieldEdges[7],
            this._aFieldEdges[6],
            this._aFieldEdges[10],
            this._aFieldEdges[11],
            this._aFieldEdges[12],
            this._aFieldEdges[14],
            this._aFieldEdges[15],
            this._aFieldEdges[16],
            this._aFieldEdges[18],
            this._aFieldEdges[19],
            this._aFieldEdges[20],
            this._aFieldEdges[22],
            this._aFieldEdges[23],
        ];

        this._aEdgesTopRight = [
            this._aFieldEdges[3],
            this._aFieldEdges[4],
            this._aFieldEdges[5],
            this._aFieldEdges[6],
            this._aFieldEdges[7],
            this._aFieldEdges[8],
            this._aFieldEdges[9],
        ];

        this._aEdgesBottomRight = [
            this._aFieldEdges[9],
            this._aFieldEdges[10],
            this._aFieldEdges[11],
            this._aFieldEdges[12],
            this._aFieldEdges[13],
            this._aFieldEdges[14],
            this._aFieldEdges[15],
            this._aFieldEdges[16],
        ];

        this._aEdgesBottomLeft = [
            this._aFieldEdges[15],
            this._aFieldEdges[16],
            this._aFieldEdges[17],
            this._aFieldEdges[18],
            this._aFieldEdges[19],
            this._aFieldEdges[20],
            this._aFieldEdges[21],
        ];

        this._aPoints = [];
        for (let i = 0; i < Constants.FIELD_POINTS.length; i++) {
            this._aPoints.push(new Vector2(Constants.FIELD_POINTS[i].x, Constants.FIELD_POINTS[i].y));
        }

        this._aPointsNormals = [];
        const oFirstNormal = new Vector2();
        oFirstNormal.set(
            (this._aFieldEdges[0].getNormal().getX() + this._aFieldEdges[23].getNormal().getX()) / 2,
            (this._aFieldEdges[0].getNormal().getY() + this._aFieldEdges[23].getNormal().getY()) / 2
        );
        oFirstNormal.normalize();
        this._aPointsNormals.push(oFirstNormal);

        for (let i = 0; i < 23; i++) {
            const oTmpNormal = new Vector2(
                (this._aFieldEdges[i].getNormal().getX() + this._aFieldEdges[i + 1].getNormal().getX()) / 2,
                (this._aFieldEdges[i].getNormal().getY() + this._aFieldEdges[i + 1].getNormal().getY()) / 2
            );
            oTmpNormal.normalize();
            this._aPointsNormals.push(oTmpNormal);
        }

        this._aPointsNormalsTopLeft = [
            { oPoint: this._aPoints[1], oNormal: this._aPointsNormals[1] },
            { oPoint: this._aPoints[2], oNormal: this._aPointsNormals[2] },
            { oPoint: this._aPoints[5], oNormal: this._aPointsNormals[5] },
            { oPoint: this._aPoints[21], oNormal: this._aPointsNormals[21] },
        ];

        this._aPointsNormalsTopRight = [
            { oPoint: this._aPoints[2], oNormal: this._aPointsNormals[2] },
            { oPoint: this._aPoints[5], oNormal: this._aPointsNormals[5] },
            { oPoint: this._aPoints[6], oNormal: this._aPointsNormals[6] },
            { oPoint: this._aPoints[9], oNormal: this._aPointsNormals[9] },
        ];

        this._aPointsNormalsBottomRight = [
            { oPoint: this._aPoints[10], oNormal: this._aPointsNormals[10] },
            { oPoint: this._aPoints[13], oNormal: this._aPointsNormals[13] },
            { oPoint: this._aPoints[14], oNormal: this._aPointsNormals[14] },
            { oPoint: this._aPoints[17], oNormal: this._aPointsNormals[17] },
        ];

        this._aPointsNormalsBottomLeft = [
            { oPoint: this._aPoints[14], oNormal: this._aPointsNormals[14] },
            { oPoint: this._aPoints[17], oNormal: this._aPointsNormals[17] },
            { oPoint: this._aPoints[18], oNormal: this._aPointsNormals[18] },
            { oPoint: this._aPoints[21], oNormal: this._aPointsNormals[21] },
        ];

        this._aHoles = [];
        for (let i = 0; i < Constants.HOLE_CENTER_POS.length; i++) {
            this._aHoles.push(new Vector2(Constants.HOLE_CENTER_POS[i].x, Constants.HOLE_CENTER_POS[i].y));
        }

        this._aHolesTopLeft = [this._aHoles[0], this._aHoles[1]];
        this._aHolesTopRight = [this._aHoles[1], this._aHoles[2]];
        this._aHolesBottomRight = [this._aHoles[3], this._aHoles[4]];
        this._aHolesBottomLeft = [this._aHoles[4], this._aHoles[5]];
    }

    public verifyCollisionBallWithRectArea(vPos: Vector2): boolean {
        return vPos.x >= Constants.RECT_COLLISION.x &&
            vPos.x <= Constants.RECT_COLLISION.x + Constants.RECT_COLLISION.width &&
            vPos.y >= Constants.RECT_COLLISION.y &&
            vPos.y <= Constants.RECT_COLLISION.y + Constants.RECT_COLLISION.height;
    }

    private _chooseQuadrant(oBall: Ball): number {
        const tableCenterX = Constants.CANVAS_WIDTH / 2;
        const tableCenterY = Constants.CANVAS_HEIGHT / 2; // Should really be defined in constants correctly

        if (oBall.getPos().x < tableCenterX) {
            if (oBall.getPos().y < tableCenterY) {
                return 0;
            } else {
                return 3;
            }
        } else {
            if (oBall.getPos().y < tableCenterY) {
                return 1;
            } else {
                return 2;
            }
        }
    }

    public collideBallWithHoles(oBall: Ball, aHoles: Vector2[]): Vector2 | null {
        for (const hole of aHoles) {
            if (PhysicsUtils.distance(oBall.getPos(), hole) < Constants.BALL_RADIUS) {
                return hole;
            }
        }
        return null;
    }

    public collideBallWithPointsNormals(oBall: Ball, vPos: Vector2, aPointsNormals: { oPoint: Vector2; oNormal: Vector2 }[]): boolean {
        for (const pn of aPointsNormals) {
            if (PhysicsUtils.distance2(pn.oPoint, vPos) <= Constants.BALL_RADIUS_QUADRO) {
                const iTmp = oBall.getCurForceLen();
                oBall.setCurForceV(pn.oNormal);
                oBall.scalarProductCurForce(iTmp);
                return true;
            }
        }
        return false;
    }

    public collideBallWithBalls(oBall: Ball): boolean {
        if (oBall.getHole() !== null) {
            return false;
        }

        let aCollisions: { oBall: Ball; iDist: number; index_ball: number }[] = [];
        let minDist = 10000;
        let iPos = -1;

        for (let i = 0; i < this._aBalls.length; i++) {
            const otherBall = this._aBalls[i];
            if (otherBall.getNumber() !== oBall.getNumber() && otherBall.isBallOnTable() && otherBall.getHole() === null) {
                const tmpDist = PhysicsUtils.distance2(oBall.getPos(), otherBall.getPos());

                if (tmpDist <= Constants.BALL_DIAMETER_QUADRO) {
                    aCollisions.push({ oBall: otherBall, iDist: tmpDist, index_ball: i });
                    if (minDist > tmpDist) {
                        minDist = tmpDist;
                        iPos = aCollisions.length - 1;
                    }
                }
            }
        }

        if (aCollisions.length === 0) {
            return false;
        }

        const iHitBallId = aCollisions[iPos].oBall.getNumber();
        if (oBall.getNumber() === 0 && this._firstBallCollided === null) {
            this._firstBallCollided = iHitBallId;
        }

        this._events.push({
            type: 'ball_collision',
            ballId: oBall.getNumber(),
            otherId: iHitBallId
        });

        const vPos = new Vector2();
        const vRayCollision = new Vector2();
        const vDirInvert = new Vector2();

        vDirInvert.setV(oBall.getCurForce());
        vDirInvert.invert();
        vDirInvert.normalize();

        vRayCollision.setV(oBall.getPos());
        vRayCollision.subtract(aCollisions[iPos].oBall.getPos());
        vRayCollision.normalize();
        vPos.setV(vRayCollision);
        vPos.scalarProduct(Constants.BALL_DIAMETER * 1.05);
        vPos.add(aCollisions[iPos].oBall.getPos());

        oBall.setPosV(vPos);

        const iAngle = vDirInvert.angleBetweenVectors(vRayCollision);
        const iForceTransfer = iAngle / Constants.HALF_PI;
        let iNewForce: number;

        // Skipping spin effects for now as they depend on complex UI interaction, 
        // but the engine supports it if the client sends effect values.
        const vTmpDir = new Vector2();
        vTmpDir.setV(oBall.getCurForce());
        vTmpDir.normalize();
        iNewForce = oBall.getCurForceLen();
        oBall.setCurForceV(PhysicsUtils.reflectVectorV2(vRayCollision, vTmpDir));

        const iForce = iNewForce * Constants.K_IMPACT_BALL;
        oBall.normalizeCurForce();
        oBall.scalarProductCurForce((iForce * 0.8) * iForceTransfer + (iForce * 0.15));

        vRayCollision.invert();
        vRayCollision.normalize();
        vRayCollision.scalarProduct(iForce * (1 - iForceTransfer) + (iForce * 0.2));
        aCollisions[iPos].oBall.addForce(vRayCollision);

        return true;
    }

    public collideBallWithEdges(oBall: Ball, aEdges: Edge[], aPointsNormals: { oPoint: Vector2; oNormal: Vector2 }[]): boolean {
        const vDir = new Vector2();
        vDir.setV(oBall.getCurForce());
        vDir.normalize();

        const iCurForce = oBall.getCurForceLen();
        if (iCurForce === 0) {
            return false;
        }

        const iFactorForce = 0.2;
        const iTimes = Math.floor(iCurForce / iFactorForce);
        let bHit = false;
        const vPos = new Vector2();
        vPos.setV(oBall.getPrevPos());

        vDir.normalize();
        vDir.scalarProduct(iFactorForce);

        let hitEdgeIndex = -1;

        for (let k = 0; k < iTimes + 1; k++) {
            if (k === iTimes) {
                vDir.normalize();
                vDir.scalarProduct(iCurForce - iTimes * iFactorForce);
            }
            vPos.add(vDir);

            if (!this.verifyCollisionBallWithRectArea(vPos)) {
                if (this.collideBallWithPointsNormals(oBall, vPos, aPointsNormals)) {
                    vPos.subtract(vDir);
                    oBall.setPosV(vPos);
                    return true;
                }
                for (let i = 0; i < aEdges.length; i++) {
                    bHit = PhysicsUtils.collideEdgeWithCircle(aEdges[i], vPos, Constants.BALL_RADIUS);
                    if (bHit) {
                        vPos.subtract(vDir);
                        hitEdgeIndex = i;
                        break;
                    }
                }

                if (bHit) {
                    oBall.increaseEdgeCollisionCount();
                    this._events.push({
                        type: 'edge_collision',
                        ballId: oBall.getNumber(),
                        edgeId: aEdges[hitEdgeIndex].getID()
                    });
                    break;
                }
            }

            oBall.setPosV(vPos);
            if (this.collideBallWithBalls(oBall)) {
                return false;
            }
        }

        if (bHit) {
            const vReflectedDir = PhysicsUtils.reflectVectorV2(oBall.getCurForce(), aEdges[hitEdgeIndex].getNormal());
            oBall.setPosV(vPos);
            oBall.setCurForceV(vReflectedDir);
        } else {
            oBall.addPos(oBall.getCurForce());
        }

        oBall.setPosV(vPos);
        if (this.collideBallWithBalls(oBall)) {
            return false;
        }

        return bHit;
    }

    public update(aBalls: Ball[]): void {
        this._aBalls = aBalls;
        this._bAllBallsStopped = true;

        for (const oBall of aBalls) {
            oBall.addCurForce(oBall.getTmpForce());
            oBall.setTmpForce(0, 0);
            oBall.setPrevPos(oBall.getPos());

            if (oBall.isBallOnTable()) {
                let aHolesTest: Vector2[] = [];
                let aEdgesTest: Edge[] = [];
                let aPointsNormalsTest: { oPoint: Vector2; oNormal: Vector2 }[] = [];

                switch (this._chooseQuadrant(oBall)) {
                    case 0:
                        aHolesTest = this._aHolesTopLeft;
                        aEdgesTest = this._aEdgesTopLeft;
                        aPointsNormalsTest = this._aPointsNormalsTopLeft;
                        break;
                    case 1:
                        aHolesTest = this._aHolesTopRight;
                        aEdgesTest = this._aEdgesTopRight;
                        aPointsNormalsTest = this._aPointsNormalsTopRight;
                        break;
                    case 2:
                        aHolesTest = this._aHolesBottomRight;
                        aEdgesTest = this._aEdgesBottomRight;
                        aPointsNormalsTest = this._aPointsNormalsBottomRight;
                        break;
                    case 3:
                        aHolesTest = this._aHolesBottomLeft;
                        aEdgesTest = this._aEdgesBottomLeft;
                        aPointsNormalsTest = this._aPointsNormalsBottomLeft;
                        break;
                }

                if (oBall.getHole() === null) {
                    const oRetHole = this.collideBallWithHoles(oBall, aHolesTest);
                    if (oRetHole !== null) {
                        oBall.inHole(oRetHole);
                        const vDirToHole = new Vector2(oRetHole.x - oBall.getX(), oRetHole.y - oBall.getY());
                        vDirToHole.normalize();
                        for (let k = 0; k < 5; k++) {
                            oBall.addPos(vDirToHole);
                        }
                    } else {
                        this.collideBallWithEdges(oBall, aEdgesTest, aPointsNormalsTest);
                    }
                } else {
                    this.collideBallWithEdges(oBall, this._aHoleEdges, aPointsNormalsTest);
                    // Simplified hole logic: if it's in a hole, it doesn't come back in this mode
                    if (oBall.getCurForceLen2() < Constants.K_MIN_FORCE) {
                        oBall.setFlagOnTable(false);
                    }
                }
            } else {
                oBall.addPos(oBall.getCurForce());
            }

            oBall.scalarProductCurForce(Constants.K_FRICTION);

            if (oBall.getCurForceLen2() < Constants.K_MIN_FORCE) {
                oBall.setCurForce(0, 0);
            } else if (oBall.isBallOnTable()) {
                this._bAllBallsStopped = false;
            }
        }
    }

    public areBallsStopped(): boolean {
        return this._bAllBallsStopped;
    }

    public getEvents(): any[] {
        return this._events;
    }

    public getFirstBallCollided(): number | null {
        return this._firstBallCollided;
    }

    public resetEvents(): void {
        this._events = [];
        this._firstBallCollided = null;
    }
}
