const validator = require('validator');

function validateSignup({ email, password, name } = {}) {
  if (!email || !password || !name)
    return { valid: false, error: 'Email, password, and name are required' };

  if (typeof email !== 'string' || !validator.isEmail(email))
    return { valid: false, error: 'Invalid email address' };

  if (typeof password !== 'string' || password.length < 8)
    return { valid: false, error: 'Password must be at least 8 characters' };

  if (password.length > 128)
    return { valid: false, error: 'Password must be under 128 characters' };

  if (typeof name !== 'string' || name.trim().length < 2)
    return { valid: false, error: 'Name must be at least 2 characters' };

  if (name.trim().length > 100)
    return { valid: false, error: 'Name must be under 100 characters' };

  return { valid: true };
}

function validateLogin({ email, password } = {}) {
  if (!email || !password)
    return { valid: false, error: 'Email and password are required' };

  if (typeof email !== 'string' || !validator.isEmail(email))
    return { valid: false, error: 'Invalid email address' };

  if (typeof password !== 'string' || password.length < 1)
    return { valid: false, error: 'Password is required' };

  return { valid: true };
}

module.exports = { validateSignup, validateLogin };
