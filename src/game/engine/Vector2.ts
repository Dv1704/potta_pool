export class Vector2 {
    constructor(public x: number = 0, public y: number = 0) { }

    add(v: Vector2): Vector2 {
        this.x += v.x;
        this.y += v.y;
        return this;
    }

    addV(v: Vector2): Vector2 {
        this.x += v.x;
        this.y += v.y;
        return this;
    }

    scalarDivision(n: number): Vector2 {
        this.x /= n;
        this.y /= n;
        return this;
    }

    subtract(v: Vector2): Vector2 {
        this.x -= v.x;
        this.y -= v.y;
        return this;
    }

    scalarProduct(n: number): Vector2 {
        this.x *= n;
        this.y *= n;
        return this;
    }

    invert(): Vector2 {
        this.x *= -1;
        this.y *= -1;
        return this;
    }

    dotProduct(v: Vector2): number {
        return this.x * v.x + this.y * v.y;
    }

    set(fx: number, fy: number): Vector2 {
        this.x = fx;
        this.y = fy;
        return this;
    }

    setV(v: Vector2): Vector2 {
        this.x = v.x;
        this.y = v.y;
        return this;
    }

    length(): number {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    length2(): number {
        return this.x * this.x + this.y * this.y;
    }

    normalize(): Vector2 {
        const len = this.length();
        if (len > 0) {
            this.x /= len;
            this.y /= len;
        }
        return this;
    }

    angleBetweenVectors(v2: Vector2): number {
        const iAngle = Math.acos(this.dotProduct(v2) / (this.length() * v2.length()));
        if (isNaN(iAngle)) {
            return 0;
        } else {
            return iAngle;
        }
    }

    getNormalize(outV: Vector2): void {
        outV.set(this.x, this.y);
        outV.normalize();
    }

    rot90CCW(): Vector2 {
        const a = this.x;
        this.x = -this.y;
        this.y = a;
        return this;
    }

    rot90CW(): Vector2 {
        const a = this.x;
        this.x = this.y;
        this.y = -a;
        return this;
    }

    getRotCCW(outV: Vector2): void {
        outV.set(this.x, this.y);
        outV.rot90CCW();
    }

    getRotCW(outV: Vector2): void {
        outV.set(this.x, this.y);
        outV.rot90CW();
    }

    ceil(): Vector2 {
        this.x = Math.ceil(this.x);
        this.y = Math.ceil(this.y);
        return this;
    }

    round(): Vector2 {
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);
        return this;
    }

    toString(): string {
        return "Vector2: " + this.x + ", " + this.y;
    }

    getX(): number {
        return this.x;
    }

    getY(): number {
        return this.y;
    }

    rotate(iAngle: number): Vector2 {
        const fNewX = this.x;
        const fNewY = this.y;

        this.x = fNewX * Math.cos(iAngle) + fNewY * Math.sin(iAngle);
        this.y = fNewX * -Math.sin(iAngle) + fNewY * Math.cos(iAngle);
        return this;
    }
}
