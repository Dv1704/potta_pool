import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { jest } from '@jest/globals';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { EmailService } from './../src/email/email.service.js';
describe('Auth & User System (E2E)', () => {
    let app;
    let prisma;
    let userToken;
    let adminToken;
    let resetToken;
    const testUserEmail = 'testuser@example.com';
    const testAdminEmail = 'testadmin@example.com';
    const emailServiceMock = {
        sendPasswordResetEmail: jest.fn().mockResolvedValue({ id: 'mock-id' }),
    };
    // ...
    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(EmailService)
            .useValue(emailServiceMock)
            .compile();
        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe()); // Enable DTO validation
        await app.init();
        prisma = app.get(PrismaService);
        // Cleanup
        await prisma.user.deleteMany({ where: { email: { in: [testUserEmail, testAdminEmail] } } });
    });
    afterAll(async () => {
        // Cleanup
        await prisma.user.deleteMany({ where: { email: { in: [testUserEmail, testAdminEmail] } } });
        await app.close();
    });
    it('/auth/register (POST) - Register new user', () => {
        return request(app.getHttpServer())
            .post('/auth/register')
            .send({
            email: testUserEmail,
            password: 'password123',
            name: 'Test User',
        })
            .expect(201)
            .expect((res) => {
            expect(res.body.email).toBe(testUserEmail);
            expect(res.body.role).toBe('USER');
            expect(res.body.id).toBeDefined();
            expect(res.body.password).toBeUndefined(); // Ensure password is sanitized
        });
    });
    it('/auth/login (POST) - Login and get JWT', () => {
        return request(app.getHttpServer())
            .post('/auth/login')
            .send({
            email: testUserEmail,
            password: 'password123',
        })
            .expect(201)
            .expect((res) => {
            expect(res.body.access_token).toBeDefined();
            userToken = res.body.access_token;
        });
    });
    it('/auth/profile (GET) - Access protected profile', () => {
        return request(app.getHttpServer())
            .get('/auth/profile')
            .set('Authorization', `Bearer ${userToken}`)
            .expect(200)
            .expect((res) => {
            expect(res.body.email).toBe(testUserEmail);
        });
    });
    // --- Admin Flow ---
    it('Create Admin User (Manual via DB)', async () => {
        const hashedPassword = await import('bcrypt').then(b => b.hash('adminpass', 10));
        const admin = await prisma.user.create({
            data: {
                email: testAdminEmail,
                password: hashedPassword,
                name: 'Admin User',
                role: 'ADMIN',
            },
        });
        // Login as Admin
        const res = await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email: testAdminEmail, password: 'adminpass' })
            .expect(201);
        adminToken = res.body.access_token;
        expect(adminToken).toBeDefined();
    });
    it('/users/:id/ban (PATCH) - User cannot ban users', async () => {
        const user = await prisma.user.findUnique({ where: { email: testUserEmail } });
        return request(app.getHttpServer())
            .patch(`/users/${user?.id}/ban`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({ isBanned: true })
            .expect(403);
    });
    it('/users/:id/ban (PATCH) - Admin can ban users', async () => {
        const user = await prisma.user.findUnique({ where: { email: testUserEmail } });
        return request(app.getHttpServer())
            .patch(`/users/${user?.id}/ban`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ isBanned: true })
            .expect(200);
    });
    it('/auth/login (POST) - Banned user cannot login', () => {
        return request(app.getHttpServer())
            .post('/auth/login')
            .send({
            email: testUserEmail,
            password: 'password123',
        })
            .expect(401);
    });
    // --- Password Reset Flow ---
    it('/auth/forgot-password (POST) - Request token', async () => {
        await request(app.getHttpServer())
            .post('/auth/forgot-password')
            .send({ email: testUserEmail })
            .expect(201)
            .expect((res) => {
            expect(res.body.message).toContain('email');
        });
        // Extract token from mock call
        expect(emailServiceMock.sendPasswordResetEmail).toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const args = emailServiceMock.sendPasswordResetEmail.mock.calls[0];
        expect(args[0]).toBe(testUserEmail);
        resetToken = args[1];
        expect(resetToken).toBeDefined();
    });
    it('/auth/reset-password (POST) - Reset with valid token', () => {
        return request(app.getHttpServer())
            .post('/auth/reset-password')
            .send({
            email: testUserEmail,
            token: resetToken,
            newPassword: 'newpassword123'
        })
            .expect(201);
    });
    it('/auth/login (POST) - Login with new password', async () => {
        // Unban first to allow login
        const user = await prisma.user.findUnique({ where: { email: testUserEmail } });
        await prisma.user.update({ where: { id: user?.id }, data: { isBanned: false } });
        return request(app.getHttpServer())
            .post('/auth/login')
            .send({
            email: testUserEmail,
            password: 'newpassword123',
        })
            .expect(201);
    });
});
