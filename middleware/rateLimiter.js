/**
 * middleware/rateLimiter.js
 *
 * NEW IN V2:
 * ─────────────────────────────────────────────────────────────
 * v1 had NO rate limiting on auth endpoints.
 * An attacker could brute-force passwords at unlimited speed.
 * Production MUST rate-limit signup, login, and payment creation.
 * ─────────────────────────────────────────────────────────────
 */

const rateLimit = require('express-rate-limit');

// Strict limiter for auth endpoints — prevents brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 20,                    // max 20 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait 15 minutes and try again.' },
  skipSuccessfulRequests: true, // only count failed attempts toward limit
});

// Looser limiter for API endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

// Strict limiter for payment creation — prevents order spam
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,                   // max 10 payment attempts per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment attempts. Please try again later.' },
});

module.exports = { authLimiter, apiLimiter, paymentLimiter };
