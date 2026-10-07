class ApiError extends Error {
  constructor(statusCode, message, code = 'ERROR', details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }

  static badRequest(msg, code = 'BAD_REQUEST', details) { return new ApiError(400, msg, code, details); }
  static unauthorized(msg = 'Authentication required', code = 'UNAUTHORIZED') { return new ApiError(401, msg, code); }
  static forbidden(msg = 'You do not have access to this resource', code = 'FORBIDDEN') { return new ApiError(403, msg, code); }
  static notFound(msg = 'Resource not found', code = 'NOT_FOUND') { return new ApiError(404, msg, code); }
  static conflict(msg, code = 'CONFLICT', details) { return new ApiError(409, msg, code, details); }
  static unprocessable(msg, code = 'UNPROCESSABLE', details) { return new ApiError(422, msg, code, details); }
}

module.exports = { ApiError };
