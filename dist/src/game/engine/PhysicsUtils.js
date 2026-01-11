import { Vector2 } from './Vector2.js';
export function dotProductV2(v1, v2) {
    return v1.getX() * v2.getX() + v1.getY() * v2.getY();
}
export function distance2(v1, v2) {
    return (v2.getX() - v1.getX()) * (v2.getX() - v1.getX()) + (v2.getY() - v1.getY()) * (v2.getY() - v1.getY());
}
export function distance(v1, v2) {
    return Math.sqrt(distance2(v1, v2));
}
export function toRadian(n) {
    return (n * Math.PI) / 180;
}
export function toDegree(n) {
    return (n * 180) / Math.PI;
}
export function reflectVectorV2(v, n) {
    const vRet = new Vector2();
    const dotP = dotProductV2(v, n);
    vRet.set(v.getX() - 2 * dotP * n.getX(), v.getY() - 2 * dotP * n.getY());
    return vRet;
}
export function rotateVector2D(iAngle, v) {
    const iX = v.getX() * Math.cos(iAngle) + v.getY() * Math.sin(iAngle);
    const iY = v.getX() * -Math.sin(iAngle) + v.getY() * Math.cos(iAngle);
    v.set(iX, iY);
}
export function closestPointOnLine(vA, vB, vPoint) {
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
export function collideEdgeWithCircle(oEdge, oCenter, iRadius, objData) {
    const oPt = closestPointOnLine(oEdge.getPointA(), oEdge.getPointB(), oCenter);
    const iDist = distance(oCenter, oPt);
    if (objData) {
        objData['iDistance'] = iDist;
        objData['vClosestPoint'] = oPt;
    }
    return iRadius >= iDist;
}
export function linearFunction(x, x1, x2, y1, y2) {
    return ((y2 - y1) / (x2 - x1)) * (x - x1) + y1;
}
