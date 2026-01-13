import { Controller, Get, Post, Body, UseGuards, Request, Param, NotFoundException } from '@nestjs/common';
import { GameService } from '../services/game.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service.js';

@ApiTags('Game')
@Controller('game')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class GameController {
    constructor(
        private readonly gameService: GameService,
        private readonly prisma: PrismaService
    ) { }

    @Get('stats')
    @ApiOperation({ summary: 'Get player game statistics' })
    @ApiResponse({ status: 200, description: 'Returns win/loss stats' })
    async getStats(@Request() req: any) {
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
            } else {
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
        if (wins >= 100) level = 'Legend';
        else if (wins >= 50) level = 'Elite';
        else if (wins >= 10) level = 'Pro';
        else if (wins > 0) level = 'Rookie';

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

    private async calculateRank(myWins: number): Promise<number> {
        // Calculate Rank (Position by Wins)
        const result = await this.prisma.$queryRaw`
            WITH UserWins AS (
                SELECT "winnerId", COUNT(*)::int as win_count
                FROM "Game"
                WHERE status = 'COMPLETED' AND "winnerId" IS NOT NULL
                GROUP BY "winnerId"
            )
            SELECT COUNT(*)::int + 1 as rank
            FROM UserWins
            WHERE win_count > ${myWins}
        ` as any[];
        return Number(result[0]?.rank || 1);
    }

    @Get('leaderboard')
    @ApiOperation({ summary: 'Get platform leaderboard and stats' })
    @ApiResponse({ status: 200, description: 'Returns top players and platform statistics' })
    async getLeaderboard() {
        // Get top 10 players by wins
        const topPlayers = await this.prisma.$queryRaw`
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
        ` as any[];

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
                } else {
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

    @Get('active')
    @ApiOperation({ summary: 'Get active games' })
    @ApiResponse({ status: 200, description: 'Returns list of active games' })
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
    @Get(':id')
    @ApiOperation({ summary: 'Get specific game details' })
    @ApiResponse({ status: 200, description: 'Returns game details' })
    async getMatch(@Request() req: any, @Param('id') id: string) {
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
}

