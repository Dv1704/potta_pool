import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const req = context.switchToHttp().getRequest();
        const method = req.method;
        const url = req.url;
        const now = Date.now();

        console.log(`[Request] ${method} ${url}`);
        if (req.headers.authorization) {
            console.log(`[Request] Authorization Header: ${req.headers.authorization.substring(0, 20)}...`);
        } else {
            console.log(`[Request] Authorization Header: MISSING`);
        }

        return next
            .handle()
            .pipe(
                tap(() => console.log(`[Response] ${method} ${url} took ${Date.now() - now}ms`)),
            );
    }
}
