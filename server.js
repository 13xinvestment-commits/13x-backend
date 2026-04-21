// server.js
require('dotenv').config();
const { validateEnv } = require('./config/env');
validateEnv();

const express = require('express');
const cors    = require('cors');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const authRoutes         = require('./routes/auth');
const paymentRoutes      = require('./routes/payments');
const subscriptionRoutes = require('./routes/subscriptions');
const dataRoutes         = require('./routes/data');
const adminRoutes        = require('./routes/admin');

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      'http://127.0.0.1:8080',
      'http://localhost:8080',
      'https://13x-frontend.vercel.app',
      process.env.FRONTEND_URL,
    ].filter(Boolean);

    // Allow Vercel preview deploys (e.g. 13x-frontend-git-branch-xxx.vercel.app)
    const isVercelPreview = origin && /\.vercel\.app$/.test(origin);

    if (!origin || allowed.includes(origin) || isVercelPreview) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Raw body for Razorpay webhooks — BEFORE express.json()
app.use('/api/v1/subscriptions/webhook', express.raw({ type: 'application/json' }));
app.use('/api/v1/payments/webhook',      express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10kb' }));

// Health check
app.get('/health', async (req, res) => {
  const supabase = require('./config/supabase');
  try {
    await supabase.from('users').select('id').limit(1);
    res.json({ status: 'ok', version: '2.2.0', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'unreachable' });
  }
});

// v1 routes
app.use('/api/v1/auth',          authRoutes);
app.use('/api/v1/payments',      paymentRoutes);
app.use('/api/v1/subscriptions', subscriptionRoutes);
app.use('/api/v1/data',          dataRoutes);
app.use('/api/v1/admin',         adminRoutes);

// Error handling (must be last)
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => console.log('13X backend running on port ' + PORT));

// ── Daily expiry reminder cron (every 24h) ───────────────────
const { sendExpiryReminders } = require('./services/subscriptionService');
setInterval(async () => {
  try { await sendExpiryReminders(); }
  catch (err) { console.error('[cron] sendExpiryReminders failed:', err.message); }
}, 24 * 60 * 60 * 1000);

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('unhandledRejection', (r) => console.error('Unhandled Rejection:', r));
process.on('uncaughtException',  (e) => { console.error('Uncaught Exception:', e); server.close(() => process.exit(1)); });