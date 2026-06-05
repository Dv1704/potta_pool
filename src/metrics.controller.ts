import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from './prisma/prisma.service.js';
import { register } from 'prom-client';

@Controller()
export class MetricsController {
    constructor(private readonly prisma: PrismaService) {}

    @Get('metrics')
    async getMetrics(@Res() res: Response) {
        res.set('Content-Type', register.contentType);
        try {
            const appMetrics = await register.metrics();
            const prismaMetrics = await (this.prisma as any).$metrics.prometheus();
            res.end(appMetrics + '\n' + prismaMetrics);
        } catch (error: any) {
            res.status(500).send(error.message);
        }
    }
}
