import { Vector2 } from './Vector2.js';

export class Edge {
    private m_pA: Vector2;
    private m_pB: Vector2;
    private m_pCenter: Vector2;
    private m_vNormal: Vector2;
    private m_iID: number;

    constructor(xA: number, yA: number, xB: number, yB: number, iID: number) {
        this.m_iID = iID;
        this.m_pA = new Vector2(xA, yA);
        this.m_pB = new Vector2(xB, yB);
        this.m_vNormal = new Vector2();
        this.m_pCenter = new Vector2();

        this.calculateNormal();
        this.calculateCenter();
    }

    set(xA: number, yA: number, xB: number, yB: number): void {
        this.m_pA.set(xA, yA);
        this.m_pB.set(xB, yB);
        this.calculateNormal();
        this.calculateCenter();
    }

    calculateEdgeVector(): Vector2 {
        const vNormal = new Vector2();
        vNormal.setV(this.m_pB);
        vNormal.subtract(this.m_pA);
        vNormal.normalize();
        return vNormal;
    }

    calculateNormal(): void {
        this.m_vNormal.setV(this.m_pB);
        this.m_vNormal.subtract(this.m_pA);
        this.m_vNormal.rot90CCW();
        this.m_vNormal.normalize();
    }

    calculateCenter(): void {
        this.m_pCenter.set((this.m_pA.getX() + this.m_pB.getX()) / 2, (this.m_pA.getY() + this.m_pB.getY()) / 2);
    }

    getPointA(): Vector2 {
        return this.m_pA;
    }

    getPointB(): Vector2 {
        return this.m_pB;
    }

    getNormal(): Vector2 {
        return this.m_vNormal;
    }

    getID(): number {
        return this.m_iID;
    }
}
