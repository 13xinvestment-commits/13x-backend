// utils/logger.js
// Structured logger — drop-in replacement for console.log
// Upgrade to Winston/Pino later by only changing this file.

const isDev = process.env.NODE_ENV !== 'production';

function format(level, message, meta) {
  const entry = {
    ts:    new Date().toISOString(),
    level,
    msg:   message,
    ...(meta && Object.keys(meta).length ? { meta } : {}),
  };
  return isDev
    ? `[${entry.ts}] ${level.toUpperCase()} ${message}${meta ? ' ' + JSON.stringify(meta) : ''}`
    : JSON.stringify(entry); // structured JSON for prod log aggregators
}

const logger = {
  info:  (msg, meta) => console.log(format('info',  msg, meta)),
  warn:  (msg, meta) => console.warn(format('warn',  msg, meta)),
  error: (msg, meta) => console.error(format('error', msg, meta)),
  debug: (msg, meta) => { if (isDev) console.debug(format('debug', msg, meta)); },
};

module.exports = logger;
