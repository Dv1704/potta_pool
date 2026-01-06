import { Vector2 } from './Vector2';
export class Edge {
    m_pA;
    m_pB;
    m_pCenter;
    m_vNormal;
    m_iID;
    constructor(xA, yA, xB, yB, iID) {
        this.m_iID = iID;
        this.m_pA = new Vector2(xA, yA);
        this.m_pB = new Vector2(xB, yB);
        this.m_vNormal = new Vector2();
        this.m_pCenter = new Vector2();
        this.calculateNormal();
        this.calculateCenter();
    }
    set(xA, yA, xB, yB) {
        this.m_pA.set(xA, yA);
        this.m_pB.set(xB, yB);
        this.calculateNormal();
        this.calculateCenter();
    }
    calculateEdgeVector() {
        const vNormal = new Vector2();
        vNormal.setV(this.m_pB);
        vNormal.subtract(this.m_pA);
        vNormal.normalize();
        return vNormal;
    }
    calculateNormal() {
        this.m_vNormal.setV(this.m_pB);
        this.m_vNormal.subtract(this.m_pA);
        this.m_vNormal.rot90CCW();
        this.m_vNormal.normalize();
    }
    calculateCenter() {
        this.m_pCenter.set((this.m_pA.getX() + this.m_pB.getX()) / 2, (this.m_pA.getY() + this.m_pB.getY()) / 2);
    }
    getPointA() {
        return this.m_pA;
    }
    getPointB() {
        return this.m_pB;
    }
    getNormal() {
        return this.m_vNormal;
    }
    getID() {
        return this.m_iID;
    }
}
