import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class EmailService {
    private readonly apiKey: string | undefined;

    constructor(@Inject(ConfigService) private configService: ConfigService) {
        this.apiKey = this.configService.get<string>('RESEND_API_KEY');
        if (!this.apiKey) {
            console.warn('RESEND_API_KEY is not set. Email sending will fail.');
        }
    }

    private getFromEmail(): string {
        return this.configService.get<string>('RESEND_FROM_EMAIL') || 'Potta <noreply@playpotta.com>';
    }

    private async postEmail(to: string, subject: string, html: string, from?: string) {
        if (!this.apiKey) {
            throw new Error('RESEND_API_KEY is not set');
        }

        const sender = from || this.getFromEmail();

        const response = await axios.post(
            'https://api.resend.com/emails',
            {
                from: sender,
                to: [to],
                subject,
                html,
            },
            {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        // Map response to match Resend SDK structure { data: { id }, error: null }
        return { data: response.data, error: null };
    }

    private wrapInTemplate(title: string, bodyContent: string): string {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        /* Mobile responsive styles */
        @media only screen and (max-width: 600px) {
            .container {
                width: 100% !important;
                border-radius: 0 !important;
                border: none !important;
            }
            .content {
                padding: 30px 20px !important;
            }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; min-height: 100%;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0b0f19; padding: 40px 10px;">
        <tr>
            <td align="center">
                <table class="container" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #111827; border: 1px solid #1f2937; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);">
                    <!-- Top accent line -->
                    <tr>
                        <td height="4" style="background: linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899); line-height: 4px; font-size: 0;">&nbsp;</td>
                    </tr>
                    
                    <!-- Header -->
                    <tr>
                        <td align="center" style="padding: 35px 20px; background-color: #1f2937;">
                            <h1 style="margin: 0; font-size: 38px; font-weight: 800; letter-spacing: 4px; font-family: 'Segoe UI', Arial, sans-serif;">
                                <span style="color: #a855f7;">POT</span><span style="color: #ec4899;">TA</span>
                            </h1>
                            <p style="color: #9ca3af; font-size: 11px; text-transform: uppercase; letter-spacing: 3px; margin: 8px 0 0 0; font-weight: 700;">Play • Compete • Win</p>
                        </td>
                    </tr>
                    
                    <!-- Body Content -->
                    <tr>
                        <td class="content" style="padding: 40px 35px; color: #e5e7eb; line-height: 1.6; font-size: 16px;">
                            ${bodyContent}
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td align="center" style="padding: 30px; background-color: #0b0f19; border-top: 1px solid #1f2937;">
                            <p style="margin: 0 0 12px 0; color: #9ca3af; font-size: 13px; font-weight: 600;">Connect with the Arena</p>
                            <table border="0" cellpadding="0" cellspacing="0" align="center">
                                <tr>
                                    <td>
                                        <a href="https://playpotta.com" style="color: #3b82f6; text-decoration: none; font-weight: 600; font-size: 14px;">Website</a>
                                    </td>
                                    <td style="color: #4b5563; padding: 0 10px; font-size: 14px;">•</td>
                                    <td>
                                        <a href="https://playpotta.com/support" style="color: #3b82f6; text-decoration: none; font-weight: 600; font-size: 14px;">Support Team</a>
                                    </td>
                                </tr>
                            </table>
                            <p style="margin: 20px 0 0 0; color: #4b5563; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; font-weight: 600;">&copy; 2026 POTTA App. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        `;
    }

    async sendPasswordResetEmail(to: string, token: string) {
        try {
            const html = this.wrapInTemplate(
                'Reset Your Potta Password',
                `
                <h2 style="color: #ffffff; margin-top: 0; font-size: 22px; font-weight: 700; border-bottom: 1px solid #374151; padding-bottom: 12px;">Password Reset Request 🔑</h2>
                <p style="color: #9ca3af; margin-top: 15px;">Hello,</p>
                <p style="color: #9ca3af;">We received a request to reset the password for your Potta account. Copy the code below to complete the reset process:</p>
                
                <div style="background-color: #1f2937; border: 1px dashed #3b82f6; padding: 25px; text-align: center; border-radius: 12px; margin: 30px 0; box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);">
                    <span style="font-size: 32px; font-weight: 800; letter-spacing: 4px; color: #3b82f6; display: block; margin-bottom: 5px;">${token}</span>
                    <span style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Reset Token</span>
                </div>
                
                <p style="color: #9ca3af; font-size: 14px; background-color: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.1); padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
                    <strong>⏰ Expiry:</strong> This token will expire in <strong>1 hour</strong>. If you did not request a password reset, your account is still secure and you can safely ignore this email.
                </p>
                `
            );
            return await this.postEmail(to, 'Reset Your Potta Password', html, 'Potta Security <security@playpotta.com>');
        } catch (error: any) {
            const errMsg = error.response?.data || error.message;
            console.error('Error sending password reset email:', errMsg);
            throw new Error(`Failed to send email: ${JSON.stringify(errMsg)}`);
        }
    }

    async sendEmail(to: string, subject: string, html: string) {
        try {
            return await this.postEmail(to, subject, html);
        } catch (error: any) {
            const errMsg = error.response?.data || error.message;
            console.error('Error sending email:', errMsg);
            throw new Error(`Failed to send email: ${JSON.stringify(errMsg)}`);
        }
    }

    async sendWelcomeEmail(to: string, name: string) {
        try {
            const html = this.wrapInTemplate(
                'Welcome to Potta!',
                `
                <h2 style="color: #ffffff; margin-top: 0; font-size: 22px; font-weight: 700; border-bottom: 1px solid #374151; padding-bottom: 12px;">Welcome to the Club, ${name}! 🚀</h2>
                <p style="color: #9ca3af; margin-top: 15px;">We are thrilled to welcome you to Potta, the ultimate platform for high-stakes HTML5 pool and competitive gaming.</p>
                <p style="color: #9ca3af;">Here are a few ways to get started in the arena:</p>
                
                <div style="margin: 30px 0;">
                    <div style="background-color: #1f2937; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 15px;">
                        <strong style="color: #ffffff; font-size: 16px; display: block; margin-bottom: 4px;">💳 Fund Your Wallet</strong>
                        <span style="color: #9ca3af; font-size: 14px;">Instantly deposit funds using Paystack or Korapay secure gateways and start playing.</span>
                    </div>
                    <div style="background-color: #1f2937; border-left: 4px solid #a855f7; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 15px;">
                        <strong style="color: #ffffff; font-size: 16px; display: block; margin-bottom: 4px;">🎱 Challenger Matches</strong>
                        <span style="color: #9ca3af; font-size: 14px;">Match up against real players, stake your tokens, and win real cash in multiplayer games.</span>
                    </div>
                    <div style="background-color: #1f2937; border-left: 4px solid #ec4899; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 15px;">
                        <strong style="color: #ffffff; font-size: 16px; display: block; margin-bottom: 4px;">👥 Affiliate Commissions</strong>
                        <span style="color: #9ca3af; font-size: 14px;">Invite your friends using your unique referral code and earn lifetime commissions on their games.</span>
                    </div>
                </div>
                
                <div style="text-align: center; margin-top: 35px; margin-bottom: 10px;">
                    <a href="https://playpotta.com" style="background: linear-gradient(90deg, #a855f7, #ec4899); color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 12px; font-weight: 700; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(168, 85, 247, 0.3);">Enter the Arena</a>
                </div>
                `
            );
            return await this.postEmail(to, 'Welcome to Potta!', html, 'Potta <hello@playpotta.com>');
        } catch (error: any) {
            const errMsg = error.response?.data || error.message;
            console.error('Error sending welcome email:', errMsg);
            throw new Error(`Failed to send welcome email: ${JSON.stringify(errMsg)}`);
        }
    }

    async sendVerificationCodeEmail(to: string, name: string, code: string) {
        try {
            const html = this.wrapInTemplate(
                'Verify Your Email Address',
                `
                <h2 style="color: #ffffff; margin-top: 0; font-size: 22px; font-weight: 700; border-bottom: 1px solid #374151; padding-bottom: 12px;">Verify Your Email Address 🔒</h2>
                <p style="color: #9ca3af; margin-top: 15px;">Hi ${name},</p>
                <p style="color: #9ca3af;">Please use the 6-digit verification code below to verify your email address on Potta. This adds an extra layer of security to your account.</p>
                
                <div style="background-color: #1f2937; border: 1px dashed #a855f7; padding: 25px; text-align: center; border-radius: 12px; margin: 30px 0; box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);">
                    <span style="font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #a855f7; display: block; margin-bottom: 5px;">${code}</span>
                    <span style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Verification Code</span>
                </div>
                
                <p style="color: #9ca3af; font-size: 14px; background-color: rgba(236, 72, 153, 0.05); border: 1px solid rgba(236, 72, 153, 0.1); padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
                    <strong>⚠️ Security Note:</strong> This code is only valid for <strong>10 minutes</strong>. Never share this code with anyone. Potta support will never ask for your code.
                </p>
                
                <p style="color: #6b7280; font-size: 13px;">If you did not initiate this request, you can safely ignore this email.</p>
                `
            );
            return await this.postEmail(to, 'Verify Your Email Address', html, 'Potta Security <security@playpotta.com>');
        } catch (error: any) {
            const errMsg = error.response?.data || error.message;
            console.error('Error sending verification code email:', errMsg);
            throw new Error(`Failed to send verification code email: ${JSON.stringify(errMsg)}`);
        }
    }

    async sendTransfer2faEmail(to: string, name: string, amount: number, recipientIdentifier: string, code: string) {
        try {
            const html = this.wrapInTemplate(
                'Transfer Confirmation Code',
                `
                <h2 style="color: #ffffff; margin-top: 0; font-size: 22px; font-weight: 700; border-bottom: 1px solid #374151; padding-bottom: 12px;">Confirm Your Transfer 💸</h2>
                <p style="color: #9ca3af; margin-top: 15px;">Hi ${name},</p>
                <p style="color: #9ca3af;">We detected a request to transfer funds from your Potta wallet. Please authorize the transaction using the confirmation details below:</p>
                
                <div style="background-color: #1f2937; border: 1px solid #374151; padding: 20px; border-radius: 12px; margin: 25px 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="color: #9ca3af; padding: 6px 0; font-size: 14px;">Staged Amount:</td>
                            <td style="color: #ffffff; padding: 6px 0; text-align: right; font-weight: 700; font-size: 16px;">${amount} GHS</td>
                        </tr>
                        <tr>
                            <td style="color: #9ca3af; padding: 6px 0; font-size: 14px;">Recipient:</td>
                            <td style="color: #ffffff; padding: 6px 0; text-align: right; font-weight: 700; font-size: 16px;">${recipientIdentifier}</td>
                        </tr>
                    </table>
                </div>
                
                <div style="background-color: #1f2937; border: 1px dashed #ef4444; padding: 20px; text-align: center; border-radius: 12px; margin: 25px 0;">
                    <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #ef4444; display: block; margin-bottom: 5px;">${code}</span>
                    <span style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Transaction Authorization Code</span>
                </div>
                
                <p style="color: #ef4444; font-size: 13px; background-color: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.1); padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
                    <strong>⚠️ Warning:</strong> Never share this code with anyone. Sharing this code can give them access to your funds. If you did not request this transfer, please secure your account immediately.
                </p>
                `
            );
            return await this.postEmail(to, 'Transfer Confirmation Code', html, 'Potta Security <security@playpotta.com>');
        } catch (error: any) {
            const errMsg = error.response?.data || error.message;
            console.error('Error sending transfer 2fa email:', errMsg);
            throw new Error(`Failed to send transfer 2fa email: ${JSON.stringify(errMsg)}`);
        }
    }

    async sendWithdrawal2faEmail(to: string, name: string, amount: number, mobileNumber: string, code: string) {
        try {
            const html = this.wrapInTemplate(
                'Withdrawal Confirmation Code',
                `
                <h2 style="color: #ffffff; margin-top: 0; font-size: 22px; font-weight: 700; border-bottom: 1px solid #374151; padding-bottom: 12px;">Confirm Your Withdrawal 💸</h2>
                <p style="color: #9ca3af; margin-top: 15px;">Hi ${name},</p>
                <p style="color: #9ca3af;">We detected a request to withdraw funds from your Potta wallet to mobile money. Please authorize the transaction using the details below:</p>
                
                <div style="background-color: #1f2937; border: 1px solid #374151; padding: 20px; border-radius: 12px; margin: 25px 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="color: #9ca3af; padding: 6px 0; font-size: 14px;">Withdrawal Amount:</td>
                            <td style="color: #ffffff; padding: 6px 0; text-align: right; font-weight: 700; font-size: 16px;">${amount} GHS</td>
                        </tr>
                        <tr>
                            <td style="color: #9ca3af; padding: 6px 0; font-size: 14px;">Mobile Number:</td>
                            <td style="color: #ffffff; padding: 6px 0; text-align: right; font-weight: 700; font-size: 16px;">${mobileNumber}</td>
                        </tr>
                    </table>
                </div>
                
                <div style="background-color: #1f2937; border: 1px dashed #ef4444; padding: 20px; text-align: center; border-radius: 12px; margin: 25px 0;">
                    <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #ef4444; display: block; margin-bottom: 5px;">${code}</span>
                    <span style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Withdrawal Authorization Code</span>
                </div>
                
                <p style="color: #ef4444; font-size: 13px; background-color: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.1); padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
                    <strong>⚠️ Warning:</strong> Never share this code with anyone. Sharing this code can give them access to your funds. If you did not request this withdrawal, please secure your account immediately.
                </p>
                `
            );
            return await this.postEmail(to, 'Withdrawal Confirmation Code', html, 'Potta Security <security@playpotta.com>');
        } catch (error: any) {
            const errMsg = error.response?.data || error.message;
            console.error('Error sending withdrawal 2fa email:', errMsg);
            throw new Error(`Failed to send withdrawal 2fa email: ${JSON.stringify(errMsg)}`);
        }
    }
}
