export class Vector2 {
    x;
    y;
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
    add(v) {
        this.x += v.x;
        this.y += v.y;
        return this;
    }
    addV(v) {
        this.x += v.x;
        this.y += v.y;
        return this;
    }
    scalarDivision(n) {
        this.x /= n;
        this.y /= n;
        return this;
    }
    subtract(v) {
        this.x -= v.x;
        this.y -= v.y;
        return this;
    }
    scalarProduct(n) {
        this.x *= n;
        this.y *= n;
        return this;
    }
    invert() {
        this.x *= -1;
        this.y *= -1;
        return this;
    }
    dotProduct(v) {
        return this.x * v.x + this.y * v.y;
    }
    set(fx, fy) {
        this.x = fx;
        this.y = fy;
        return this;
    }
    setV(v) {
        this.x = v.x;
        this.y = v.y;
        return this;
    }
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    length2() {
        return this.x * this.x + this.y * this.y;
    }
    normalize() {
        const len = this.length();
        if (len > 0) {
            this.x /= len;
            this.y /= len;
        }
        return this;
    }
    angleBetweenVectors(v2) {
        const iAngle = Math.acos(this.dotProduct(v2) / (this.length() * v2.length()));
        if (isNaN(iAngle)) {
            return 0;
        }
        else {
            return iAngle;
        }
    }
    getNormalize(outV) {
        outV.set(this.x, this.y);
        outV.normalize();
    }
    rot90CCW() {
        const a = this.x;
        this.x = -this.y;
        this.y = a;
        return this;
    }
    rot90CW() {
        const a = this.x;
        this.x = this.y;
        this.y = -a;
        return this;
    }
    getRotCCW(outV) {
        outV.set(this.x, this.y);
        outV.rot90CCW();
    }
    getRotCW(outV) {
        outV.set(this.x, this.y);
        outV.rot90CW();
    }
    ceil() {
        this.x = Math.ceil(this.x);
        this.y = Math.ceil(this.y);
        return this;
    }
    round() {
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);
        return this;
    }
    toString() {
        return "Vector2: " + this.x + ", " + this.y;
    }
    getX() {
        return this.x;
    }
    getY() {
        return this.y;
    }
    rotate(iAngle) {
        const fNewX = this.x;
        const fNewY = this.y;
        this.x = fNewX * Math.cos(iAngle) + fNewY * Math.sin(iAngle);
        this.y = fNewX * -Math.sin(iAngle) + fNewY * Math.cos(iAngle);
        return this;
    }
}
