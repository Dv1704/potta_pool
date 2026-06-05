var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Injectable } from '@nestjs/common';
import { tap } from 'rxjs/operators';
import { Histogram } from 'prom-client';
const httpRequestDurationMicroseconds = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'code'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});
let MetricsInterceptor = class MetricsInterceptor {
    intercept(context, next) {
        const http = context.switchToHttp();
        const req = http.getRequest();
        const res = http.getResponse();
        if (!req || !req.method) {
            return next.handle();
        }
        const method = req.method;
        const route = req.route ? req.route.path : req.url;
        const end = httpRequestDurationMicroseconds.startTimer();
        return next
            .handle()
            .pipe(tap({
            next: () => {
                const statusCode = res.statusCode || 200;
                end({ method, route, code: statusCode.toString() });
            },
            error: (err) => {
                const statusCode = err.status || 500;
                end({ method, route, code: statusCode.toString() });
            }
        }));
    }
};
MetricsInterceptor = __decorate([
    Injectable()
], MetricsInterceptor);
export { MetricsInterceptor };
