// routes/subscriptions.js — thin route layer
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimiter');
const subscriptionService = require('../services/subscriptionService');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();

router.post('/create', authenticate, paymentLimiter, async (req, res, next) => {
  try {
    const result = await subscriptionService.createSubscription({ userId: req.user.id, plan: req.body.plan });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/verify', authenticate, async (req, res, next) => {
  try {
    const result = await subscriptionService.verifySubscription({ userId: req.user.id, ...req.body });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.post('/webhook', async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (!signature) return next(new AppError('Missing webhook signature', 400));
    const result = await subscriptionService.processWebhook(req.body, signature);
    res.json({ received: true, ...result });
  } catch (err) { next(err); }
});

router.delete('/cancel', authenticate, async (req, res, next) => {
  try {
    await subscriptionService.cancelSubscription(req.user.id);
    res.json({ success: true, message: 'Subscription cancelled. Access continues until billing period ends.' });
  } catch (err) { next(err); }
});

router.get('/status', authenticate, async (req, res, next) => {
  try {
    const result = await subscriptionService.getStatus(req.user.id);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
