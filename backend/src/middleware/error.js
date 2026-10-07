const mongoose = require('mongoose');
const multer = require('multer');
const { env } = require('../config/env');
const { logger } = require('../config/logger');
const { ApiError } = require('../utils/ApiError');

const notFound = (req, _res, next) => next(ApiError.notFound(`Route ${req.method} ${req.originalUrl.split('?')[0]} not found`, 'ROUTE_NOT_FOUND'));

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  let error = err;

  if (err instanceof mongoose.Error.CastError) error = ApiError.badRequest(`Invalid ${err.path}`, 'INVALID_ID');
  else if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    error = ApiError.badRequest('Validation failed', 'VALIDATION_ERROR', details);
  } else if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    error = ApiError.conflict(`${field} already exists`, 'DUPLICATE_KEY');
  } else if (err instanceof multer.MulterError) {
    error = ApiError.badRequest(err.code === 'LIMIT_FILE_SIZE' ? 'File too large' : err.message, 'UPLOAD_ERROR');
  } else if (err?.type === 'entity.parse.failed') {
    error = ApiError.badRequest('Malformed JSON body', 'MALFORMED_JSON');
  } else if (!(err instanceof ApiError)) {
    error = new ApiError(500, 'Something went wrong', 'INTERNAL_ERROR');
    error.isOperational = false;
  }

  if (error.statusCode >= 500) logger.error({ err, requestId: req.id }, 'Unhandled error');

  const body = { success: false, message: error.message, code: error.code };
  if (error.details) body.details = error.details;
  if (!env.isProd && !error.isOperational) body.stack = err.stack;
  res.status(error.statusCode).json(body);
};

module.exports = { notFound, errorHandler };
