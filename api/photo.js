// Vercel serverless function: proxies a Google Places photo, keeping the API
// key server-side. Building the photo URL client-side (with ?key=... in it)
// would leak the key via the <img> src / Network tab even if the main
// search call is otherwise proxied correctly.
const { guard } = require("./_guard.js");

module.exports = async function handler(req, res) {
  if (!(await guard(req, res))) return;

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GOOGLE_PLACES_API_KEY is not configured on the server" });
    return;
  }

  const { name, maxHeightPx = "200" } = req.query;
  // name looks like "places/XXXX/photos/YYYY" — reject anything else so this
  // endpoint can't be used as an open proxy to arbitrary Google URLs.
  if (typeof name !== "string" || !/^places\/[^/]+\/photos\/[^/]+$/.test(name)) {
    res.status(400).json({ error: "invalid photo name" });
    return;
  }

  const upstream = `https://places.googleapis.com/v1/${name}/media?maxHeightPx=${encodeURIComponent(maxHeightPx)}&key=${apiKey}`;

  try {
    const response = await fetch(upstream, { redirect: "follow" });
    if (!response.ok) {
      res.status(502).json({ error: "Upstream photo fetch failed" });
      return;
    }
    res.setHeader("Content-Type", response.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    const buffer = Buffer.from(await response.arrayBuffer());
    res.status(200).send(buffer);
  } catch (err) {
    console.error("Photo proxy failed:", err.message);
    res.status(502).json({ error: "Photo fetch failed" });
  }
};
