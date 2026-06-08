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

            // Prisma metrics are optional — only available when the metrics extension is enabled
            let prismaMetrics = '';
            try {
                prismaMetrics = await (this.prisma as any).$metrics.prometheus();
            } catch {
                // Prisma metrics extension not configured — skip silently
            }

            res.end(prismaMetrics ? appMetrics + '\n' + prismaMetrics : appMetrics);
        } catch (error: any) {
            res.status(500).send(error.message);
        }
    }
}
