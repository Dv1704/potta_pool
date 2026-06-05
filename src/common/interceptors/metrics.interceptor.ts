import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Histogram } from 'prom-client';

const httpRequestDurationMicroseconds = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'code'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
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
            .pipe(
                tap({
                    next: () => {
                        const statusCode = res.statusCode || 200;
                        end({ method, route, code: statusCode.toString() });
                    },
                    error: (err) => {
                        const statusCode = err.status || 500;
                        end({ method, route, code: statusCode.toString() });
                    }
                })
            );
    }
}
