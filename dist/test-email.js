import { Resend } from 'resend';
import 'dotenv/config';
async function main() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.error('RESEND_API_KEY is missing');
        process.exit(1);
    }
    console.log('Using API Key:', apiKey.substring(0, 5) + '...');
    const resend = new Resend(apiKey);
    try {
        const data = await resend.emails.send({
            from: 'Potta <onboarding@resend.dev>',
            to: 'victorolanikanju@gmail.com',
            subject: 'Test Email - Potta Premium Design',
            html: `
<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
    <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #6366f1; margin: 0;">Potta</h1>
        <p style="color: #6b7280; font-size: 14px;">Secure Your Gaming Experience</p>
    </div>
    <div style="padding: 20px; color: #374151; line-height: 1.6;">
        <h2 style="color: #111827; margin-top: 0;">Verification Successful</h2>
        <p>Hello Victor,</p>
        <p>This is a test email with the new <strong>Premium HTML template</strong> for Potta.</p>
        <div style="background-color: #f3f4f6; padding: 15px; text-align: center; border-radius: 6px; margin: 25px 0;">
            <span style="font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #111827;">TEST-12345</span>
        </div>
        <p>Your email integration is working perfectly with the updated branding.</p>
    </div>
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #9ca3af; font-size: 12px;">
        <p>&copy; 2026 Potta App. All rights reserved.</p>
    </div>
</div>
            `
        });
        console.log('Email sent successfully:', data);
    }
    catch (error) {
        console.error('Failed to send email:', error);
    }
}
main();
