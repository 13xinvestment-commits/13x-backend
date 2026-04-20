// services/subscriptionService.js
const crypto   = require('crypto');
const supabase = require('../config/supabase');
const razorpay = require('../config/razorpay');
const { AppError } = require('../middleware/errorHandler');
const { sendPaymentSuccessEmail, sendExpiryReminderEmail } = require('../utils/mailer');
const logger = require('../utils/logger');

const PLANS = {
  quarterly: { razorpayPlanId: process.env.RAZORPAY_PLAN_QUARTERLY, label: 'Rs 599/quarter', intervalMonths: 3 },
  yearly:    { razorpayPlanId: process.env.RAZORPAY_PLAN_YEARLY,    label: 'Rs 1,999/year',  intervalMonths: 12 },
};

function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a), bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) { crypto.timingSafeEqual(bufA, bufA); return false; }
  return crypto.timingSafeEqual(bufA, bufB);
}

function planKeyFromPlanId(razorpayPlanId) {
  return Object.keys(PLANS).find(k => PLANS[k].razorpayPlanId === razorpayPlanId) ?? null;
}

async function upsertSubscription({ userId, plan, status, razorpaySubscriptionId, razorpayPaymentId, expiresAt }) {
  const { data: existing } = await supabase
    .from('subscriptions').select('expires_at').eq('user_id', userId).maybeSingle();

  const safeExpiry = existing?.expires_at && new Date(existing.expires_at) > expiresAt
    ? new Date(existing.expires_at) : expiresAt;

  const record = {
    user_id: userId, plan, status,
    razorpay_subscription_id: razorpaySubscriptionId,
    expires_at: safeExpiry.toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (razorpayPaymentId) record.razorpay_payment_id = razorpayPaymentId;

  const { error } = await supabase.from('subscriptions').upsert(record, { onConflict: 'user_id' });
  if (error) throw new Error(`DB upsert failed: ${error.message}`);
}

async function isWebhookAlreadyProcessed(eventId) {
  if (!eventId) return false;
  const { error } = await supabase.from('processed_webhook_events')
    .insert({ event_id: eventId, processed_at: new Date().toISOString() });
  if (error?.code === '23505') return true;
  if (error) logger.error('[subscriptionService] idempotency insert error', { msg: error.message });
  return false;
}

async function getUserEmailAndName(userId) {
  const { data } = await supabase.from('users').select('email, name').eq('id', userId).maybeSingle();
  return data || null;
}

// ── Service methods ───────────────────────────────────────────
async function createSubscription({ userId, plan }) {
  if (!plan || !PLANS[plan]) throw new AppError('Invalid plan. Choose quarterly or yearly.', 400);
  const planConfig = PLANS[plan];
  if (!planConfig.razorpayPlanId) throw new AppError('Plan not configured. Contact support.', 500);

  const subscription = await razorpay.subscriptions.create({
    plan_id: planConfig.razorpayPlanId, total_count: 12, quantity: 1,
    notes: { user_id: userId, plan },
  }).catch(() => { throw new AppError('Could not create subscription. Please try again.', 502); });

  return { subscriptionId: subscription.id, keyId: process.env.RAZORPAY_KEY_ID, plan };
}

async function verifySubscription({ userId, razorpay_subscription_id, razorpay_payment_id, razorpay_signature }) {
  if (!razorpay_subscription_id || !razorpay_payment_id || !razorpay_signature)
    throw new AppError('Missing verification fields', 400);

  const expectedSig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_payment_id}|${razorpay_subscription_id}`).digest('hex');

  if (!timingSafeCompare(expectedSig, razorpay_signature))
    throw new AppError('Payment verification failed', 400);

  const sub = await razorpay.subscriptions.fetch(razorpay_subscription_id);

  if (sub.notes?.user_id !== userId)
    throw new AppError('Subscription does not belong to this account', 403);

  const plan = planKeyFromPlanId(sub.plan_id);
  if (!plan) throw new AppError('Unrecognised plan. Contact support.', 400);

  const expiresAt = sub.current_end ? new Date(sub.current_end * 1000)
    : (() => { const d = new Date(); d.setMonth(d.getMonth() + PLANS[plan].intervalMonths); return d; })();

  await upsertSubscription({ userId, plan, status: 'active', razorpaySubscriptionId: razorpay_subscription_id, razorpayPaymentId: razorpay_payment_id, expiresAt });

  // Send payment success email (fire-and-forget)
  getUserEmailAndName(userId).then(u => {
    if (u) sendPaymentSuccessEmail(u.email, u.name, plan, expiresAt)
      .catch(err => logger.error('[verifySubscription] Payment email failed', { msg: err.message }));
  });

  return { plan, expiresAt };
}

async function processWebhook(rawBody, signature) {
  const expectedSig = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody).digest('hex');

  if (!timingSafeCompare(expectedSig, signature))
    throw new AppError('Invalid webhook signature', 400);

  let event;
  try { event = JSON.parse(rawBody.toString()); }
  catch { throw new AppError('Invalid JSON in webhook body', 400); }

  if (await isWebhookAlreadyProcessed(event.id)) {
    logger.info(`[webhook] Duplicate skipped: ${event.id}`);
    return { duplicate: true };
  }

  const { event: eventType, payload } = event;
  const sub = payload?.subscription?.entity;
  const pay = payload?.payment?.entity;

  const resolvedPlan = (notes) => notes?.plan || planKeyFromPlanId(sub?.plan_id);
  const resolvedExpiry = (plan) => sub?.current_end ? new Date(sub.current_end * 1000)
    : (() => { const d = new Date(); d.setMonth(d.getMonth() + PLANS[plan].intervalMonths); return d; })();

  if (eventType === 'subscription.charged') {
    const { user_id } = sub?.notes || {};
    const plan = resolvedPlan(sub?.notes);
    if (!user_id || !plan || !PLANS[plan]) { logger.warn('[webhook] charged: invalid notes', { notes: sub?.notes }); return {}; }
    const expiresAt = resolvedExpiry(plan);
    await upsertSubscription({ userId: user_id, plan, status: 'active', razorpaySubscriptionId: sub.id, razorpayPaymentId: pay?.id, expiresAt });
    getUserEmailAndName(user_id).then(u => {
      if (u) sendPaymentSuccessEmail(u.email, u.name, plan, expiresAt).catch(() => {});
    });
    logger.info(`[webhook] Renewed user=${user_id} plan=${plan}`);
  }

  if (eventType === 'subscription.activated') {
    const { user_id } = sub?.notes || {};
    const plan = resolvedPlan(sub?.notes);
    if (!user_id || !plan || !PLANS[plan]) { logger.warn('[webhook] activated: invalid notes'); return {}; }
    await upsertSubscription({ userId: user_id, plan, status: 'active', razorpaySubscriptionId: sub.id, razorpayPaymentId: null, expiresAt: resolvedExpiry(plan) });
    logger.info(`[webhook] Activated user=${user_id} plan=${plan}`);
  }

  if (eventType === 'subscription.cancelled') {
    const { user_id } = sub?.notes || {};
    if (!user_id) return {};
    const { data: existing } = await supabase.from('subscriptions').select('expires_at').eq('user_id', user_id).maybeSingle();
    const expiresAt = existing?.expires_at ? new Date(existing.expires_at) : new Date();
    await upsertSubscription({ userId: user_id, plan: resolvedPlan(sub?.notes) || 'unknown', status: 'cancelled', razorpaySubscriptionId: sub.id, razorpayPaymentId: null, expiresAt });
    logger.info(`[webhook] Cancelled user=${user_id}`);
  }

  if (eventType === 'subscription.halted') {
    const { user_id } = sub?.notes || {};
    if (!user_id) return {};
    await upsertSubscription({ userId: user_id, plan: planKeyFromPlanId(sub?.plan_id) || 'unknown', status: 'halted', razorpaySubscriptionId: sub.id, razorpayPaymentId: null, expiresAt: new Date() });
    logger.warn(`[webhook] Halted user=${user_id}`);
  }

  return {};
}

async function cancelSubscription(userId) {
  const { data: sub, error } = await supabase
    .from('subscriptions').select('razorpay_subscription_id, status')
    .eq('user_id', userId).maybeSingle();

  if (error) throw new AppError('Could not retrieve subscription', 500);
  if (!sub?.razorpay_subscription_id) throw new AppError('No active subscription found', 404);
  if (sub.status === 'cancelled') throw new AppError('Subscription is already cancelled', 400);

  await razorpay.subscriptions.cancel(sub.razorpay_subscription_id, true)
    .catch(() => { throw new AppError('Could not cancel subscription. Please try again.', 502); });

  await supabase.from('subscriptions').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('user_id', userId);
}

async function getStatus(userId) {
  const { data: sub, error } = await supabase
    .from('subscriptions').select('plan, status, expires_at, razorpay_subscription_id')
    .eq('user_id', userId).maybeSingle();

  if (error) throw new AppError('Could not fetch subscription status', 500);
  if (!sub) return { isPaid: false, subscription: null };

  const isPaid = sub.status === 'active' && new Date(sub.expires_at) > new Date();
  return { isPaid, subscription: sub };
}

/**
 * sendExpiryReminders — call this from a cron job daily.
 * Finds users whose subscription expires in ~3 days and emails them.
 */
async function sendExpiryReminders() {
  const now   = new Date();
  const soon  = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days from now
  const start = new Date(soon.getTime() - 60 * 60 * 1000);          // ±1hr window

  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('user_id, plan, expires_at')
    .eq('status', 'active')
    .gte('expires_at', start.toISOString())
    .lte('expires_at', soon.toISOString());

  if (error) { logger.error('[sendExpiryReminders] DB error', { msg: error.message }); return; }
  if (!subs?.length) return;

  for (const sub of subs) {
    const user = await getUserEmailAndName(sub.user_id);
    if (!user) continue;
    sendExpiryReminderEmail(user.email, user.name, sub.expires_at)
      .catch(err => logger.error('[sendExpiryReminders] Email failed', { userId: sub.user_id, msg: err.message }));
  }

  logger.info(`[sendExpiryReminders] Sent ${subs.length} reminder(s)`);
}

module.exports = { createSubscription, verifySubscription, processWebhook, cancelSubscription, getStatus, sendExpiryReminders, PLANS };
