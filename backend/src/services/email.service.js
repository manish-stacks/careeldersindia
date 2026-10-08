/**
 * Event e-mails (booking, visit, report, payment ...). Uses any SMTP server (Gmail app password, Brevo, SES SMTP ...).
 * Without SMTP_HOST the mail is only logged, so local development never fails because of it.
 */
const nodemailer = require('nodemailer');
const { env } = require('../config/env');
const { logger } = require('../config/logger');
const { User } = require('../models');

let transport;
function getTransport() {
  if (!env.SMTP_HOST) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT) || 587,
      secure: Number(env.SMTP_PORT) === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function render(title, body) {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #eee;border-radius:10px;overflow:hidden">
<div style="background:#C8372D;color:#fff;padding:14px 20px;font-size:18px;font-weight:bold">ParentCare</div>
<div style="padding:20px"><h3 style="margin:0 0 10px">${esc(title)}</h3><p style="margin:0;line-height:1.5;color:#333">${esc(body)}</p></div>
<div style="padding:12px 20px;background:#f7f7f7;color:#888;font-size:12px">This is an automatic message from ParentCare. Please open the app for details.</div></div>`;
}

/** Fire-and-forget: never throws, never blocks the request. */
async function sendEventEmail(userIds, { title, body }) {
  try {
    const users = await User.find({ _id: { $in: userIds }, email: { $exists: true, $ne: '' } }).select('email').lean();
    const to = users.map((u) => u.email).filter(Boolean);
    if (!to.length) return;
    const t = getTransport();
    if (!t) return logger.info({ to: to.length, title }, 'SMTP not configured — e-mail skipped');
    await Promise.all(to.map((address) => t.sendMail({ from: env.EMAIL_FROM || env.SMTP_USER, to: address, subject: title, text: body, html: render(title, body) }).catch((err) => logger.warn({ err: err.message }, 'E-mail failed'))));
  } catch (err) {
    logger.warn({ err: err.message }, 'E-mail error');
  }
}

module.exports = { sendEventEmail };
