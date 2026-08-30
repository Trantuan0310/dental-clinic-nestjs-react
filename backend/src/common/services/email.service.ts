import { Injectable, Logger } from '@nestjs/common';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async send(options: EmailOptions): Promise<boolean> {
    const { to, subject, html, text } = options;

    if (process.env.EMAIL_MOCK === 'true') {
      this.logger.log(`[EMAIL_MOCK] To: ${to}`);
      this.logger.log(`[EMAIL_MOCK] Subject: ${subject}`);
      this.logger.log(`[EMAIL_MOCK] Body preview: ${html.substring(0, 200)}...`);
      return true;
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587');
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const fromAddress = process.env.EMAIL_FROM || 'noreply@clinic.com';

    if (!smtpHost || !smtpUser || !smtpPass) {
      this.logger.warn('[EmailService] SMTP not configured. Set EMAIL_MOCK=true for development.');
      return false;
    }

    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      await transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        html,
        text,
      });

      this.logger.log(`[EmailService] Email sent to ${to}: ${subject}`);
      return true;
    } catch (error) {
      this.logger.error(`[EmailService] Failed to send email to ${to}:`, error);
      return false;
    }
  }

  async sendPasswordResetEmail(
    to: string,
    resetUrl: string,
    expiresInMinutes: number,
  ): Promise<boolean> {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2BA3A0; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #2BA3A0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Đặt lại mật khẩu</h1>
    </div>
    <div class="content">
      <p>Xin chào,</p>
      <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản của mình.</p>
      <p>Vui lòng nhấp vào nút bên dưới để đặt lại mật khẩu:</p>
      <p style="text-align: center;">
        <a href="${resetUrl}" class="button">Đặt lại mật khẩu</a>
      </p>
      <p>Hoặc sao chép và dán đường link này vào trình duyệt:</p>
      <p style="word-break: break-all; color: #2BA3A0;">${resetUrl}</p>
      <p><strong>Liên kết này sẽ hết hạn sau ${expiresInMinutes} phút.</strong></p>
      <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
    </div>
    <div class="footer">
      <p>Email này được gửi tự động từ hệ thống Nha Khoa. Vui lòng không trả lời email này.</p>
    </div>
  </div>
</body>
</html>
`;

    const text = `
Đặt lại mật khẩu

Xin chào,

Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản của mình.

Vui lòng nhấp vào đường link bên dưới để đặt lại mật khẩu:
${resetUrl}

Liên kết này sẽ hết hạn sau ${expiresInMinutes} phút.

Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.

---
Email này được gửi tự động từ hệ thống Nha Khoa.
`;

    return this.send({
      to,
      subject: 'Yêu cầu đặt lại mật khẩu - Nha Khoa',
      html,
      text,
    });
  }
}
