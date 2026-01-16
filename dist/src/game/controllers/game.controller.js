var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Controller, Get, Post, Body, UseGuards, Request, Param, NotFoundException } from '@nestjs/common';
import { GameService } from '../services/game.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PoolEngine } from '../engine/PoolEngine.js';
let GameController = class GameController {
    gameService;
    prisma;
    constructor(gameService, prisma) {
        this.gameService = gameService;
        this.prisma = prisma;
    }
    /**
     * Demo Shot Endpoint - Uses real physics engine for demo page
     * No authentication required
     */
    async demoShot(body) {
        // Create a temporary engine for this demo shot
        const engine = new PoolEngine(1);
        // Convert angle to radians (frontend sends degrees)
        const angleRad = (body.angle * Math.PI) / 180;
        // Execute the shot with real physics - power multiplier 30 for realistic feel
        // At 100% power = 3000 force units = powerful break shot
        const result = engine.executeShot(angleRad, body.power * 30, 0, 0);
        // Convert pixels to percentages (engine uses 1920x1080 => frontend uses 0-100%)
        const CANVAS_WIDTH = 1920;
        const CANVAS_HEIGHT = 1080;
        const pixelToPercent = (x, y) => ({
            x: (x / CANVAS_WIDTH) * 100,
            y: (y / CANVAS_HEIGHT) * 100
        });
        // Convert animation frames to percentages
        const convertedFrames = result.animationFrames.map(frame => {
            const converted = {};
            for (const [ballId, pos] of Object.entries(frame)) {
                const percent = pixelToPercent(pos.x, pos.y);
                converted[parseInt(ballId)] = percent;
            }
            return converted;
        });
        // Convert final state to percentages
        const convertedFinalBalls = {};
        for (const [ballId, ball] of Object.entries(result.finalState)) {
            const percent = pixelToPercent(ball.x, ball.y);
            convertedFinalBalls[parseInt(ballId)] = {
                x: percent.x,
                y: percent.y,
                onTable: ball.onTable
            };
        }
        return {
            animationFrames: convertedFrames,
            finalBalls: convertedFinalBalls,
            pocketedBalls: result.pocketedBalls,
            cueBallScratched: result.cueBallScratched
        };
    }
    async getStats(req) {
        const userId = req.user.id;
        // Count wins (where user is winner)
        const wins = await this.prisma.game.count({
            where: {
                winnerId: userId,
                status: 'COMPLETED'
            }
        });
        // Count losses (where user is in players but not winner)
        const totalGames = await this.prisma.game.count({
            where: {
                players: {
                    has: userId
                },
                status: 'COMPLETED'
            }
        });
        const losses = totalGames - wins;
        // Calculate streak (consecutive wins from most recent games)
        const recentGames = await this.prisma.game.findMany({
            where: {
                players: {
                    has: userId
                },
                status: 'COMPLETED'
            },
            orderBy: { updatedAt: 'desc' },
            take: 20
        });
        let streak = 0;
        for (const game of recentGames) {
            if (game.winnerId === userId) {
                streak++;
            }
            else {
                break;
            }
        }
        // Calculate total earnings (sum of payouts)
        const totalEarningsQuery = await this.prisma.ledger.aggregate({
            where: {
                wallet: { userId },
                type: 'PAYOUT'
            },
            _sum: { amount: true }
        });
        const totalEarnings = Number(totalEarningsQuery._sum.amount || 0);
        // --- New: Reward Points ---
        // Simple logic: 10 points per GHS earned
        const rewardPoints = Math.floor(totalEarnings * 10);
        // --- New: Achievements ---
        const achievements = [
            { id: 1, name: 'First Win', icon: '🎯', unlocked: wins > 0 },
            { id: 2, name: 'Win Streak', icon: '🔥', unlocked: streak >= 3 },
            { id: 3, name: 'Tournament King', icon: '👑', unlocked: wins >= 50 }, // Placeholder threshold
            { id: 4, name: 'Big Money', icon: '💎', unlocked: totalEarnings >= 1000 }
        ];
        // --- New: Monthly Stats (Last 6 Months) ---
        // We'll generate the last 6 months buckets and fill them
        const monthlyStats = [];
        const today = new Date();
        for (let i = 5; i >= 0; i--) {
            const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const monthName = date.toLocaleString('default', { month: 'short' });
            // Start and End of that month
            const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
            const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
            const winsInMonth = await this.prisma.game.count({
                where: {
                    winnerId: userId,
                    status: 'COMPLETED',
                    updatedAt: {
                        gte: startOfMonth,
                        lte: endOfMonth
                    }
                }
            });
            const gamesInMonth = await this.prisma.game.count({
                where: {
                    players: { has: userId },
                    status: 'COMPLETED',
                    updatedAt: {
                        gte: startOfMonth,
                        lte: endOfMonth
                    }
                }
            });
            monthlyStats.push({
                month: monthName,
                wins: winsInMonth,
                losses: gamesInMonth - winsInMonth
            });
        }
        // --- New: Level Calculation ---
        // Logic: <10 wins: Rookie, <50: Pro, <100: Elite, >=100: Legend
        let level = 'Newcomer';
        if (wins >= 100)
            level = 'Legend';
        else if (wins >= 50)
            level = 'Elite';
        else if (wins >= 10)
            level = 'Pro';
        else if (wins > 0)
            level = 'Rookie';
        // --- New: Security Status ---
        // Fetch fresh user data to get security flags
        const freshUser = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { emailVerified: true, isTwoFactorEnabled: true, phoneNumber: true }
        });
        const security = {
            emailVerified: freshUser?.emailVerified || false,
            twoFactorEnabled: freshUser?.isTwoFactorEnabled || false,
            phoneVerified: !!freshUser?.phoneNumber // Use presence of phone as verified for now
        };
        return {
            wins,
            losses,
            totalGames,
            winRate: totalGames > 0 ? (wins / totalGames) * 100 : 0,
            streak,
            totalEarnings,
            rewardPoints,
            achievements,
            monthlyStats,
            level,
            rank: await this.calculateRank(wins)
        };
    }
    async calculateRank(myWins) {
        // Calculate Rank (Position by Wins)
        const result = await this.prisma.$queryRaw `
            WITH UserWins AS (
                SELECT "winnerId", COUNT(*)::int as win_count
                FROM "Game"
                WHERE status = 'COMPLETED' AND "winnerId" IS NOT NULL
                GROUP BY "winnerId"
            )
            SELECT COUNT(*)::int + 1 as rank
            FROM UserWins
            WHERE win_count > ${myWins}
        `;
        return Number(result[0]?.rank || 1);
    }
    async getLeaderboard() {
        // Get top 10 players by wins
        const topPlayers = await this.prisma.$queryRaw `
            SELECT 
                u.id,
                u.name,
                u.email,
                COUNT(CASE WHEN g."winnerId" = u.id THEN 1 END)::int as wins,
                COUNT(g.id)::int as total_games,
                MAX(CASE WHEN g."winnerId" = u.id THEN g."updatedAt" ELSE NULL END) as last_win
            FROM "User" u
            LEFT JOIN "Game" g ON u.id = ANY(g.players) AND g.status = 'COMPLETED'
            GROUP BY u.id, u.name, u.email
            HAVING COUNT(CASE WHEN g."winnerId" = u.id THEN 1 END) > 0
            ORDER BY wins DESC, last_win DESC NULLS LAST
            LIMIT 10
        `;
        // Calculate streaks for each player
        const playersWithStreaks = await Promise.all(topPlayers.map(async (player) => {
            const recentGames = await this.prisma.game.findMany({
                where: {
                    players: { has: player.id },
                    status: 'COMPLETED'
                },
                orderBy: { updatedAt: 'desc' },
                take: 20
            });
            let streak = 0;
            for (const game of recentGames) {
                if (game.winnerId === player.id) {
                    streak++;
                }
                else {
                    break;
                }
            }
            // Calculate total earnings (sum of payouts)
            const earnings = await this.prisma.ledger.aggregate({
                where: {
                    wallet: { userId: player.id },
                    type: 'PAYOUT'
                },
                _sum: { amount: true }
            });
            return {
                name: player.name,
                email: player.email,
                wins: player.wins,
                totalGames: player.total_games,
                streak,
                earnings: Number(earnings._sum.amount || 0)
            };
        }));
        // Platform statistics
        const totalUsers = await this.prisma.user.count();
        const totalGamesCompleted = await this.prisma.game.count({ where: { status: 'COMPLETED' } });
        // Total winnings (sum all payouts)
        const totalWinnings = await this.prisma.ledger.aggregate({
            where: { type: 'PAYOUT' },
            _sum: { amount: true }
        });
        // Games today
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const gamesToday = await this.prisma.game.count({
            where: {
                createdAt: { gte: startOfDay },
                status: 'COMPLETED'
            }
        });
        return {
            topPlayers: playersWithStreaks,
            platformStats: {
                activePlayers: totalUsers,
                totalWinnings: Number(totalWinnings._sum.amount || 0),
                gamesToday,
                totalGames: totalGamesCompleted
            }
        };
    }
    async getActiveGames() {
        const games = await this.prisma.game.findMany({
            where: {
                status: 'ACTIVE'
            },
            orderBy: { createdAt: 'desc' },
            take: 20
        });
        // Enrich with player details
        return Promise.all(games.map(async (game) => {
            const players = await this.prisma.user.findMany({
                where: { id: { in: game.players } },
                select: { id: true, name: true, email: true }
            });
            const player1 = players[0] ? (players[0].name || players[0].email.split('@')[0]) : 'Waiting...';
            const player2 = players[1] ? (players[1].name || players[1].email.split('@')[0]) : 'Waiting...';
            return {
                id: game.id,
                player1,
                player2,
                bet: Number(game.stake),
                timeLeft: 60, // Fixed time for now or calculate based on createdAt
                mode: game.mode
            };
        }));
    }
    async getMatch(req, id) {
        const userId = req.user.id;
        const game = await this.prisma.game.findUnique({
            where: { id },
            // We need to fetch player details manually or if Relation exists. 
            // Prisma schema for Game usually has players array of strings (Ids).
            // We will fetch users manually.
        });
        if (!game) {
            throw new NotFoundException('Game not found');
        }
        const players = await this.prisma.user.findMany({
            where: {
                id: { in: game.players }
            },
            select: {
                id: true,
                name: true,
                email: true,
                // avatar: true // Assuming avatar might exist in future or use placeholder
            }
        });
        // Determine opponent
        const opponent = players.find(p => p.id !== userId);
        const currentUser = players.find(p => p.id === userId);
        // Fetch pot/payout info from ledger if needed or estimate from stake
        // Real winnings come from Ledger PAYOUT type for this referenceId
        const payout = await this.prisma.ledger.findFirst({
            where: {
                referenceId: game.id,
                wallet: { userId },
                type: 'PAYOUT'
            }
        });
        return {
            ...game,
            opponent,
            result: game.winnerId === userId ? 'WIN' : (game.winnerId ? 'LOSS' : 'DRAW'),
            winnings: payout ? Number(payout.amount) : 0
        };
    }
};
__decorate([
    Post('demo-shot'),
    ApiOperation({ summary: 'Execute a demo shot with real physics' }),
    ApiResponse({ status: 200, description: 'Returns animation frames for ball movement' }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GameController.prototype, "demoShot", null);
__decorate([
    Get('stats'),
    UseGuards(JwtAuthGuard),
    ApiBearerAuth('JWT-auth'),
    ApiOperation({ summary: 'Get player game statistics' }),
    ApiResponse({ status: 200, description: 'Returns win/loss stats' }),
    __param(0, Request()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GameController.prototype, "getStats", null);
__decorate([
    Get('leaderboard'),
    ApiOperation({ summary: 'Get platform leaderboard and stats' }),
    ApiResponse({ status: 200, description: 'Returns top players and platform statistics' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GameController.prototype, "getLeaderboard", null);
__decorate([
    Get('active'),
    ApiOperation({ summary: 'Get active games' }),
    ApiResponse({ status: 200, description: 'Returns list of active games' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GameController.prototype, "getActiveGames", null);
__decorate([
    Get(':id'),
    UseGuards(JwtAuthGuard),
    ApiBearerAuth('JWT-auth'),
    ApiOperation({ summary: 'Get specific game details' }),
    ApiResponse({ status: 200, description: 'Returns game details' }),
    __param(0, Request()),
    __param(1, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], GameController.prototype, "getMatch", null);
GameController = __decorate([
    ApiTags('Game'),
    Controller('game'),
    __metadata("design:paramtypes", [GameService,
        PrismaService])
], GameController);
export { GameController };
