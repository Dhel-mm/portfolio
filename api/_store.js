/* Shared by /api/hit and /api/stats (files starting with "_" are not pages).
   Counts live in one Redis hash, "counts", in Vercel's Upstash for Redis
   storage. Vercel adds the address and key as environment variables when the
   storage is connected to the project; they are never in this code. */
const URL_VARS = ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL"];
const TOKEN_VARS = ["KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN"];
const pick = (names) => names.map((n) => process.env[n]).find(Boolean);

// Run several Redis commands in one request; returns their results in order
async function redis(commands) {
  const url = pick(URL_VARS);
  const token = pick(TOKEN_VARS);
  if (!url || !token) throw new Error("storage not connected");
  const res = await fetch(url.replace(/\/$/, "") + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(commands)
  });
  if (!res.ok) throw new Error("storage error " + res.status);
  const out = await res.json();
  return out.map((r) => {
    if (r.error) throw new Error(r.error);
    return r.result;
  });
}

// What may be counted: the site's own pages, and a fixed set of events.
// Anything else is refused, so nobody can fill the storage with junk.
const PAGE = /^\/(?:about|skills|projects|experience|education|cv|contact|analytics|projects\/[a-z0-9-]{1,40})?$/;
const EVENT = /^(?:cv-download|cv-view|certificate-view|contact-sent|device-(?:phone|tablet|desktop)|outbound\/[a-z0-9.-]{1,60})$/;

module.exports = { redis, PAGE, EVENT };
