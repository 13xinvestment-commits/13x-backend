// middleware/errorHandler.js
// Central error handler — attach LAST in server.js (after all routes).
// Routes just do: next(err) or throw, this handles the rest.

const logger = require('../utils/logger');

class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;       // optional machine-readable code e.g. 'EMAIL_NOT_VERIFIED'
    this.isOperational = true;
  }
}

// 404 handler — place before errorHandler in server.js
function notFound(req, res, next) {
  const err = new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND');
  next(err);
}

// Global error handler
function errorHandler(err, req, res, next) {
  const status  = err.statusCode || err.status || 500;
  const message = err.isOperational ? err.message : 'Internal server error';

  logger.error(err.message, {
    status,
    method:  req.method,
    url:     req.originalUrl,
    userId:  req.user?.id,
    stack:   status === 500 ? err.stack : undefined,
  });

  const body = { error: message };
  if (err.code) body.code = err.code;

  // In dev, include stack for 500s
  if (process.env.NODE_ENV !== 'production' && status === 500) {
    body.stack = err.stack;
  }

  res.status(status).json(body);
}

module.exports = { AppError, notFound, errorHandler };
