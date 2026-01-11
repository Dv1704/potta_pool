// Security Test Suite for Transfer Feature
import { Test } from '@nestjs/testing';
import { TransferService } from './transfer.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
describe('TransferService Security Tests', () => {
    let service;
    let prisma;
    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                TransferService,
                {
                    provide: PrismaService,
                    useValue: {
                        $transaction: jest.fn(),
                        user: { findFirst: jest.fn() },
                        wallet: { updateMany: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
                        ledger: { createMany: jest.fn() }
                    }
                }
            ]
        }).compile();
        service = module.get(TransferService);
        prisma = module.get(PrismaService);
    });
    describe('Input Validation', () => {
        it('should reject negative amounts', async () => {
            await expect(service.initiateTransfer('sender-id', 'recipient@example.com', -100)).rejects.toThrow(BadRequestException);
        });
        it('should reject zero amounts', async () => {
            await expect(service.initiateTransfer('sender-id', 'recipient@example.com', 0)).rejects.toThrow(BadRequestException);
        });
        it('should reject amounts below minimum (1 GHS)', async () => {
            await expect(service.initiateTransfer('sender-id', 'recipient@example.com', 0.5)).rejects.toThrow(BadRequestException);
        });
    });
    describe('Authorization Checks', () => {
        it('should prevent self-transfer', async () => {
            const mockRecipient = {
                id: 'same-user-id',
                email: 'user@example.com',
                name: 'User',
                wallet: { id: 'wallet-1' }
            };
            jest.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
                return callback({
                    user: {
                        findFirst: jest.fn().mockResolvedValue(mockRecipient)
                    }
                });
            });
            await expect(service.initiateTransfer('same-user-id', 'user@example.com', 100)).rejects.toThrow('Cannot transfer to yourself');
        });
        it('should reject transfer to non-existent user', async () => {
            jest.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
                return callback({
                    user: {
                        findFirst: jest.fn().mockResolvedValue(null)
                    }
                });
            });
            await expect(service.initiateTransfer('sender-id', 'nonexistent@example.com', 100)).rejects.toThrow(NotFoundException);
        });
    });
    describe('Race Condition Protection', () => {
        it('should use atomic updateMany for balance check', async () => {
            const mockRecipient = {
                id: 'recipient-id',
                email: 'recipient@example.com',
                name: 'Recipient',
                wallet: { id: 'wallet-2', availableBalance: 100 }
            };
            const mockSenderWallet = {
                id: 'wallet-1',
                userId: 'sender-id',
                availableBalance: 500
            };
            const updateManySpy = jest.fn().mockResolvedValue({ count: 1 });
            jest.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
                return callback({
                    user: { findFirst: jest.fn().mockResolvedValue(mockRecipient) },
                    wallet: {
                        updateMany: updateManySpy,
                        update: jest.fn(),
                        findUnique: jest.fn().mockResolvedValue(mockSenderWallet)
                    },
                    ledger: { createMany: jest.fn() }
                });
            });
            await service.initiateTransfer('sender-id', 'recipient@example.com', 100);
            // Verify updateMany was called with balance check
            expect(updateManySpy).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({
                    userId: 'sender-id',
                    availableBalance: expect.objectContaining({ gte: expect.anything() })
                })
            }));
        });
        it('should reject transfer if insufficient funds (atomic check fails)', async () => {
            const mockRecipient = {
                id: 'recipient-id',
                email: 'recipient@example.com',
                wallet: { id: 'wallet-2' }
            };
            jest.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
                return callback({
                    user: { findFirst: jest.fn().mockResolvedValue(mockRecipient) },
                    wallet: {
                        updateMany: jest.fn().mockResolvedValue({ count: 0 }) // Atomic check failed
                    }
                });
            });
            await expect(service.initiateTransfer('sender-id', 'recipient@example.com', 100)).rejects.toThrow('Insufficient funds');
        });
    });
    describe('Audit Trail', () => {
        it('should create ledger entries for both sender and recipient', async () => {
            const mockRecipient = {
                id: 'recipient-id',
                email: 'recipient@example.com',
                name: 'Recipient',
                wallet: { id: 'wallet-2' }
            };
            const mockSenderWallet = {
                id: 'wallet-1',
                userId: 'sender-id',
                availableBalance: 500
            };
            const createManySpy = jest.fn();
            jest.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
                return callback({
                    user: { findFirst: jest.fn().mockResolvedValue(mockRecipient) },
                    wallet: {
                        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                        update: jest.fn(),
                        findUnique: jest.fn().mockResolvedValue(mockSenderWallet)
                    },
                    ledger: { createMany: createManySpy }
                });
            });
            await service.initiateTransfer('sender-id', 'recipient@example.com', 100);
            // Verify 2 ledger entries created
            expect(createManySpy).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.arrayContaining([
                    expect.objectContaining({ type: 'TRANSFER_OUT' }),
                    expect.objectContaining({ type: 'TRANSFER_IN' })
                ])
            }));
        });
    });
});
