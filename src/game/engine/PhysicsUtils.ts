import { Vector2 } from './Vector2';
import { Edge } from './Edge';

export function dotProductV2(v1: Vector2, v2: Vector2): number {
    return v1.getX() * v2.getX() + v1.getY() * v2.getY();
}

export function distance2(v1: Vector2, v2: Vector2): number {
    return (v2.getX() - v1.getX()) * (v2.getX() - v1.getX()) + (v2.getY() - v1.getY()) * (v2.getY() - v1.getY());
}

export function distance(v1: Vector2, v2: Vector2): number {
    return Math.sqrt(distance2(v1, v2));
}

export function toRadian(n: number): number {
    return (n * Math.PI) / 180;
}

export function toDegree(n: number): number {
    return (n * 180) / Math.PI;
}

export function reflectVectorV2(v: Vector2, n: Vector2): Vector2 {
    const vRet = new Vector2();
    const dotP = dotProductV2(v, n);
    vRet.set(v.getX() - 2 * dotP * n.getX(), v.getY() - 2 * dotP * n.getY());
    return vRet;
}

export function rotateVector2D(iAngle: number, v: Vector2): void {
    const iX = v.getX() * Math.cos(iAngle) + v.getY() * Math.sin(iAngle);
    const iY = v.getX() * -Math.sin(iAngle) + v.getY() * Math.cos(iAngle);
    v.set(iX, iY);
}

export function closestPointOnLine(vA: Vector2, vB: Vector2, vPoint: Vector2): Vector2 {
    const v1 = new Vector2();
    v1.setV(vPoint);
    v1.subtract(vA);
    const v2 = new Vector2();
    v2.setV(vB);
    v2.subtract(vA);
    v2.normalize();

    const t = dotProductV2(v2, v1);

    if (t <= 0) {
        return new Vector2(vA.x, vA.y);
    }

    if (t >= distance(vA, vB)) {
        return new Vector2(vB.x, vB.y);
    }

    v2.scalarProduct(t);
    v2.add(vA);

    return v2;
}

export function collideEdgeWithCircle(oEdge: Edge, oCenter: Vector2, iRadius: number, objData?: any): boolean {
    const oPt = closestPointOnLine(oEdge.getPointA(), oEdge.getPointB(), oCenter);
    const iDist = distance(oCenter, oPt);
    if (objData) {
        objData['iDistance'] = iDist;
        objData['vClosestPoint'] = oPt;
    }
    return iRadius >= iDist;
}

export function linearFunction(x: number, x1: number, x2: number, y1: number, y2: number): number {
    return ((y2 - y1) / (x2 - x1)) * (x - x1) + y1;
}
