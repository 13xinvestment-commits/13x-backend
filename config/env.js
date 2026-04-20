// config/env.js
const REQUIRED = [
  'JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY',
  'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET',
  'RAZORPAY_PLAN_QUARTERLY', 'RAZORPAY_PLAN_YEARLY',
  'EMAIL_USER', 'EMAIL_PASS', 'FRONTEND_URL', 'BACKEND_URL',
  'ADMIN_SECRET', 'ADMIN_EMAILS',
];

function validateEnv() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('\n❌ Missing env vars:', missing.join(', '));
    process.exit(1);
  }
  if (process.env.JWT_SECRET.length < 32)    { console.error('❌ JWT_SECRET too short (min 32)');    process.exit(1); }
  if (process.env.ADMIN_SECRET.length < 20)  { console.error('❌ ADMIN_SECRET too short (min 20)');  process.exit(1); }
}

module.exports = { validateEnv };
