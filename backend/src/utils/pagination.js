function parsePagination(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

function pageMeta({ page, limit }, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) || 1 };
}

/** Escape user text before using in a RegExp search. */
function escapeRegex(str = '') {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 100);
}

module.exports = { parsePagination, pageMeta, escapeRegex };
