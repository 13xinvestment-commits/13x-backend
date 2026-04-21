// routes/admin.js
const express  = require('express');
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();

// ── Admin guard middleware ────────────────────────────────────
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

const requireAdmin = (req, res, next) => {
  if (!ADMIN_EMAILS.includes(req.user.email.toLowerCase())) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// ── GET /api/v1/admin/users ─────────────────────────────────
// Returns all users with their subscription info
router.get('/users', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, name, email_verified, created_at')
      .order('created_at', { ascending: false });

    if (error) return next(new AppError('Failed to fetch users', 500));

    const { data: subs } = await supabase
      .from('subscriptions')
      .select('user_id, plan, status, expires_at');

    const subMap = {};
    (subs || []).forEach(s => { subMap[s.user_id] = s; });

    const result = users.map(u => ({
      ...u,
      subscription: subMap[u.id] || null,
    }));

    res.json({ users: result });
  } catch (err) { next(err); }
});

// ── POST /api/v1/admin/activate ──────────────────────────────
// Manually activate a user's subscription
router.post('/activate', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { userId, plan = 'quarterly', days = 92 } = req.body;
    if (!userId) return next(new AppError('userId is required', 400));

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(days));

    const { error } = await supabase.from('subscriptions').upsert({
      user_id: userId,
      plan,
      status: 'active',
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    if (error) return next(new AppError('Failed to activate subscription', 500));
    res.json({ success: true, expiresAt });
  } catch (err) { next(err); }
});

// ── POST /api/v1/admin/deactivate ───────────────────────────
// Revoke a user's subscription immediately
router.post('/deactivate', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { userId } = req.body;
    if (!userId) return next(new AppError('userId is required', 400));

    const { error } = await supabase.from('subscriptions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (error) return next(new AppError('Failed to revoke subscription', 500));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── POST /api/v1/admin/run-pipeline ─────────────────────────
// Manually trigger the data pipeline from admin panel
const { runPipeline } = require('../pipeline/runner');

router.post('/run-pipeline', authenticate, requireAdmin, async (req, res, next) => {
  try {
    // Respond immediately — pipeline runs in background
    res.json({ success: true, message: 'Pipeline started. Check Render logs for progress.' });
    runPipeline().catch(err => console.error('Pipeline error:', err));
  } catch (err) { next(err); }
});

// ── GET /api/v1/admin/pipeline-status ───────────────────────
// Check how many companies have been loaded for current quarter
router.get('/pipeline-status', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const quarter = process.env.CURRENT_QUARTER || 'Q4FY26';
    const { count } = await supabase
      .from('companies')
      .select('*', { count: 'exact', head: true })
      .eq('quarter', quarter);
    res.json({ quarter, companiesLoaded: count || 0 });
  } catch (err) { next(err); }
});

module.exports = router;