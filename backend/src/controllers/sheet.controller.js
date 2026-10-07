const { asyncHandler } = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const access = require('../services/access.service');
const sheets = require('../services/sheet.service');

const link = (req) => {
  const { month, date, format } = req.query;
  const url = sheets.makeLink({ parentId: req.params.id, month: date ? undefined : month, date, format });
  return { url, expiresInSeconds: 900 };
};

module.exports = {
  customerLink: asyncHandler(async (req, res) => { await access.assertParentAccess(req.user, req.params.id); return ok(res, link(req)); }),
  adminLink: asyncHandler(async (req, res) => ok(res, link(req))),
  /** Signed link, no bearer (opened in a browser / download manager). */
  file: asyncHandler(async (req, res) => {
    const q = sheets.readLink(req.query.t);
    const f = await sheets.render(q.parentId, q);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${f.fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(f.buffer);
  }),
};
