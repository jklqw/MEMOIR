import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { AppConfigService } from '../config/config.service.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter;

  constructor(private readonly config: AppConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST'),
      port: this.config.get('SMTP_PORT'),
      ignoreTLS: true,
    });
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const webUrl = this.config.get('WEB_URL');
    const verifyUrl = `${webUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const from = this.config.get('SMTP_FROM');

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: 'Verify your Memoir email address',
        text: `Welcome to Memoir.\n\nPlease verify your email address by opening the following link:\n\n${verifyUrl}\n\nThis verification link expires in 24 hours.\n\nIf you did not create a Memoir account, you can safely ignore this email.`,
        html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Verify your Memoir email address</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #faf9f5; color: #1e1e1e; padding: 40px 20px;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e4de; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
    <h1 style="font-family: Georgia, serif; font-size: 24px; font-weight: normal; margin-top: 0; margin-bottom: 16px; color: #181816;">Memoir</h1>
    <p style="font-size: 15px; line-height: 1.6; color: #3b3a36; margin-bottom: 24px;">Welcome to Memoir. Before you initialize your zero-knowledge vault, please verify your email address.</p>
    <div style="margin-bottom: 28px;">
      <a href="${verifyUrl}" style="display: inline-block; background-color: #1f2328; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500;">Verify Email Address</a>
    </div>
    <p style="font-size: 13px; color: #73726c; line-height: 1.5; margin-bottom: 8px;">Or copy and paste this link into your browser:</p>
    <p style="font-size: 12px; word-break: break-all; color: #57564f; background: #f5f4ef; padding: 8px 12px; border-radius: 4px;">${verifyUrl}</p>
    <hr style="border: none; border-top: 1px solid #e5e4de; margin: 24px 0;" />
    <p style="font-size: 12px; color: #9c9a92; margin-bottom: 0;">This link will expire in 24 hours. If you did not register for Memoir, no action is required.</p>
  </div>
</body>
</html>
`,
      });
      this.logger.log(`Verification email dispatched to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${to}: ${(error as Error).message}`);
    }
  }
}
