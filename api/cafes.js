// Vercel serverless function: Google Places "nearby cafes" search.
//
// The API key lives ONLY here, read from a Vercel environment variable —
// it is never sent to the browser, never in the committed source, and never
// visible in DevTools. A browser-embedded key can't be protected: HTTP
// referrer restrictions are trivially spoofable (any HTTP client can just
// set the Referer header), so a leaked key can be used to bill the account.
const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.photos",
  "places.currentOpeningHours.openNow",
  "places.currentOpeningHours.weekdayDescriptions",
  "places.accessibilityOptions.wheelchairAccessibleEntrance",
  "places.outdoorSeating",
  "places.restroom",
  "places.paymentOptions.acceptsCreditCards",
  "places.paymentOptions.acceptsDebitCards"
].join(",");

module.exports = async function handler(req, res) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GOOGLE_PLACES_API_KEY is not configured on the server" });
    return;
  }

  const { lat, lon, radius = "3000" } = req.query;
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  const radiusNum = Math.min(parseFloat(radius) || 3000, 50000);

  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
    res.status(400).json({ error: "lat and lon query params are required" });
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": PLACES_FIELD_MASK
      },
      body: JSON.stringify({
        includedTypes: ["cafe"],
        maxResultCount: 20,
        locationRestriction: {
          circle: { center: { latitude: latNum, longitude: lonNum }, radius: radiusNum }
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      // Log the detail server-side; don't echo Google's full error (it can
      // name the project) back to the browser — TEMP: surfacing just the
      // short reason code for debugging, remove once this is working.
      console.error("Places API error:", response.status, JSON.stringify(data));
      const reason = data.error?.status || data.error?.details?.[0]?.reason || null;
      res.status(502).json({ error: "Upstream places lookup failed", googleStatus: response.status, reason });
      return;
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ places: data.places || [] });
  } catch (err) {
    console.error("Places request failed:", err.message);
    res.status(504).json({ error: "Places lookup timed out" });
  } finally {
    clearTimeout(timeoutId);
  }
};
