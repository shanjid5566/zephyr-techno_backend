import AuthService from '../services/auth.service.js';

class AuthController {
  constructor(authService = new AuthService()) {
    this.authService = authService;

    this.register = this.register.bind(this);
    this.verifyEmail = this.verifyEmail.bind(this);
    this.login = this.login.bind(this);
    this.forgotPassword = this.forgotPassword.bind(this);
    this.verifyResetOtp = this.verifyResetOtp.bind(this);
    this.resetPassword = this.resetPassword.bind(this);
  }

  async register(req, res, next) {
    try {
      const result = await this.authService.register(req.body);
      return res.status(201).json({ success: true, ...result });
    } catch (error) {
      return next(error);
    }
  }

  async verifyEmail(req, res, next) {
    try {
      const result = await this.authService.verifyEmail(req.body);
      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      return next(error);
    }
  }

  async login(req, res, next) {
    try {
      const result = await this.authService.login(req.body);
      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      return next(error);
    }
  }

  async forgotPassword(req, res, next) {
    try {
      const result = await this.authService.forgotPassword(req.body);
      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      return next(error);
    }
  }

  async verifyResetOtp(req, res, next) {
    try {
      const result = await this.authService.verifyResetOtp(req.body);
      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      return next(error);
    }
  }

  async resetPassword(req, res, next) {
    try {
      const result = await this.authService.resetPassword(req.body);
      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      return next(error);
    }
  }
}

export default new AuthController();