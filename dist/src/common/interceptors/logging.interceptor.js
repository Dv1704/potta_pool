var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Injectable } from '@nestjs/common';
import { tap } from 'rxjs/operators';
let LoggingInterceptor = class LoggingInterceptor {
    intercept(context, next) {
        const req = context.switchToHttp().getRequest();
        const method = req.method;
        const url = req.url;
        const now = Date.now();
        console.log(`[Request] ${method} ${url}`);
        if (req.headers.authorization) {
            console.log(`[Request] Authorization Header: ${req.headers.authorization.substring(0, 20)}...`);
        }
        else {
            console.log(`[Request] Authorization Header: MISSING`);
        }
        return next
            .handle()
            .pipe(tap(() => console.log(`[Response] ${method} ${url} took ${Date.now() - now}ms`)));
    }
};
LoggingInterceptor = __decorate([
    Injectable()
], LoggingInterceptor);
export { LoggingInterceptor };
