import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomInt } from 'node:crypto';
import prisma from '../utils/prisma.js';
import Mailer from '../utils/mailer.js';
import AppError from '../utils/app-error.js';

class AuthService {
  constructor() {
    this.mailer = new Mailer();
    this.passwordSaltRounds = 12;
    this.otpSaltRounds = 10;
    this.otpLength = 6;
    this.otpExpiryMinutes = Number(process.env.OTP_EXPIRES_MINUTES || 10);
    this.jwtSecret = process.env.JWT_SECRET;
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '1d';
  }

  async register(payload) {
    const firstName = this.#requireString(payload.firstName, 'First name');
    const lastName = this.#requireString(payload.lastName, 'Last name');
    const email = this.#normalizeEmail(payload.email);
    const phone = payload.phone ? String(payload.phone).trim() : null;
    const password = this.#requireString(payload.password, 'Password');

    if (password.length < 8) {
      throw new AppError('Password must be at least 8 characters long.', 400);
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser && existingUser.isEmailVerified) {
      throw new AppError('An account with this email already exists.', 409);
    }

    const passwordHash = await bcrypt.hash(password, this.passwordSaltRounds);
    const emailVerificationOtp = this.#generateOtp();
    const emailVerificationOtpHash = await bcrypt.hash(emailVerificationOtp, this.otpSaltRounds);
    const otpExpiresAt = this.#buildOtpExpiry();

    const userData = {
      firstName,
      lastName,
      email,
      phone,
      passwordHash,
      isEmailVerified: false,
      emailVerifiedAt: null,
      emailVerificationOtpHash,
      emailVerificationOtpExpiresAt: otpExpiresAt,
      passwordResetOtpHash: null,
      passwordResetOtpExpiresAt: null,
      passwordResetOtpVerifiedAt: null,
    };

    const user = existingUser
      ? await prisma.user.update({
          where: { email },
          data: userData,
        })
      : await prisma.user.create({
          data: userData,
        });

    await this.mailer.sendEmailVerificationOtp({
      to: user.email,
      otp: emailVerificationOtp,
      recipientName: user.firstName,
    });

    return {
      message: 'Registration successful. Verification OTP sent to your email.',
      user: this.#sanitizeUser(user),
    };
  }

  async verifyEmail(payload) {
    const email = this.#normalizeEmail(payload.email);
    const otp = this.#requireString(payload.otp, 'OTP');

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new AppError('Account not found.', 404);
    }

    if (user.isEmailVerified) {
      return {
        message: 'Email is already verified.',
        user: this.#sanitizeUser(user),
      };
    }

    await this.#validateStoredOtp({
      otp,
      storedHash: user.emailVerificationOtpHash,
      expiresAt: user.emailVerificationOtpExpiresAt,
      errorMessage: 'Invalid or expired email verification OTP.',
    });

    const updatedUser = await prisma.user.update({
      where: { email },
      data: {
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationOtpHash: null,
        emailVerificationOtpExpiresAt: null,
      },
    });

    return {
      message: 'Email verified successfully.',
      user: this.#sanitizeUser(updatedUser),
    };
  }

  async login(payload) {
    const email = this.#normalizeEmail(payload.email);
    const password = this.#requireString(payload.password, 'Password');

    this.#requireJwtSecret();

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new AppError('Invalid email or password.', 404);
    }

    if (!user.isEmailVerified) {
      throw new AppError('Please verify your email before logging in.', 403);
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new AppError('Invalid email or password.', 401);
    }

    const accessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      this.jwtSecret,
      {
        expiresIn: this.jwtExpiresIn,
      },
    );

    return {
      message: 'Login successful.',
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.jwtExpiresIn,
      user: this.#sanitizeUser(user),
    };
  }

  async forgotPassword(payload) {
    const email = this.#normalizeEmail(payload.email);
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return {
        message: 'If the account exists, a password reset OTP has been sent.',
      };
    }

    const resetOtp = this.#generateOtp();
    const resetOtpHash = await bcrypt.hash(resetOtp, this.otpSaltRounds);

    await prisma.user.update({
      where: { email },
      data: {
        passwordResetOtpHash: resetOtpHash,
        passwordResetOtpExpiresAt: this.#buildOtpExpiry(),
        passwordResetOtpVerifiedAt: null,
      },
    });

    await this.mailer.sendPasswordResetOtp({
      to: user.email,
      otp: resetOtp,
      recipientName: user.firstName,
    });

    return {
      message: 'If the account exists, a password reset OTP has been sent.',
    };
  }

  async verifyResetOtp(payload) {
    const email = this.#normalizeEmail(payload.email);
    const otp = this.#requireString(payload.otp, 'OTP');

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new AppError('Invalid or expired password reset OTP.', 400);
    }

    await this.#validateStoredOtp({
      otp,
      storedHash: user.passwordResetOtpHash,
      expiresAt: user.passwordResetOtpExpiresAt,
      errorMessage: 'Invalid or expired password reset OTP.',
    });

    await prisma.user.update({
      where: { email },
      data: {
        passwordResetOtpVerifiedAt: new Date(),
      },
    });

    return {
      message: 'OTP verified successfully. You can now reset your password.',
    };
  }

  async resetPassword(payload) {
    const email = this.#normalizeEmail(payload.email);
    const newPassword = this.#requireString(payload.newPassword, 'New password');

    if (newPassword.length < 8) {
      throw new AppError('New password must be at least 8 characters long.', 400);
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new AppError('Account not found.', 404);
    }

    if (!user.passwordResetOtpVerifiedAt || !user.passwordResetOtpExpiresAt || !user.passwordResetOtpHash) {
      throw new AppError('Please verify the reset OTP before resetting your password.', 400);
    }

    if (user.passwordResetOtpExpiresAt < new Date()) {
      throw new AppError('Password reset OTP has expired.', 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, this.passwordSaltRounds);

    const updatedUser = await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        passwordResetOtpHash: null,
        passwordResetOtpExpiresAt: null,
        passwordResetOtpVerifiedAt: null,
      },
    });

    return {
      message: 'Password reset successfully.',
      user: this.#sanitizeUser(updatedUser),
    };
  }

  async #validateStoredOtp({ otp, storedHash, expiresAt, errorMessage }) {
    if (!storedHash || !expiresAt) {
      throw new AppError(errorMessage, 400);
    }

    if (expiresAt < new Date()) {
      throw new AppError(errorMessage, 400);
    }

    const matches = await bcrypt.compare(String(otp).trim(), storedHash);

    if (!matches) {
      throw new AppError(errorMessage, 400);
    }
  }

  #generateOtp() {
    const min = 10 ** (this.otpLength - 1);
    const max = 10 ** this.otpLength;

    return String(randomInt(min, max));
  }

  #requireJwtSecret() {
    if (!this.jwtSecret) {
      throw new AppError('JWT_SECRET is not configured.', 500);
    }

    return this.jwtSecret;
  }

  #buildOtpExpiry() {
    return new Date(Date.now() + this.otpExpiryMinutes * 60 * 1000);
  }

  #normalizeEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail) {
      throw new AppError('Email is required.', 400);
    }

    return normalizedEmail;
  }

  #requireString(value, fieldName) {
    const result = String(value || '').trim();

    if (!result) {
      throw new AppError(`${fieldName} is required.`, 400);
    }

    return result;
  }

  #sanitizeUser(user) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

export default AuthService;