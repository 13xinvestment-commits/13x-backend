/**
 * routes/payments.js — Razorpay SUBSCRIPTIONS (not one-time orders)
 * Path: routes/payments.js
 */

const express  = require('express');
const crypto   = require('crypto');
const supabase = require('../config/supabase');
const razorpay = require('../config/razorpay');
const { authenticate } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// ── Plan → Razorpay Plan ID mapping ─────────────────────────────────
// You create these plans ONCE in the Razorpay dashboard and paste the
// plan IDs here (they look like: plan_XXXXXXXXXXXXXXXX)
const PLANS = {
  quarterly: {
    razorpayPlanId: process.env.RAZORPAY_PLAN_QUARTERLY, // e.g. plan_Abc123
    period: 90,
    label: '₹599/quarter',
    amount: 59900,
  },
  yearly: {
    razorpayPlanId: process.env.RAZORPAY_PLAN_YEARLY,   // e.g. plan_Xyz456
    period: 365,
    label: '₹1,999/year',
    amount: 199900,
  },
};

function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA); // prevent timing leak on length
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

async function activateSubscription({ userId, plan, subscriptionId, paymentId }) {
  const days = PLANS[plan].period;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);

  const { error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        plan,
        status: 'active',
        razorpay_subscription_id: subscriptionId,
        razorpay_payment_id: paymentId || null,
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) throw new Error(`DB upsert failed: ${error.message}`);
  return expiresAt;
}

// ─────────────────────────────────────────────────────────────
// POST /api/payments/create-subscription
// Creates a Razorpay Subscription for the chosen plan.
// ─────────────────────────────────────────────────────────────
router.post('/create-subscription', authenticate, paymentLimiter, async (req, res) => {
  const { plan } = req.body;

  if (!plan || !PLANS[plan]) {
    return res.status(400).json({ error: 'Invalid plan. Choose quarterly or yearly.' });
  }

  const planConfig = PLANS[plan];

  if (!planConfig.razorpayPlanId) {
    console.error(`[create-subscription] Missing env var for plan: ${plan}`);
    return res.status(500).json({ error: 'Plan not configured. Contact support.' });
  }

  try {
    // total_count: how many billing cycles before subscription ends.
    // Set high (e.g. 12) for ~perpetual, or 1 for single-period access.
    const subscription = await razorpay.subscriptions.create({
      plan_id: planConfig.razorpayPlanId,
      customer_notify: 1,        // Razorpay emails the customer
      total_count: 12,           // max 12 renewals (adjust as needed)
      notes: {
        user_id: req.user.id,
        plan,
      },
    });

    return res.json({
      subscriptionId: subscription.id,
      keyId: process.env.RAZORPAY_KEY_ID,
      plan,
      amount: planConfig.amount,
      label: planConfig.label,
    });

  } catch (err) {
    console.error('[create-subscription] Razorpay error:', err);
    return res.status(502).json({ error: 'Could not create subscription. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/payments/verify-subscription
// Called by frontend after successful Razorpay checkout.
// ─────────────────────────────────────────────────────────────
router.post('/verify-subscription', authenticate, async (req, res) => {
  const {
    razorpay_payment_id,
    razorpay_subscription_id,
    razorpay_signature,
  } = req.body;

  if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing verification fields' });
  }

  // 1. Verify HMAC signature (constant-time)
  const payload = `${razorpay_payment_id}|${razorpay_subscription_id}`;
  const expectedSig = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(payload)
    .digest('hex');

  if (!timingSafeCompare(expectedSig, razorpay_signature)) {
    console.warn('[verify-subscription] Signature mismatch for user:', req.user.id);
    return res.status(400).json({ error: 'Payment verification failed' });
  }

  try {
    // 2. Fetch subscription from Razorpay — get canonical plan from notes
    const sub = await razorpay.subscriptions.fetch(razorpay_subscription_id);

    // 3. Confirm subscription belongs to authenticated user
    if (sub.notes?.user_id !== req.user.id) {
      console.warn('[verify-subscription] user_id mismatch:', sub.notes?.user_id, '≠', req.user.id);
      return res.status(403).json({ error: 'Subscription does not belong to this account' });
    }

    const plan = sub.notes?.plan;
    if (!plan || !PLANS[plan]) {
      console.error('[verify-subscription] Invalid plan in notes:', plan);
      return res.status(400).json({ error: 'Invalid plan in subscription' });
    }

    // 4. Activate in DB
    const expiresAt = await activateSubscription({
      userId: req.user.id,
      plan,
      subscriptionId: razorpay_subscription_id,
      paymentId: razorpay_payment_id,
    });

    return res.json({ success: true, plan, expiresAt });

  } catch (err) {
    console.error('[verify-subscription] Error:', err.message);
    return res.status(500).json({
      error: 'Payment confirmed but activation failed. Contact support.',
      paymentId: razorpay_payment_id,
    });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/payments/webhook
// Handles Razorpay server-to-server events (renewals, cancellations).
// Register this URL in Razorpay Dashboard → Webhooks.
// ─────────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];

  if (!signature) {
    return res.status(400).json({ error: 'Missing webhook signature' });
  }

  const expectedSig = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(req.body)   // raw Buffer — set up in server.js before express.json()
    .digest('hex');

  if (!timingSafeCompare(expectedSig, signature)) {
    console.warn('[webhook] Invalid signature');
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Respond immediately so Razorpay doesn't time out
  res.json({ received: true });

  const eventType = event.event;
  const subEntity  = event.payload?.subscription?.entity;
  const payEntity  = event.payload?.payment?.entity;

  // ── subscription.charged → renewal payment succeeded ──────
  if (eventType === 'subscription.charged') {
    const { user_id, plan } = subEntity?.notes || {};
    if (!user_id || !plan || !PLANS[plan]) {
      console.warn('[webhook] subscription.charged missing notes:', subEntity?.notes);
      return;
    }
    try {
      await activateSubscription({
        userId: user_id,
        plan,
        subscriptionId: subEntity.id,
        paymentId: payEntity?.id || null,
      });
      console.log(`[webhook] Renewed subscription for user ${user_id} (${plan})`);
    } catch (err) {
      console.error(`[webhook] FAILED renewal for user ${user_id}:`, err.message);
    }
    return;
  }

  // ── subscription.cancelled / subscription.completed ────────
  if (eventType === 'subscription.cancelled' || eventType === 'subscription.completed') {
    const { user_id } = subEntity?.notes || {};
    if (!user_id) return;

    const { error } = await supabase
      .from('subscriptions')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('user_id', user_id);

    if (error) {
      console.error(`[webhook] Failed to deactivate user ${user_id}:`, error.message);
    } else {
      console.log(`[webhook] Deactivated subscription for user ${user_id} (${eventType})`);
    }
    return;
  }

  // ── subscription.halted → payment failed too many times ───
  if (eventType === 'subscription.halted') {
    const { user_id } = subEntity?.notes || {};
    if (!user_id) return;

    const { error } = await supabase
      .from('subscriptions')
      .update({ status: 'halted', updated_at: new Date().toISOString() })
      .eq('user_id', user_id);

    if (error) {
      console.error(`[webhook] Failed to halt user ${user_id}:`, error.message);
    } else {
      console.log(`[webhook] Halted subscription for user ${user_id}`);
    }
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/payments/status
// ─────────────────────────────────────────────────────────────
router.get('/status', authenticate, async (req, res) => {
  try {
    const { data: sub, error } = await supabase
      .from('subscriptions')
      .select('plan, status, expires_at, razorpay_subscription_id')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) {
      console.error('[/status] DB error:', error.message);
      return res.status(500).json({ error: 'Could not fetch subscription status' });
    }

    if (!sub) return res.json({ isPaid: false, subscription: null });

    const isPaid = sub.status === 'active' && new Date(sub.expires_at) > new Date();
    return res.json({ isPaid, subscription: sub });

  } catch (err) {
    console.error('[/status] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/payments/cancel
// Cancels the Razorpay subscription at period end.
// ─────────────────────────────────────────────────────────────
router.post('/cancel', authenticate, async (req, res) => {
  try {
    const { data: sub, error } = await supabase
      .from('subscriptions')
      .select('razorpay_subscription_id')
      .eq('user_id', req.user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (error || !sub) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    // cancel_at_cycle_end: 1 = cancel after current period ends
    await razorpay.subscriptions.cancel(sub.razorpay_subscription_id, { cancel_at_cycle_end: 1 });

    return res.json({ success: true, message: 'Subscription will cancel at period end.' });

  } catch (err) {
    console.error('[/cancel] Error:', err.message);
    return res.status(500).json({ error: 'Could not cancel subscription' });
  }
});

module.exports = router;
