// Shared abuse guards for the Places proxy endpoints (api/cafes.js,
// api/photo.js) — both cost real Google API quota per request, so both get
// the same two layers: reject requests that didn't come from this site, and
// cap how many requests any one visitor can make per minute.

// `Sec-Fetch-Site` is sent by all modern browsers (Fetch Metadata Request
// Headers) and isn't spoofable the way Origin/Referer effectively are for
// this purpose in a browser context — a same-origin page load or fetch()
// from our own frontend always reports "same-origin". A request with no
// Fetch Metadata header AND no Referer is almost certainly a script/curl
// hitting the endpoint directly rather than a browser loading our site.
function isAllowedOrigin(req) {
  const fetchSite = req.headers["sec-fetch-site"];
  if (fetchSite) {
    return fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none";
  }
  const referer = req.headers.referer;
  if (!referer) return false;
  try {
    return new URL(referer).host === req.headers.host;
  } catch {
    return false;
  }
}

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

let ratelimitPromise; // lazy-init once per warm serverless instance, not per request

async function getRatelimit() {
  if (ratelimitPromise !== undefined) return ratelimitPromise;

  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    // No KV/Redis store configured. Rather than fail closed (which would
    // take the whole site down if the store is ever unset/misconfigured),
    // skip rate limiting and rely on the origin check + Google Cloud's own
    // quota cap as the remaining safety nets.
    ratelimitPromise = null;
    return ratelimitPromise;
  }

  const { Ratelimit } = require("@upstash/ratelimit");
  const { Redis } = require("@upstash/redis");

  ratelimitPromise = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(20, "1 m"), // 20 requests/minute per IP, shared across both endpoints
    prefix: "kst_ratelimit",
  });
  return ratelimitPromise;
}

// Returns true if the request should proceed. Writes the 403/429 response
// itself and returns false otherwise, so callers can just `if (!(await
// guard(req, res))) return;`.
async function guard(req, res) {
  if (!isAllowedOrigin(req)) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }

  const ratelimit = await getRatelimit();
  if (!ratelimit) return true;

  const ip = getClientIp(req);
  const { success, limit, remaining, reset } = await ratelimit.limit(ip);
  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(remaining));
  if (!success) {
    res.setHeader("Retry-After", String(Math.max(0, Math.ceil((reset - Date.now()) / 1000))));
    res.status(429).json({ error: "Too many requests. Please slow down." });
    return false;
  }
  return true;
}

module.exports = { guard };
