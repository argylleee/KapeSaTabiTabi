// Vercel serverless function: proxies the Overpass cafe query server-side.
// The browser calling overpass-api.de directly fails with a CORS error from
// this app's Vercel domain (confirmed — the API doesn't send an
// Access-Control-Allow-Origin header for it). CORS is a browser-only
// restriction, so a server-to-server fetch from here isn't subject to it.
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

module.exports = async function handler(req, res) {
  const { lat, lon, radius = "3000" } = req.query;
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);

  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
    res.status(400).json({ error: "lat and lon query params are required" });
    return;
  }

  const query = `
    [out:json];
    (
      node["amenity"="cafe"](around:${radius},${latNum},${lonNum});
      way["amenity"="cafe"](around:${radius},${latNum},${lonNum});
    );
    out center tags;
  `;

  for (const endpoint of OVERPASS_MIRRORS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: query,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) continue;

      const data = await response.json();
      res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
      res.status(200).json(data);
      return;
    } catch (err) {
      clearTimeout(timeoutId);
      console.error(`Overpass mirror ${endpoint} failed:`, err.message);
    }
  }

  res.status(502).json({ error: "All Overpass mirrors are currently unreachable" });
};
