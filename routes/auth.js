// routes/auth.js — thin route layer, logic in services/authService.js
const express = require('express');
const crypto   = require('crypto');
const bcrypt   = require('bcryptjs');
const { authenticate } = require('../middleware/auth');
const { authLimiter }  = require('../middleware/rateLimiter');
const { validateSignup, validateLogin } = require('../utils/validate');
const authService = require('../services/authService');
const { AppError } = require('../middleware/errorHandler');
const supabase = require('../config/supabase');
const { sendResetEmail } = require('../utils/mailer');

const router = express.Router();
router.use(authLimiter);

router.post('/signup', async (req, res, next) => {
  try {
    const v = validateSignup(req.body);
    if (!v.valid) return next(new AppError(v.error, 400));
    const user = await authService.signup(req.body);
    res.status(201).json({ message: 'Account created. Please check your email to verify your account.', user });
  } catch (err) { next(err); }
});

router.get('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return next(new AppError('Missing token', 400));
    const result = await authService.verifyEmail(token);
    const dest = result.alreadyVerified ? '13X_Investments_new.html?verified=already' : '13X_Investments_new.html?verified=true';
    res.redirect(`${process.env.FRONTEND_URL}/${dest}`);
  } catch (err) { next(err); }
});

router.post('/resend-verification', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return next(new AppError('Email is required', 400));
    await authService.resendVerification(email);
    res.json({ message: 'If that email exists and is unverified, a new link has been sent.' });
  } catch (err) { next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    const v = validateLogin(req.body);
    if (!v.valid) return next(new AppError(v.error, 400));
    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return next(new AppError('Refresh token required', 400));
    const result = await authService.refresh(refreshToken);
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/logout', async (req, res, next) => {
  try {
    await authService.logout(req.body?.refreshToken);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const data = await authService.getMe(req.user.id);
    res.json({ user: { id: req.user.id, email: req.user.email, name: req.user.name }, ...data });
  } catch (err) { next(err); }
});

// ── Forgot Password ──────────────────────────────────────────
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return next(new AppError('Email is required', 400));

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1000 * 60 * 15).toISOString(); // 15 min

    await supabase
      .from('users')
      .update({ reset_token: token, reset_token_expires: expires })
      .eq('email', email.toLowerCase().trim());

    const link = `${process.env.BACKEND_URL}/api/v1/auth/reset-password?token=${token}`;
    await sendResetEmail(email, link);

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) { next(err); }
});

// ── Verify Reset Token (redirect to frontend) ─────────────────
router.get('/reset-password', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return next(new AppError('Missing token', 400));

    const { data: user } = await supabase
      .from('users')
      .select('id, reset_token_expires')
      .eq('reset_token', token)
      .maybeSingle();

    if (!user || new Date(user.reset_token_expires) < new Date()) {
      return res.status(400).send('Invalid or expired reset link.');
    }

    res.redirect(`${process.env.FRONTEND_URL}/13X_Investments_new.html?reset=true&token=${token}`);
  } catch (err) { next(err); }
});

// ── Reset Password ────────────────────────────────────────────
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return next(new AppError('Token and new password are required', 400));
    if (newPassword.length < 8) return next(new AppError('Password must be at least 8 characters', 400));

    const { data: user } = await supabase
      .from('users')
      .select('id, reset_token_expires')
      .eq('reset_token', token)
      .maybeSingle();

    if (!user || new Date(user.reset_token_expires) < new Date()) {
      return next(new AppError('Invalid or expired reset token', 400));
    }

    const password_hash = await bcrypt.hash(newPassword, 12);

    await supabase
      .from('users')
      .update({ password_hash, reset_token: null, reset_token_expires: null })
      .eq('id', user.id);

    res.json({ message: 'Password reset successful' });
  } catch (err) { next(err); }
});

module.exports = router;
