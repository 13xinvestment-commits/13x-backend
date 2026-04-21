// routes/data.js
const express  = require('express');
const crypto   = require('crypto');
const supabase = require('../config/supabase');
const { authenticate, requireSubscription } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(apiLimiter);

const VALID_CATALYSTS = ['capex', 'margin', 'geo', 'new-prod', 'acq'];

// ── GET /api/v1/data/companies  (paid) ───────────────────────
router.get('/companies', authenticate, requireSubscription, async (req, res, next) => {
  try {
    let page  = Math.max(1, parseInt(req.query.page, 10)  || 1);
    let limit = parseInt(req.query.limit, 10) || 50;
    if (limit < 1 || limit > 100) limit = 50;
    const offset = (page - 1) * limit;

    const industry  = typeof req.query.industry === 'string' ? req.query.industry : null;
    const search    = (req.query.search || '').replace(/[^a-zA-Z0-9\s\-.&]/g, '').trim().slice(0, 100);
    const stage     = ['early_growth','acceleration','maturity','decline'].includes(req.query.stage) ? req.query.stage : null;
    const marketCap = ['small','mid','large'].includes(req.query.market_cap) ? req.query.market_cap : null;
    const scoreMin  = parseInt(req.query.score_min, 10) || 0;
    const scoreMax  = parseInt(req.query.score_max, 10) || 5;

    // Multi-catalyst: ?catalysts=capex,margin or single ?catalyst=capex
    let catalysts = [];
    if (req.query.catalysts) {
      catalysts = req.query.catalysts.split(',').filter(c => VALID_CATALYSTS.includes(c));
    } else if (VALID_CATALYSTS.includes(req.query.catalyst)) {
      catalysts = [req.query.catalyst];
    }

    let query = supabase
      .from('companies')
      .select('id, name, ticker, industry, top_trigger, catalyst_tags, score, stage, market_cap', { count: 'exact' })
      .gte('score', scoreMin)
      .lte('score', scoreMax)
      .order('score', { ascending: false })
      .range(offset, offset + limit - 1);

    if (industry)  query = query.eq('industry', industry);
    if (stage)     query = query.eq('stage', stage);
    if (marketCap) query = query.eq('market_cap', marketCap);
    if (search)    query = query.ilike('name', `%${search}%`);
    if (catalysts.length) query = query.contains('catalyst_tags', catalysts);

    const { data, error, count } = await query;
    if (error) return next(new AppError('Could not fetch companies', 500));

    res.json({ data, total: count, page, limit, pages: Math.ceil(count / limit) });
  } catch (err) { next(err); }
});

// ── GET /api/v1/data/companies/:id/triggers  (paid) ──────────
router.get('/companies/:id/triggers', authenticate, requireSubscription, async (req, res, next) => {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(req.params.id)) return next(new AppError('Invalid company ID', 400));

  try {
    const { data, error } = await supabase
      .from('triggers')
      .select('id, quarter, trigger_text, catalyst_type, conviction_score, source_quote')
      .eq('company_id', req.params.id)
      .order('conviction_score', { ascending: false });

    if (error) return next(new AppError('Could not fetch triggers', 500));
    res.json({ data });
  } catch (err) { next(err); }
});

// ── GET /api/v1/data/industries  (public) ────────────────────
router.get('/industries', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('industries')
      .select('id, name, category, company_count, summary_tag, catalysts')
      .order('company_count', { ascending: false });

    if (error) return next(new AppError('Could not fetch industries', 500));
    res.json({ data });
  } catch (err) { next(err); }
});

// ── GET /api/v1/data/screener/preview  (public) ──────────────
router.get('/screener/preview', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('name, ticker, industry, top_trigger, catalyst_tags, score')
      .eq('is_sample', true)
      .order('score', { ascending: false })
      .limit(15);

    if (error) return next(new AppError('Could not fetch preview data', 500));
    res.json({ data });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════
// TRIAL — 2-day free trial
// ══════════════════════════════════════════════════════════════

// POST /api/v1/data/trial/start
router.post('/trial/start', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Check if already had trial or paid sub
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('status, plan')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) return next(new AppError('Trial or subscription already used', 400));

    const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days

    const { error } = await supabase.from('subscriptions').insert({
      user_id: userId,
      plan: 'trial',
      status: 'active',
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) return next(new AppError('Could not start trial', 500));

    res.json({ success: true, expiresAt, message: '2-day trial started!' });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════
// REFERRALS
// ══════════════════════════════════════════════════════════════

// GET /api/v1/data/referral/code  — get or create my referral code
router.get('/referral/code', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Return existing code if any
    const { data: existing } = await supabase
      .from('referrals')
      .select('code, uses, rewards_granted')
      .eq('referrer_id', userId)
      .maybeSingle();

    if (existing) return res.json({ code: existing.code, uses: existing.uses, rewards: existing.rewards_granted });

    // Generate new code
    const code = req.user.name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '') +
      crypto.randomBytes(3).toString('hex');

    const { error } = await supabase.from('referrals').insert({
      referrer_id: userId,
      code,
      uses: 0,
      rewards_granted: 0,
      created_at: new Date().toISOString(),
    });

    if (error) return next(new AppError('Could not create referral code', 500));
    res.json({ code, uses: 0, rewards: 0 });
  } catch (err) { next(err); }
});

// POST /api/v1/data/referral/apply  — apply referral code at signup
// Called right after account creation (before payment)
router.post('/referral/apply', authenticate, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return next(new AppError('Code required', 400));

    const userId = req.user.id;

    // Find referral record
    const { data: ref } = await supabase
      .from('referrals')
      .select('id, referrer_id, code')
      .eq('code', code.toLowerCase().trim())
      .maybeSingle();

    if (!ref) return next(new AppError('Invalid referral code', 404));
    if (ref.referrer_id === userId) return next(new AppError('Cannot use your own referral code', 400));

    // Check if this user already applied a code
    const { data: alreadyUsed } = await supabase
      .from('referral_uses')
      .select('id')
      .eq('referred_id', userId)
      .maybeSingle();

    if (alreadyUsed) return next(new AppError('You have already used a referral code', 400));

    // Record the use
    await supabase.from('referral_uses').insert({
      referral_id: ref.id,
      referred_id: userId,
      used_at: new Date().toISOString(),
      rewarded: false,
    });

    // Increment use count
    await supabase.rpc('increment_referral_uses', { ref_id: ref.id });

    res.json({ success: true, message: 'Referral code applied! Your friend will get 30 days free when you subscribe.' });
  } catch (err) { next(err); }
});

// Internal helper — called by subscriptionService after a referred user pays
// POST /api/v1/data/referral/reward  (internal, needs admin secret header)
router.post('/referral/reward', async (req, res, next) => {
  try {
    const secret = req.headers['x-internal-secret'];
    if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Forbidden' });

    const { userId } = req.body; // the new paying user
    if (!userId) return next(new AppError('userId required', 400));

    // Find if this user was referred
    const { data: use } = await supabase
      .from('referral_uses')
      .select('id, referral_id, rewarded, referrals(referrer_id)')
      .eq('referred_id', userId)
      .eq('rewarded', false)
      .maybeSingle();

    if (!use) return res.json({ rewarded: false });

    const referrerId = use.referrals?.referrer_id;
    if (!referrerId) return res.json({ rewarded: false });

    // Extend referrer subscription by 30 days
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('expires_at, status')
      .eq('user_id', referrerId)
      .maybeSingle();

    const base = sub?.status === 'active' && sub?.expires_at
      ? new Date(sub.expires_at)
      : new Date();
    base.setDate(base.getDate() + 30);

    await supabase.from('subscriptions').upsert({
      user_id: referrerId,
      plan: sub?.plan || 'quarterly',
      status: 'active',
      expires_at: base.toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    // Mark rewarded
    await supabase.from('referral_uses').update({ rewarded: true }).eq('id', use.id);
    await supabase.rpc('increment_referral_rewards', { ref_id: use.referral_id });

    res.json({ rewarded: true, referrerId, newExpiry: base.toISOString() });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════
// WATCHLIST
// ══════════════════════════════════════════════════════════════

// GET /api/v1/data/watchlist
router.get('/watchlist', authenticate, requireSubscription, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('watchlists')
      .select('company_id, created_at, companies(id, name, ticker, industry, top_trigger, catalyst_tags, score, stage, market_cap)')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) return next(new AppError('Could not fetch watchlist', 500));
    res.json({ data: (data || []).map(w => ({ ...w.companies, watchlisted_at: w.created_at })) });
  } catch (err) { next(err); }
});

// POST /api/v1/data/watchlist/:companyId
router.post('/watchlist/:companyId', authenticate, requireSubscription, async (req, res, next) => {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(req.params.companyId)) return next(new AppError('Invalid company ID', 400));
  try {
    const { error } = await supabase.from('watchlists').insert({
      user_id: req.user.id, company_id: req.params.companyId,
    });
    if (error && error.code === '23505') return res.json({ success: true, message: 'Already in watchlist' });
    if (error) return next(new AppError('Could not add to watchlist', 500));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/v1/data/watchlist/:companyId
router.delete('/watchlist/:companyId', authenticate, requireSubscription, async (req, res, next) => {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(req.params.companyId)) return next(new AppError('Invalid company ID', 400));
  try {
    const { error } = await supabase.from('watchlists')
      .delete().eq('user_id', req.user.id).eq('company_id', req.params.companyId);
    if (error) return next(new AppError('Could not remove from watchlist', 500));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════
// MANAGEMENT SIGNALS
// ══════════════════════════════════════════════════════════════

// GET /api/v1/data/companies/:id/signals
router.get('/companies/:id/signals', authenticate, requireSubscription, async (req, res, next) => {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(req.params.id)) return next(new AppError('Invalid company ID', 400));
  try {
    const { data, error } = await supabase
      .from('signals')
      .select('id, quarter, signal_type, content, confidence, source')
      .eq('company_id', req.params.id)
      .order('confidence', { ascending: false });
    if (error) return next(new AppError('Could not fetch signals', 500));
    res.json({ data });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════
// COMPANY BY TICKER
// ══════════════════════════════════════════════════════════════

const cleanTicker = t => t.toUpperCase().replace(/[^A-Z0-9\-]/g,'').slice(0,20);

router.get('/companies/by-ticker/:ticker', authenticate, requireSubscription, async (req, res, next) => {
  const ticker = cleanTicker(req.params.ticker);
  try {
    const { data, error } = await supabase.from('companies')
      .select('id,name,ticker,industry,top_trigger,catalyst_tags,score,stage,market_cap')
      .ilike('ticker', ticker).maybeSingle();
    if (error || !data) return next(new AppError('Company not found', 404));
    res.json({ data });
  } catch (err) { next(err); }
});

router.get('/companies/by-ticker/:ticker/triggers', authenticate, requireSubscription, async (req, res, next) => {
  const ticker = cleanTicker(req.params.ticker);
  try {
    const { data: co } = await supabase.from('companies').select('id').ilike('ticker', ticker).maybeSingle();
    if (!co) return res.json({ data: [] });
    const { data, error } = await supabase.from('triggers')
      .select('id,quarter,trigger_text,catalyst_type,conviction_score,source_quote')
      .eq('company_id', co.id).order('conviction_score', { ascending: false });
    if (error) return next(new AppError('Could not fetch triggers', 500));
    res.json({ data });
  } catch (err) { next(err); }
});

router.get('/companies/by-ticker/:ticker/signals', authenticate, requireSubscription, async (req, res, next) => {
  const ticker = cleanTicker(req.params.ticker);
  try {
    const { data: co } = await supabase.from('companies').select('id').ilike('ticker', ticker).maybeSingle();
    if (!co) return res.json({ data: [] });
    const { data, error } = await supabase.from('signals')
      .select('id,quarter,signal_type,content,confidence,source')
      .eq('company_id', co.id).order('confidence', { ascending: false });
    if (error) return next(new AppError('Could not fetch signals', 500));
    res.json({ data });
  } catch (err) { next(err); }
});

router.get('/companies/by-ticker/:ticker/snapshot', authenticate, requireSubscription, async (req, res, next) => {
  const ticker = cleanTicker(req.params.ticker);
  try {
    const { data: co } = await supabase.from('companies').select('id').ilike('ticker', ticker).maybeSingle();
    if (!co) return res.json({ data: null });
    const { data, error } = await supabase.from('concall_snapshots')
      .select('id,quarter,revenue_trend,margin_trend,tone,guidance_summary,capex_commentary,risks,key_quotes')
      .eq('company_id', co.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) return next(new AppError('Could not fetch snapshot', 500));
    res.json({ data });
  } catch (err) { next(err); }
});

module.exports = router;