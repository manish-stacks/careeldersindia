/**
 * Object storage abstraction. Binaries never go into MongoDB.
 * - local: files on disk, served through HMAC-signed, expiring URLs
 * - s3:    any S3-compatible private bucket, served via presigned GET URLs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { env } = require('./env');

const SIGNED_URL_TTL_SECONDS = 15 * 60;

function signLocal(key, exp) {
  return crypto.createHmac('sha256', env.MEDIA_SIGNING_SECRET).update(`${key}:${exp}`).digest('hex');
}

function verifyLocalSignature(key, exp, sig) {
  if (!key || !exp || !sig) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(signLocal(key, exp));
  const given = Buffer.from(String(sig));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function safeLocalPath(key) {
  const root = path.resolve(env.STORAGE_LOCAL_DIR);
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error('Invalid storage key');
  return full;
}

const localDriver = {
  name: 'local',
  async put(key, buffer) {
    const full = safeLocalPath(key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, buffer);
    return key;
  },
  async get(key) {
    return fs.promises.readFile(safeLocalPath(key));
  },
  createReadStream(key) {
    return fs.createReadStream(safeLocalPath(key));
  },
  async remove(key) {
    await fs.promises.rm(safeLocalPath(key), { force: true });
  },
  async getSignedUrl(key, ttl = SIGNED_URL_TTL_SECONDS) {
    const exp = Math.floor(Date.now() / 1000) + ttl;
    const sig = signLocal(key, exp);
    return `${env.API_PUBLIC_URL}/api/v1/media/file?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sig}`;
  },
};

function buildS3Driver() {
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const s3 = new S3Client({
    region: env.STORAGE_REGION,
    endpoint: env.STORAGE_ENDPOINT || undefined,
    forcePathStyle: Boolean(env.STORAGE_ENDPOINT),
    credentials: { accessKeyId: env.STORAGE_ACCESS_KEY, secretAccessKey: env.STORAGE_SECRET_KEY },
  });
  const Bucket = env.STORAGE_BUCKET;
  return {
    name: 's3',
    async put(key, buffer, contentType) {
      await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: buffer, ContentType: contentType }));
      return key;
    },
    async get(key) {
      const out = await s3.send(new GetObjectCommand({ Bucket, Key: key }));
      return Buffer.from(await out.Body.transformToByteArray());
    },
    async remove(key) {
      await s3.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    async getSignedUrl(key, ttl = SIGNED_URL_TTL_SECONDS) {
      return getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: key }), { expiresIn: ttl });
    },
  };
}

const storage = env.STORAGE_DRIVER === 's3' ? buildS3Driver() : localDriver;

module.exports = { storage, verifyLocalSignature, localDriver };
