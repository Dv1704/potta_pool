var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
let EmailService = class EmailService {
    configService;
    resend;
    constructor(configService) {
        this.configService = configService;
        const apiKey = this.configService.get('RESEND_API_KEY');
        if (!apiKey) {
            console.warn('RESEND_API_KEY is not set. Email sending will fail.');
        }
        this.resend = new Resend(apiKey);
    }
    async sendPasswordResetEmail(to, token) {
        try {
            const data = await this.resend.emails.send({
                from: 'Potta <onboarding@resend.dev>',
                to: [to],
                subject: 'Reset Your Potta Password',
                html: `
<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
    <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #6366f1; margin: 0;">Potta</h1>
        <p style="color: #6b7280; font-size: 14px;">Secure Your Gaming Experience</p>
    </div>
    <div style="padding: 20px; color: #374151; line-height: 1.6;">
        <h2 style="color: #111827; margin-top: 0;">Password Reset Request</h2>
        <p>Hello,</p>
        <p>We received a request to reset the password for your Potta account. Use the code below to complete the process:</p>
        <div style="background-color: #f3f4f6; padding: 15px; text-align: center; border-radius: 6px; margin: 25px 0;">
            <span style="font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #111827;">${token}</span>
        </div>
        <p>Copy and paste this token into the application to set a new password. This token will expire in 1 hour.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
    </div>
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #9ca3af; font-size: 12px;">
        <p>&copy; 2026 Potta App. All rights reserved.</p>
    </div>
</div>
                `,
            });
            return data;
        }
        catch (error) {
            console.error('Error sending email:', error);
            throw error;
        }
    }
};
EmailService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [ConfigService])
], EmailService);
export { EmailService };
