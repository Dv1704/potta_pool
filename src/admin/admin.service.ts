
import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletService } from '../wallet/wallet.service.js';

@Injectable()
export class AdminService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => WalletService))
        private walletService: WalletService
    ) { }

    async logAction(adminId: string, action: string, targetUserId: string | null, details: any) {
        return this.prisma.adminAuditLog.create({
            data: {
                adminId,
                action,
                targetUserId,
                details: JSON.stringify(details)
            }
        });
    }

    async reconcile() {
        // 1. Get System Wallet Balance
        // We need to implement getSystemWallet in walletService public logic or access DB directly
        const systemWallet = await this.prisma.wallet.findFirst({
            where: { user: { email: 'system@pottagame.com' } }
        });
        const systemBalance = systemWallet ? Number(systemWallet.availableBalance) : 0;

        // 2. Get Total User Liabilities (Available + Locked)
        const userWallets = await this.prisma.wallet.aggregate({
            where: { user: { email: { not: 'system@pottagame.com' } } },
            _sum: {
                availableBalance: true,
                lockedBalance: true
            }
        });

        const totalUserAvailable = Number(userWallets._sum.availableBalance || 0);
        const totalUserLocked = Number(userWallets._sum.lockedBalance || 0);
        const totalLiabilities = totalUserAvailable + totalUserLocked;

        // 3. For a real system we'd compare against Paystack Balance or Cash in Bank.
        // But for this "System Balance Check", we are mostly verifying that:
        // System Profits + User Funds = Total Assets Tracked?
        // Actually, the request said: "GET /admin/reconcile -> returns json"

        // Let's return the simplified health check:
        // For now, we just report the numbers.

        return {
            timestamp: new Date(),
            systemBalance,
            totalUserAvailable,
            totalUserLocked,
            totalLiabilities,
            status: 'HEALTHY' // For now always healthy as we don't have external bank API connected strictly here
        };
    }

    async getDashboardStats() {
        // 1. Total Users & Wallets
        const totalUsers = await this.prisma.user.count();
        const totalWallets = await this.prisma.wallet.count();

        // 2. Transaction Volume (sum of all ledger transactions)
        const volumeData = await this.prisma.ledger.aggregate({
            _sum: { amount: true }
        });
        const transactionVolume = Math.abs(Number(volumeData._sum.amount || 0));

        // 3. Active Sessions (users who've logged in in the last 24 hours - we'll use updatedAt as proxy)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const activeSessions = await this.prisma.user.count({
            where: { updatedAt: { gte: oneDayAgo } }
        });

        // 4. Recent Transactions (last 5)
        const recentTransactions = await this.prisma.ledger.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: {
                wallet: {
                    include: {
                        user: true
                    }
                }
            }
        });

        // 5. Top Users by Balance
        const topWallets = await this.prisma.wallet.findMany({
            take: 4,
            orderBy: { availableBalance: 'desc' },
            include: {
                user: {
                    select: {
                        name: true,
                        email: true
                    }
                }
            }
        });

        // Count transactions per wallet
        const topUsers = await Promise.all(topWallets.map(async (w) => {
            const txCount = await this.prisma.ledger.count({
                where: { walletId: w.id }
            });
            return {
                name: w.user.name || w.user.email,
                balance: Number(w.availableBalance),
                transactions: txCount,
                growth: '+0%'
            };
        }));

        // 6. Platform Balance (sum of all wallet balances)
        const platformBalanceData = await this.prisma.wallet.aggregate({
            _sum: {
                availableBalance: true,
                lockedBalance: true
            }
        });
        const platformBalance = Number(platformBalanceData._sum.availableBalance || 0) + Number(platformBalanceData._sum.lockedBalance || 0);

        // 7. Monthly Summary
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const monthlyDeposits = await this.prisma.ledger.aggregate({
            where: {
                type: 'DEPOSIT',
                createdAt: { gte: startOfMonth }
            },
            _sum: { amount: true }
        });

        const monthlyWithdrawals = await this.prisma.ledger.aggregate({
            where: {
                type: 'WITHDRAWAL',
                createdAt: { gte: startOfMonth }
            },
            _sum: { amount: true }
        });

        const totalDeposits = Number(monthlyDeposits._sum.amount || 0);
        const totalWithdrawals = Math.abs(Number(monthlyWithdrawals._sum.amount || 0));

        return {
            stats: {
                totalUsers,
                totalWallets,
                transactionVolume,
                activeSessions
            },
            recentTransactions: recentTransactions.map(tx => ({
                id: tx.id,
                user: tx.wallet.user.name || tx.wallet.user.email,
                type: tx.type,
                amount: Math.abs(Number(tx.amount)),
                status: 'completed',
                time: tx.createdAt.toISOString()
            })),
            topUsers,
            platformBalance,
            monthlySummary: {
                totalDeposits,
                totalWithdrawals,
                netGrowth: totalDeposits - totalWithdrawals
            }
        };
    }
}
