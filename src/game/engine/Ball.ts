import { Vector2 } from './Vector2.js';
import { BALL_RADIUS } from './Constants.js';

export class Ball {
    private _bOnTable: boolean = false;
    private _iNumber: number;
    private _vPos: Vector2;
    private _vTmpForce: Vector2;
    private _vCurForce: Vector2;
    private _vPrevPos: Vector2;
    private _iEdgeCollisionCount: number = 0;
    private _fSideEffectForce: number = 0;
    private _oInHole: Vector2 | null = null;

    constructor(iNumber: number) {
        this._iNumber = iNumber;
        this._vPos = new Vector2();
        this._vTmpForce = new Vector2();
        this._vCurForce = new Vector2();
        this._vPrevPos = new Vector2();
    }

    setPos(iX: number, iY: number): void {
        this._vPos.set(iX, iY);
    }

    setPosV(vNewPos: Vector2): void {
        this._vPos.setV(vNewPos);
    }

    getPos(): Vector2 {
        return this._vPos;
    }

    setPrevPos(vNewPos: Vector2): void {
        this._vPrevPos.setV(vNewPos);
    }

    getPrevPos(): Vector2 {
        return this._vPrevPos;
    }

    addPos(vPos: Vector2): void {
        this._vPos.add(vPos);
    }

    addForce(vForce: Vector2): void {
        this._vTmpForce.add(vForce);
    }

    addCurForce(vForce: Vector2): void {
        this._vCurForce.add(vForce);
    }

    setCurForce(iX: number, iY: number): void {
        this._vCurForce.set(iX, iY);
    }

    setCurForceV(vForce: Vector2): void {
        this._vCurForce.setV(vForce);
    }

    getCurForce(): Vector2 {
        return this._vCurForce;
    }

    setTmpForce(iX: number, iY: number): void {
        this._vTmpForce.set(iX, iY);
    }

    getTmpForce(): Vector2 {
        return this._vTmpForce;
    }

    normalizeCurForce(): void {
        this._vCurForce.normalize();
    }

    scalarProductCurForce(iValue: number): void {
        this._vCurForce.scalarProduct(iValue);
    }

    getCurForceLen(): number {
        return this._vCurForce.length();
    }

    getCurForceLen2(): number {
        return this._vCurForce.length2();
    }

    setFlagOnTable(bVal: boolean): void {
        this._bOnTable = bVal;
    }

    isBallOnTable(): boolean {
        return this._bOnTable;
    }

    inHole(vHolePos: Vector2 | null): void {
        this._oInHole = vHolePos;
    }

    getHole(): Vector2 | null {
        return this._oInHole;
    }

    getNumber(): number {
        return this._iNumber;
    }

    setSideEffect(fVal: number): void {
        this._fSideEffectForce = fVal;
    }

    getSideEffect(): number {
        return this._fSideEffectForce;
    }

    resetEdgeCollisionCount(): void {
        this._iEdgeCollisionCount = 0;
    }

    increaseEdgeCollisionCount(): void {
        this._iEdgeCollisionCount++;
    }

    getEdgeCollisionCount(): number {
        return this._iEdgeCollisionCount;
    }

    getX(): number {
        return this._vPos.x;
    }

    getY(): number {
        return this._vPos.y;
    }
}
