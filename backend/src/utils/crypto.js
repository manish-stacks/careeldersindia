const crypto = require('crypto');
const { env } = require('../config/env');

const KEY = Buffer.from(env.ENCRYPTION_KEY, 'hex');

/** AES-256-GCM field encryption for PAN / Gov ID / bank account numbers. */
function encrypt(plain) {
  if (plain === undefined || plain === null || plain === '') return undefined;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

function decrypt(payload) {
  if (!payload) return undefined;
  const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const last4 = (value) => (value ? String(value).slice(-4) : undefined);
const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('base64url');
const randomOtp = () => String(crypto.randomInt(100000, 1000000));

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

module.exports = { encrypt, decrypt, sha256, last4, randomToken, randomOtp, safeEqual };
