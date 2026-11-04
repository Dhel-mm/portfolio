/* POST /api/hit {"path": "/about"} or {"path": "cv-download", "event": true}
   Adds one to that count. No cookies, and nothing about the visitor is
   stored: the address of the request is only used, hashed, for a
   one-minute limit against floods. */
const crypto = require("crypto");
const { redis, PAGE, EVENT } = require("./_store");

const LIMIT_PER_MINUTE = 30;
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse/i;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST only" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  const path = body && typeof body.path === "string" ? body.path.slice(0, 80) : "";
  const isEvent = !!(body && body.event);
  if (!(isEvent ? EVENT : PAGE).test(path)) return res.status(400).json({ error: "unknown path" });

  // search engines and link previews are not visitors
  if (BOT.test(req.headers["user-agent"] || "")) return res.status(204).end();

  try {
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    const key = "limit:" + crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
    const [hits] = await redis([["INCR", key], ["EXPIRE", key, 60]]);
    if (hits > LIMIT_PER_MINUTE) return res.status(429).json({ error: "too many" });

    const field = (isEvent ? "event:" : "page:") + path;
    const commands = [["HINCRBY", "counts", field, 1]];
    if (!isEvent) commands.push(["HINCRBY", "counts", "total", 1]);
    await redis(commands);
    return res.status(204).end();
  } catch (err) {
    return res.status(503).json({ error: "not counted" });
  }
};
