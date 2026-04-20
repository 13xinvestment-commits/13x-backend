/**
 * middleware/auth.js
 *
 * AUDIT FIXES vs v1:
 * ─────────────────────────────────────────────────────────────────────
 * [BUG]  authenticate() had no try/catch wrapper for the async path —
 *        an unexpected Supabase error in requireSubscription would leak
 *        an unhandled promise rejection instead of returning a 500.
 *
 * [SEC]  requireSubscription used `.select('*')` — over-fetches all
 *        columns including payment IDs unnecessarily. Reduced to minimum.
 *
 * [SEC]  JWT errors exposed raw error type (TokenExpiredError,
 *        JsonWebTokenError) to clients. Normalized to a single message.
 *
 * [PERF] requireSubscription always hits DB. In v2, it caches nothing —
 *        that's intentional (sub status can change). But select is minimal.
 * ─────────────────────────────────────────────────────────────────────
 */

const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

/**
 * authenticate — verify JWT, attach decoded payload to req.user.
 * Does NOT hit the database — pure cryptographic check.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7); // removes 'Bearer '

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    // Deliberately vague — don't leak whether the token is expired vs malformed
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * requireSubscription — must be used AFTER authenticate.
 * Checks DB for a non-expired active subscription.
 * Attaches subscription record to req.subscription.
 */
const requireSubscription = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('id, plan, status, expires_at')  // only what we need
      .eq('user_id', req.user.id)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .maybeSingle();  // returns null instead of error when not found

    if (error) {
      console.error('[requireSubscription] DB error:', error.message);
      return res.status(500).json({ error: 'Could not verify subscription' });
    }

    if (!data) {
      return res.status(403).json({ error: 'Active subscription required' });
    }

    req.subscription = data;
    next();
  } catch (err) {
    console.error('[requireSubscription] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { authenticate, requireSubscription };
