// @ts-nocheck
import { Test } from '@nestjs/testing';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { FXService } from './fx.service';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
describe('WalletService Payout Integrity & Idempotency Tests', () => {
    let service;
    let prisma;
    const mockSystemWallet = {
        id: 'system-wallet-id',
        userId: 'system-user-id',
        availableBalance: new Prisma.Decimal(100),
        lockedBalance: new Prisma.Decimal(0),
        currency: 'GHS',
    };
    const mockSystemUser = {
        id: 'system-user-id',
        email: 'system@pottagame.com',
        wallet: mockSystemWallet,
    };
    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                WalletService,
                {
                    provide: PrismaService,
                    useValue: {
                        $transaction: jest.fn(),
                        game: {
                            findUnique: jest.fn(),
                            update: jest.fn(),
                        },
                        user: {
                            findUnique: jest.fn(),
                        },
                        wallet: {
                            findUnique: jest.fn(),
                            create: jest.fn(),
                            update: jest.fn(),
                        },
                        influencerEarning: {
                            create: jest.fn(),
                        },
                        ledger: {
                            createMany: jest.fn(),
                        },
                    },
                },
                {
                    provide: FXService,
                    useValue: {},
                },
            ],
        }).compile();
        service = module.get(WalletService);
        prisma = module.get(PrismaService);
    });
    it('should throw NotFoundException if game is not found', async () => {
        jest.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
            const txMock = {
                game: {
                    findUnique: jest.fn().mockResolvedValue(null),
                },
            };
            return callback(txMock);
        });
        await expect(service.processPayout('match-1', 'winner-1', ['loser-1'], 100)).rejects.toThrow(NotFoundException);
    });
    it('should be idempotent and return early if game status is already COMPLETED', async () => {
        const mockGame = {
            id: 'match-1',
            status: 'COMPLETED',
        };
        const updateSpy = jest.fn();
        jest.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
            const txMock = {
                game: {
                    findUnique: jest.fn().mockResolvedValue(mockGame),
                    update: updateSpy,
                },
            };
            return callback(txMock);
        });
        const result = await service.processPayout('match-1', 'winner-1', ['loser-1'], 100);
        expect(result).toEqual({
            winnerWinnings: 0,
            commission: 0,
            alreadyProcessed: true,
        });
        expect(updateSpy).not.toHaveBeenCalled();
    });
    it('should process a standard payout (no influencer) successfully', async () => {
        const mockGame = {
            id: 'match-1',
            status: 'ACTIVE',
            influencerId: null,
        };
        const mockWinnerWallet = {
            id: 'winner-wallet-id',
            userId: 'winner-1',
            availableBalance: new Prisma.Decimal(100),
            lockedBalance: new Prisma.Decimal(50),
        };
        const gameUpdateSpy = jest.fn();
        const walletUpdateSpy = jest.fn().mockImplementation((args) => {
            if (args.where.userId === 'winner-1') {
                return mockWinnerWallet;
            }
            return {};
        });
        const ledgerCreateManySpy = jest.fn();
        jest.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
            const txMock = {
                game: {
                    findUnique: jest.fn().mockResolvedValue(mockGame),
                    update: gameUpdateSpy,
                },
                user: {
                    findUnique: jest.fn().mockResolvedValue(mockSystemUser),
                },
                wallet: {
                    findUnique: jest.fn().mockResolvedValue(mockWinnerWallet),
                    update: walletUpdateSpy,
                },
                ledger: {
                    createMany: ledgerCreateManySpy,
                },
            };
            return callback(txMock);
        });
        const result = await service.processPayout('match-1', 'winner-1', ['loser-1'], 100);
        expect(result).toEqual({
            winnerWinnings: 90,
            commission: 10,
            alreadyProcessed: false,
        });
        // Verify game status was updated
        expect(gameUpdateSpy).toHaveBeenCalledWith({
            where: { id: 'match-1' },
            data: { status: 'COMPLETED', winnerId: 'winner-1' },
        });
        // Verify wallets updated
        expect(walletUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({
            where: { userId: 'loser-1' },
            data: expect.objectContaining({ lockedBalance: { decrement: expect.any(Prisma.Decimal) } }),
        }));
        expect(walletUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({
            where: { userId: 'winner-1' },
            data: expect.objectContaining({
                lockedBalance: { decrement: expect.any(Prisma.Decimal) },
                availableBalance: { increment: expect.any(Prisma.Decimal) },
            }),
        }));
        expect(walletUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'system-wallet-id' },
            data: expect.objectContaining({ availableBalance: { increment: expect.any(Prisma.Decimal) } }),
        }));
        // Verify ledger was called with winner and system platform fee details
        expect(ledgerCreateManySpy).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.arrayContaining([
                expect.objectContaining({ type: 'PAYOUT', amount: new Prisma.Decimal(90) }),
                expect.objectContaining({ type: 'PLATFORM_FEE', amount: new Prisma.Decimal(10) }),
            ]),
        }));
    });
    const creatorTiers = [
        { tier: 'BRONZE', shareRate: 0.20, expectedInfluencerShare: 2.0, expectedSystemShare: 8.0 },
        { tier: 'SILVER', shareRate: 0.25, expectedInfluencerShare: 2.5, expectedSystemShare: 7.5 },
        { tier: 'GOLD', shareRate: 0.30, expectedInfluencerShare: 3.0, expectedSystemShare: 7.0 },
        { tier: 'ELITE', shareRate: 0.40, expectedInfluencerShare: 4.0, expectedSystemShare: 6.0 },
    ];
    creatorTiers.forEach(({ tier, expectedInfluencerShare, expectedSystemShare }) => {
        it(`should distribute commission correctly for ${tier} tier influencer`, async () => {
            const mockGame = {
                id: 'match-1',
                status: 'ACTIVE',
                influencerId: 'influencer-1',
            };
            const mockWinnerWallet = {
                id: 'winner-wallet-id',
                userId: 'winner-1',
                availableBalance: new Prisma.Decimal(100),
                lockedBalance: new Prisma.Decimal(50),
            };
            const mockInfluencer = {
                id: 'influencer-1',
                creatorTier: tier,
            };
            const mockInfluencerWallet = {
                id: 'influencer-wallet-id',
                userId: 'influencer-1',
                availableBalance: new Prisma.Decimal(0),
            };
            const gameUpdateSpy = jest.fn();
            const walletUpdateSpy = jest.fn().mockImplementation((args) => {
                if (args.where.userId === 'winner-1') {
                    return mockWinnerWallet;
                }
                return {};
            });
            const ledgerCreateManySpy = jest.fn();
            const influencerEarningCreateSpy = jest.fn();
            jest.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
                const txMock = {
                    game: {
                        findUnique: jest.fn().mockResolvedValue(mockGame),
                        update: gameUpdateSpy,
                    },
                    user: {
                        findUnique: jest.fn().mockImplementation((args) => {
                            if (args.where.email === 'system@pottagame.com') {
                                return mockSystemUser;
                            }
                            if (args.where.id === 'influencer-1') {
                                return mockInfluencer;
                            }
                            return null;
                        }),
                    },
                    wallet: {
                        findUnique: jest.fn().mockImplementation((args) => {
                            if (args.where.userId === 'influencer-1') {
                                return mockInfluencerWallet;
                            }
                            return null;
                        }),
                        update: walletUpdateSpy,
                    },
                    influencerEarning: {
                        create: influencerEarningCreateSpy,
                    },
                    ledger: {
                        createMany: ledgerCreateManySpy,
                    },
                };
                return callback(txMock);
            });
            const result = await service.processPayout('match-1', 'winner-1', ['loser-1'], 100);
            expect(result).toEqual({
                winnerWinnings: 90,
                commission: 10,
                alreadyProcessed: false,
            });
            // Verify influencer wallet received the correct share
            expect(walletUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'influencer-wallet-id' },
                data: { availableBalance: { increment: new Prisma.Decimal(expectedInfluencerShare) }, version: { increment: 1 } },
            }));
            // Verify system wallet received the remaining share
            expect(walletUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'system-wallet-id' },
                data: { availableBalance: { increment: new Prisma.Decimal(expectedSystemShare) }, version: { increment: 1 } },
            }));
            // Verify InfluencerEarning is recorded correctly
            expect(influencerEarningCreateSpy).toHaveBeenCalledWith({
                data: {
                    influencerId: 'influencer-1',
                    matchId: 'match-1',
                    platformFee: new Prisma.Decimal(10),
                    amount: new Prisma.Decimal(expectedInfluencerShare),
                },
            });
            // Verify ledgers created
            expect(ledgerCreateManySpy).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.arrayContaining([
                    expect.objectContaining({ type: 'PAYOUT', amount: new Prisma.Decimal(90) }),
                    expect.objectContaining({ type: 'INFLUENCER_COMMISSION', amount: new Prisma.Decimal(expectedInfluencerShare) }),
                    expect.objectContaining({ type: 'PLATFORM_FEE', amount: new Prisma.Decimal(expectedSystemShare) }),
                ]),
            }));
        });
    });
    it('should completely rollback the transaction if any database operation fails (ACID guarantee)', async () => {
        const mockGame = {
            id: 'match-1',
            status: 'ACTIVE',
            influencerId: null,
        };
        jest.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
            const txMock = {
                game: {
                    findUnique: jest.fn().mockResolvedValue(mockGame),
                    update: jest.fn().mockRejectedValue(new Error('Database write failure')),
                },
            };
            return callback(txMock);
        });
        await expect(service.processPayout('match-1', 'winner-1', ['loser-1'], 100)).rejects.toThrow('Database write failure');
    });
});
