// services/authService.js
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const supabase = require('../config/supabase');
const { AppError } = require('../middleware/errorHandler');
const { sendVerificationEmail, sendWelcomeEmail } = require('../utils/mailer');
const logger = require('../utils/logger');

const DUMMY_HASH = '$2a$12$dummyhashtopreventtimingattacksonmissingemail00000000000';

const signAccessToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

async function createRefreshToken(userId) {
  const token     = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const { error } = await supabase.from('refresh_tokens').insert({
    user_id: userId, token, expires_at: expiresAt.toISOString(),
  });
  if (error) throw new AppError('Failed to create session', 500);
  return token;
}

async function signup({ email, password, name }) {
  const password_hash    = await bcrypt.hash(password, 12);
  const email_token      = crypto.randomBytes(32).toString('hex');
  const token_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: user, error } = await supabase
    .from('users')
    .insert({ email: email.toLowerCase().trim(), password_hash, name: name.trim(), email_verified: false, email_token, token_expires_at })
    .select('id, email, name')
    .single();

  if (error) {
    if (error.code === '23505') throw new AppError('An account with this email already exists', 409);
    logger.error('[authService.signup] DB error', { msg: error.message });
    throw new AppError('Could not create account. Please try again.', 500);
  }

  // Send verification + welcome emails (fire-and-forget)
  sendVerificationEmail(user.email, email_token).catch(err =>
    logger.error('[authService.signup] Verification email failed', { msg: err.message })
  );
  sendWelcomeEmail(user.email, user.name).catch(err =>
    logger.error('[authService.signup] Welcome email failed', { msg: err.message })
  );

  return { id: user.id, email: user.email, name: user.name };
}

async function verifyEmail(token) {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email_verified, token_expires_at')
    .eq('email_token', token)
    .maybeSingle();

  if (error || !user) throw new AppError('Invalid or expired verification link', 400);
  if (user.email_verified) return { alreadyVerified: true };
  if (new Date(user.token_expires_at) < new Date())
    throw new AppError('Verification link has expired. Please request a new one.', 400);

  await supabase.from('users')
    .update({ email_verified: true, email_token: null, token_expires_at: null })
    .eq('id', user.id);

  return { alreadyVerified: false };
}

async function resendVerification(email) {
  const { data: user } = await supabase
    .from('users').select('id, email_verified')
    .eq('email', email.toLowerCase().trim()).maybeSingle();

  if (!user || user.email_verified) return;

  const email_token      = crypto.randomBytes(32).toString('hex');
  const token_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await supabase.from('users').update({ email_token, token_expires_at }).eq('id', user.id);
  sendVerificationEmail(email, email_token).catch(err =>
    logger.error('[authService.resend] Email failed', { msg: err.message })
  );
}

async function login({ email, password }) {
  const { data: user, error } = await supabase
    .from('users').select('id, email, name, password_hash, email_verified')
    .eq('email', email.toLowerCase().trim()).maybeSingle();

  const hashToCompare = user?.password_hash || DUMMY_HASH;
  const valid = await bcrypt.compare(password, hashToCompare);

  if (error || !user || !valid) throw new AppError('Invalid email or password', 401);
  if (!user.email_verified)
    throw new AppError('Please verify your email before logging in.', 403, 'EMAIL_NOT_VERIFIED');

  const accessToken  = signAccessToken(user);
  const refreshToken = await createRefreshToken(user.id);

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name },
  };
}

async function refresh(refreshToken) {
  const { data: record, error } = await supabase
    .from('refresh_tokens').select('user_id, expires_at, revoked')
    .eq('token', refreshToken).maybeSingle();

  if (error || !record)       throw new AppError('Invalid refresh token', 401);
  if (record.revoked)         throw new AppError('Refresh token has been revoked', 401);
  if (new Date(record.expires_at) < new Date())
    throw new AppError('Session expired. Please log in again.', 401);

  const { data: user } = await supabase
    .from('users').select('id, email, name').eq('id', record.user_id).single();

  if (!user) throw new AppError('User not found', 401);
  return { accessToken: signAccessToken(user) };
}

async function logout(refreshToken) {
  if (!refreshToken) return;
  await supabase.from('refresh_tokens').update({ revoked: true }).eq('token', refreshToken);
}

async function getMe(userId) {
  const { data: sub } = await supabase
    .from('subscriptions').select('plan, status, expires_at, razorpay_subscription_id')
    .eq('user_id', userId).eq('status', 'active')
    .gte('expires_at', new Date().toISOString()).maybeSingle();

  return { subscription: sub || null, isPaid: !!sub };
}

module.exports = { signup, verifyEmail, resendVerification, login, refresh, logout, getMe };
