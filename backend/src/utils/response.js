function ok(res, data = {}, message = 'OK', statusCode = 200, meta) {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

function created(res, data, message = 'Created successfully') {
  return ok(res, data, message, 201);
}

module.exports = { ok, created };
