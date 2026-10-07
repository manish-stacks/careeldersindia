const multer = require('multer');
const { ApiError } = require('../utils/ApiError');

const ALLOWED = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
};
const MAX_BYTES = 8 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    const allowedExt = ALLOWED[file.mimetype];
    if (!allowedExt || !allowedExt.includes(ext)) return cb(ApiError.badRequest('Only JPG, PNG, WEBP or PDF files are allowed', 'INVALID_FILE_TYPE'));
    return cb(null, true);
  },
});

/** Declared MIME can be spoofed — confirm by magic bytes. */
function sniffMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.slice(0, 5).toString() === '%PDF-') return 'application/pdf';
  return null;
}

const verifyFileContent = (req, _res, next) => {
  if (!req.file) return next(ApiError.badRequest('File is required', 'FILE_REQUIRED'));
  const real = sniffMime(req.file.buffer);
  if (!real || real !== req.file.mimetype) return next(ApiError.badRequest('File content does not match its type', 'INVALID_FILE_CONTENT'));
  return next();
};

module.exports = { upload, verifyFileContent, sniffMime, ALLOWED };
