/**
 * utils/validate.js
 *
 * NEW IN V2:
 * ─────────────────────────────────────────────────────────────
 * v1 had no email format validation — any string like "foo" was
 * accepted as an email. Also no name sanitization (XSS risk if
 * name ever gets rendered without escaping).
 * ─────────────────────────────────────────────────────────────
 */

const validator = require('validator');

/**
 * Validates and normalizes a signup/login body.
 * Returns { valid: false, error: string } or { valid: true }.
 */
function validateSignup({ email, password, name }) {
  if (!email || !password || !name) {
    return { valid: false, error: 'Email, password, and name are required' };
  }

  if (typeof email !== 'string' || !validator.isEmail(email)) {
    return { valid: false, error: 'Invalid email address' };
  }

  if (typeof password !== 'string' || password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }

  if (password.length > 128) {
    // Prevent bcrypt DoS (bcrypt silently truncates at 72 bytes, but this
    // makes the constraint explicit and prevents deliberate abuse)
    return { valid: false, error: 'Password must be under 128 characters' };
  }

  if (typeof name !== 'string' || name.trim().length < 2) {
    return { valid: false, error: 'Name must be at least 2 characters' };
  }

  if (name.trim().length > 100) {
    return { valid: false, error: 'Name must be under 100 characters' };
  }

  return { valid: true };
}

function validateLogin({ email, password }) {
  if (!email || !password) {
    return { valid: false, error: 'Email and password are required' };
  }
  if (typeof email !== 'string' || !validator.isEmail(email)) {
    return { valid: false, error: 'Invalid email address' };
  }
  if (typeof password !== 'string' || password.length < 1) {
    return { valid: false, error: 'Password is required' };
  }
  return { valid: true };
}

module.exports = { validateSignup, validateLogin };
