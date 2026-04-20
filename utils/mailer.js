/**
 * utils/mailer.js — All transactional emails for 13X
 */
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const BASE_STYLE = `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px`;
const BTN = (href, text) => `<a href="${href}" style="display:inline-block;margin-top:16px;padding:12px 28px;background:#0F172A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">${text}</a>`;
const FOOTER = `<p style="margin-top:32px;color:#94A3B8;font-size:12px;border-top:1px solid #eee;padding-top:16px">13X Investments · Not SEBI registered · For research purposes only</p>`;

async function sendVerificationEmail(email, token) {
  const link = `${process.env.BACKEND_URL}/api/v1/auth/verify-email?token=${token}`;
  await transporter.sendMail({
    from: `"13X Investments" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Verify your 13X account',
    html: `<div style="${BASE_STYLE}">
      <h2 style="color:#0F172A;letter-spacing:-0.5px">Verify your email</h2>
      <p style="color:#475569">Click below to verify your account. This link expires in <strong>24 hours</strong>.</p>
      ${BTN(link, 'Verify Email')}
      <p style="margin-top:16px;color:#94A3B8;font-size:13px">Didn't create an account? You can safely ignore this.</p>
      ${FOOTER}
    </div>`,
  });
}

async function sendWelcomeEmail(email, name) {
  await transporter.sendMail({
    from: `"13X Investments" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Welcome to 13X — here's what you get",
    html: `<div style="${BASE_STYLE}">
      <h2 style="color:#0F172A;letter-spacing:-0.5px">Welcome, ${name} 👋</h2>
      <p style="color:#475569">You're in. Here's what 13X gives you:</p>
      <ul style="color:#334155;line-height:2;padding-left:20px">
        <li>Growth triggers for <strong>2000+ Indian companies</strong></li>
        <li>10–12 forward-looking signals per company from 4 quarters of earnings calls</li>
        <li>Filter by capex, margin expansion, geo expansion, acquisitions and more</li>
        <li>Quarterly data updates every earnings season, automatically</li>
      </ul>
      ${BTN(process.env.FRONTEND_URL, 'Go to Dashboard')}
      <p style="margin-top:16px;color:#94A3B8;font-size:13px">Questions? Reply to this email or reach us on X @13xinvestments</p>
      ${FOOTER}
    </div>`,
  });
}

async function sendPaymentSuccessEmail(email, name, plan, expiresAt) {
  const planLabel = plan === 'yearly' ? 'Yearly Plan (Rs 5,499/yr)' : 'Quarterly Plan (Rs 599/quarter)';
  const expiry = new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  await transporter.sendMail({
    from: `"13X Investments" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "You're Pro — 13X subscription confirmed",
    html: `<div style="${BASE_STYLE}">
      <div style="background:#d4edda;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <strong style="color:#155724">Payment Successful</strong>
      </div>
      <h2 style="color:#0F172A;letter-spacing:-0.5px">You're Pro now, ${name}!</h2>
      <p style="color:#475569">Your subscription is active. Full access to the 13X screener is unlocked.</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
        <tr style="border-bottom:1px solid #eee"><td style="padding:10px 0;color:#64748B">Plan</td><td style="padding:10px 0;font-weight:600">${planLabel}</td></tr>
        <tr style="border-bottom:1px solid #eee"><td style="padding:10px 0;color:#64748B">Status</td><td style="padding:10px 0;color:#2d6a4f;font-weight:600">Active</td></tr>
        <tr><td style="padding:10px 0;color:#64748B">Access until</td><td style="padding:10px 0;font-weight:600">${expiry}</td></tr>
      </table>
      ${BTN(process.env.FRONTEND_URL, 'Open Your Dashboard')}
      ${FOOTER}
    </div>`,
  });
}

async function sendExpiryReminderEmail(email, name, expiresAt) {
  const expiry = new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  await transporter.sendMail({
    from: `"13X Investments" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Your 13X subscription expires in 3 days',
    html: `<div style="${BASE_STYLE}">
      <h2 style="color:#0F172A;letter-spacing:-0.5px">Don't lose access, ${name}</h2>
      <p style="color:#475569">Your 13X Pro subscription expires on <strong>${expiry}</strong>.</p>
      <p style="color:#475569">After that, you'll lose access to the full screener and all 2000+ company triggers.</p>
      ${BTN(`${process.env.FRONTEND_URL}?page=pricing`, 'Renew Now')}
      <p style="margin-top:16px;color:#94A3B8;font-size:13px">You can renew anytime from your dashboard or the pricing page.</p>
      ${FOOTER}
    </div>`,
  });
}

async function sendResetEmail(email, link) {
  await transporter.sendMail({
    from: `"13X Investments" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Reset your 13X password',
    html: `<div style="${BASE_STYLE}">
      <h2 style="color:#0F172A">Reset your password</h2>
      <p style="color:#475569">Click below to reset your password. This link expires in <strong>15 minutes</strong>.</p>
      ${BTN(link, 'Reset Password')}
      <p style="margin-top:16px;color:#94A3B8;font-size:13px">Didn't request this? Ignore this email.</p>
      ${FOOTER}
    </div>`,
  });
}

module.exports = { sendVerificationEmail, sendWelcomeEmail, sendPaymentSuccessEmail, sendExpiryReminderEmail, sendResetEmail };
