/* GET /api/stats — every count, for the Site analytics section:
   {"total": 120, "pages": {"/about": 8}, "events": {"cv-download": 3}}
   The answer is cached for a minute, so busy times stay cheap. */
const { redis, PAGE, EVENT } = require("./_store");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://margie-marquez.web.app");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "GET only" });
  }
  try {
    const [flat] = await redis([["HGETALL", "counts"]]);
    const out = { total: 0, pages: {}, events: {} };
    for (let i = 0; i + 1 < (flat || []).length; i += 2) {
      const field = flat[i];
      const count = Number(flat[i + 1]) || 0;
      if (field === "total") out.total = count;
      else if (field.startsWith("page:") && PAGE.test(field.slice(5))) out.pages[field.slice(5)] = count;
      else if (field.startsWith("event:") && EVENT.test(field.slice(6))) out.events[field.slice(6)] = count;
    }
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json(out);
  } catch (err) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({ error: "stats unavailable" });
  }
};
