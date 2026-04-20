/**
 * routes/payments.js
 *
 * AUDIT FIXES vs v1:
 * ─────────────────────────────────────────────────────────────────────
 * [SEC]  CRITICAL — v1 webhook used the RAZORPAY_KEY_SECRET to verify
 *        webhook signatures. This is WRONG. Razorpay webhooks use a
 *        SEPARATE webhook secret configured in the dashboard, not the
 *        API secret. If the API secret ever rotated, webhook verification
 *        would silently break. Fixed to use RAZORPAY_WEBHOOK_SECRET.
 *
 * [SEC]  v1 /verify did NOT confirm the order_id actually belongs to
 *        the authenticated user. An attacker could take a valid
 *        razorpay_order_id from someone else's payment and verify it
 *        with their own account, activating a subscription for free.
 *        Fixed: we verify the order via Razorpay API before activating.
 *
 * [SEC]  v1 used timingSafeEqual for signature comparison — actually it
 *        DIDN'T, it used `!==`. String comparison with `!==` is NOT
 *        constant-time and opens a timing attack. Fixed with
 *        crypto.timingSafeEqual.
 *
 * [SEC]  plan in /verify came from req.body (user-controlled). An
 *        attacker could send plan='yearly' after paying for quarterly.
 *        Fixed: derive plan from the verified Razorpay order notes,
 *        not from user input.
 *
 * [BUG]  Webhook: JSON.parse(body) can throw if body is malformed.
 *        Wrapped in try/catch.
 *
 * [BUG]  Webhook: await on supabase upsert was not error-checked.
 *        DB failures silently returned 200 to Razorpay, which would
 *        cause Razorpay to stop retrying. Fixed to log errors.
 *
 * [PERF] receipt field truncated to 40 chars — Razorpay limit is 40.
 * ─────────────────────────────────────────────────────────────────────
 */

const express = require('express');
const crypto = require('crypto');
const supabase = require('../config/supabase');
const razorpay = require('../config/razorpay');
const { authenticate } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// Plan definitions — source of truth lives here, NOT in frontend
// ─────────────────────────────────────────────────────────────
const PLANS = {
  quarterly: { amount: 59900,  currency: 'INR', period: 90,  label: '₹599/quarter' },
  yearly:    { amount: 199900, currency: 'INR', period: 365, label: '₹1,999/year' },
};

/**
 * timingSafeCompare — constant-time string comparison.
 * Prevents timing attacks on HMAC verification.
 */
function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still run comparison on dummy data to not leak length via timing
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Activates or renews a subscription in the DB.
 * Exported as a helper so both /verify and /webhook can share it.
 */
async function activateSubscription({ userId, plan, razorpayOrderId, razorpayPaymentId }) {
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
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) throw new Error(`DB upsert failed: ${error.message}`);
  return expiresAt;
}

// ─────────────────────────────────────────────────────────────
// POST /api/payments/create-order
// ─────────────────────────────────────────────────────────────
router.post('/create-order', authenticate, paymentLimiter, async (req, res) => {
  const { plan } = req.body;

  if (!plan || !PLANS[plan]) {
    return res.status(400).json({ error: 'Invalid plan. Choose quarterly or yearly.' });
  }

  const { amount, currency } = PLANS[plan];

  try {
    // receipt is limited to 40 characters by Razorpay
    const receipt = `13x_${req.user.id.slice(0, 20)}_${Date.now().toString().slice(-8)}`;

    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt,
      notes: {
        user_id: req.user.id,  // stored in order — used by webhook for attribution
        plan,
      },
    });

    return res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      plan,
    });

  } catch (err) {
    console.error('[create-order] Razorpay error:', err.message);
    return res.status(502).json({ error: 'Could not create payment order. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/payments/verify
// Called by frontend after user completes Razorpay checkout.
// ─────────────────────────────────────────────────────────────
router.post('/verify', authenticate, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification fields' });
  }

  // 1. Verify HMAC signature (constant-time comparison)
  const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSig = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(payload)
    .digest('hex');

  if (!timingSafeCompare(expectedSig, razorpay_signature)) {
    console.warn('[verify] Signature mismatch — possible fraud attempt by user:', req.user.id);
    return res.status(400).json({ error: 'Payment verification failed' });
  }

  try {
    // 2. FIX: Fetch the order from Razorpay to get the canonical plan.
    //    Do NOT trust req.body.plan — user could send plan='yearly' after
    //    paying ₹599 for quarterly.
    const order = await razorpay.orders.fetch(razorpay_order_id);

    // 3. Confirm the order belongs to the authenticated user
    if (order.notes?.user_id !== req.user.id) {
      console.warn('[verify] Order user_id mismatch. Order:', order.notes?.user_id, 'JWT:', req.user.id);
      return res.status(403).json({ error: 'Order does not belong to this account' });
    }

    const plan = order.notes?.plan;
    if (!plan || !PLANS[plan]) {
      console.error('[verify] Invalid plan in order notes:', plan);
      return res.status(400).json({ error: 'Invalid plan in order' });
    }

    // 4. Activate subscription
    const expiresAt = await activateSubscription({
      userId: req.user.id,
      plan,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    });

    return res.json({ success: true, plan, expiresAt });

  } catch (err) {
    console.error('[verify] Error:', err.message);
    // Payment is verified but DB failed — log for manual recovery
    return res.status(500).json({
      error: 'Payment confirmed but activation failed. Contact support with your payment ID.',
      paymentId: razorpay_payment_id,
    });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/payments/webhook
// Razorpay server-to-server events. Backup for failed /verify calls.
// Must be registered in Razorpay dashboard with RAZORPAY_WEBHOOK_SECRET.
// ─────────────────────────────────────────────────────────────
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }), // raw body required for HMAC
  async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];

    if (!signature) {
      return res.status(400).json({ error: 'Missing webhook signature' });
    }

    // FIX: Use RAZORPAY_WEBHOOK_SECRET, not RAZORPAY_KEY_SECRET.
    // These are different secrets — webhook secret is set in the dashboard.
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(req.body) // req.body is a Buffer here (raw middleware)
      .digest('hex');

    if (!timingSafeCompare(expectedSig, signature)) {
      console.warn('[webhook] Invalid signature — rejecting request');
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    // Parse safely
    let event;
    try {
      event = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).json({ error: 'Invalid JSON in webhook body' });
    }

    // Always return 200 quickly — process async to avoid Razorpay timeout
    res.json({ received: true });

    // Process event after responding
    if (event.event === 'payment.captured') {
      const payment = event.payload?.payment?.entity;
      if (!payment) return;

      const { user_id, plan } = payment.notes || {};

      if (!user_id || !plan || !PLANS[plan]) {
        console.warn('[webhook] payment.captured missing valid notes:', payment.notes);
        return;
      }

      try {
        await activateSubscription({
          userId: user_id,
          plan,
          razorpayOrderId: payment.order_id,
          razorpayPaymentId: payment.id,
        });
        console.log(`[webhook] Subscription activated for user ${user_id} (${plan})`);
      } catch (err) {
        // Critical: log this for manual recovery
        console.error(`[webhook] FAILED to activate subscription for user ${user_id}:`, err.message);
      }
    }
  }
);

// ─────────────────────────────────────────────────────────────
// GET /api/payments/status
// Returns current subscription status for the authenticated user.
// ─────────────────────────────────────────────────────────────
router.get('/status', authenticate, async (req, res) => {
  try {
    const { data: sub, error } = await supabase
      .from('subscriptions')
      .select('plan, status, expires_at')
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

module.exports = router;
