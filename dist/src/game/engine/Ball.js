import { Vector2 } from './Vector2.js';
export class Ball {
    _bOnTable = false;
    _iNumber;
    _vPos;
    _vTmpForce;
    _vCurForce;
    _vPrevPos;
    _iEdgeCollisionCount = 0;
    _fSideEffectForce = 0;
    _oInHole = null;
    constructor(iNumber) {
        this._iNumber = iNumber;
        this._vPos = new Vector2();
        this._vTmpForce = new Vector2();
        this._vCurForce = new Vector2();
        this._vPrevPos = new Vector2();
    }
    setPos(iX, iY) {
        this._vPos.set(iX, iY);
    }
    setPosV(vNewPos) {
        this._vPos.setV(vNewPos);
    }
    getPos() {
        return this._vPos;
    }
    setPrevPos(vNewPos) {
        this._vPrevPos.setV(vNewPos);
    }
    getPrevPos() {
        return this._vPrevPos;
    }
    addPos(vPos) {
        this._vPos.add(vPos);
    }
    addForce(vForce) {
        this._vTmpForce.add(vForce);
    }
    addCurForce(vForce) {
        this._vCurForce.add(vForce);
    }
    setCurForce(iX, iY) {
        this._vCurForce.set(iX, iY);
    }
    setCurForceV(vForce) {
        this._vCurForce.setV(vForce);
    }
    getCurForce() {
        return this._vCurForce;
    }
    setTmpForce(iX, iY) {
        this._vTmpForce.set(iX, iY);
    }
    getTmpForce() {
        return this._vTmpForce;
    }
    normalizeCurForce() {
        this._vCurForce.normalize();
    }
    scalarProductCurForce(iValue) {
        this._vCurForce.scalarProduct(iValue);
    }
    getCurForceLen() {
        return this._vCurForce.length();
    }
    getCurForceLen2() {
        return this._vCurForce.length2();
    }
    setFlagOnTable(bVal) {
        this._bOnTable = bVal;
    }
    isBallOnTable() {
        return this._bOnTable;
    }
    inHole(vHolePos) {
        this._oInHole = vHolePos;
    }
    getHole() {
        return this._oInHole;
    }
    getNumber() {
        return this._iNumber;
    }
    setSideEffect(fVal) {
        this._fSideEffectForce = fVal;
    }
    getSideEffect() {
        return this._fSideEffectForce;
    }
    resetEdgeCollisionCount() {
        this._iEdgeCollisionCount = 0;
    }
    increaseEdgeCollisionCount() {
        this._iEdgeCollisionCount++;
    }
    getEdgeCollisionCount() {
        return this._iEdgeCollisionCount;
    }
    getX() {
        return this._vPos.x;
    }
    getY() {
        return this._vPos.y;
    }
}
