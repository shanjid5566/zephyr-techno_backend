import nodemailer from 'nodemailer';
import AppError from './app-error.js';

class Mailer {
  constructor() {
    this.from = process.env.MAIL_FROM || process.env.MAIL_USER;
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT || 587),
      secure: String(process.env.MAIL_SECURE).toLowerCase() === 'true',
      auth: process.env.MAIL_USER && process.env.MAIL_PASS
        ? {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS,
          }
        : undefined,
    });
  }

  #assertConfigured() {
    if (!process.env.MAIL_HOST || !this.from) {
      throw new AppError('Mail service is not configured.', 500);
    }
  }

  #buildOtpMessage(title, otp, purpose, recipientName) {
    return `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
        <h2 style="margin-bottom:12px;">${title}</h2>
        <p>Hello${recipientName ? ` ${recipientName}` : ''},</p>
        <p>Your ${purpose} OTP is:</p>
        <div style="font-size:28px;font-weight:700;letter-spacing:6px;margin:20px 0;padding:16px 20px;background:#f3f4f6;display:inline-block;border-radius:8px;">${otp}</div>
        <p>This OTP expires shortly. If you did not request this, you can ignore this email.</p>
      </div>
    `;
  }

  async #sendMail({ to, subject, html }) {
    this.#assertConfigured();

    return this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      html,
    });
  }

  async sendEmailVerificationOtp({ to, otp, recipientName }) {
    return this.#sendMail({
      to,
      subject: 'Verify your email address',
      html: this.#buildOtpMessage('Email Verification', otp, 'email verification', recipientName),
    });
  }

  async sendPasswordResetOtp({ to, otp, recipientName }) {
    return this.#sendMail({
      to,
      subject: 'Password reset OTP',
      html: this.#buildOtpMessage('Password Reset', otp, 'password reset', recipientName),
    });
  }
}

export default Mailer;