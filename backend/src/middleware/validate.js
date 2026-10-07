const { ApiError } = require('../utils/ApiError');

/** validate({ body, query, params }) with zod schemas. Parsed values replace originals. */
const validate = (schemas) => (req, _res, next) => {
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(ApiError.badRequest(`Validation failed: ${details[0].field || part} ${details[0].message}`, 'VALIDATION_ERROR', details));
    }
    if (part === 'query') {
      Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true });
    } else {
      req[part] = result.data;
    }
  }
  return next();
};

module.exports = { validate };
