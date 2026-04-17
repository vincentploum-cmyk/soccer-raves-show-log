export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url, debug } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SoccerRaves/1.0)' },
      redirect: 'follow',
    });
    if (!response.ok) return res.status(200).json({ imageUrl: null, price: null });

    // If we were redirected away from the requested URL the event page doesn't exist
    const finalUrl = response.url;
    const requestedPath = new URL(url).pathname.replace(/\/$/, '');
    const finalPath = new URL(finalUrl).pathname.replace(/\/$/, '');
    if (requestedPath !== finalPath) return res.status(200).json({ imageUrl: null, price: null });

    const html = await response.text();

    // og:image
    const imgMatch =
      html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    const imageUrl = imgMatch?.[1] || null;

    // Price — 1) JSON-LD structured data
    let price = null;
    let jsonLdDebug = null;
    const jsonLdBlocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const block of jsonLdBlocks) {
      try {
        const data = JSON.parse(block[1]);
        const nodes = Array.isArray(data) ? data : (data['@graph'] ? data['@graph'] : [data]);
        for (const node of nodes) {
          const offers = node.offers;
          if (!offers) continue;
          const list = Array.isArray(offers) ? offers : [offers];
          if (debug) jsonLdDebug = list.map(o => ({ price: o.price, lowPrice: o.lowPrice, availability: o.availability }));
          const available = list.filter(o => !o.availability || o.availability.toString().toLowerCase().includes('instock'));
          const prices = available.map(o => parseFloat(o.price || o.lowPrice)).filter(p => !isNaN(p) && p > 0);
          if (prices.length) { price = Math.min(...prices); break; }
        }
        if (price !== null) break;
      } catch (_) {}
    }

    // Price — 2) Next.js __NEXT_DATA__ (used by Dice.fm)
    // Walk parsed JSON tree recursively to find price fields
    let debugInfo = null;
    if (price === null) {
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
      if (nextDataMatch) {
        try {
          const nextData = JSON.parse(nextDataMatch[1]);
          const priceFields = ['face_value', 'price', 'total_price', 'min_price', 'from_price', 'sale_price'];
          const found = [];

          // Recursively walk the object; nested JSON strings are re-parsed
          const walk = (val, depth) => {
            if (depth > 20) return;
            if (typeof val === 'string') {
              // Re-parse nested JSON strings (Dice wraps data inside stringified JSON)
              if (val.startsWith('{') || val.startsWith('[')) {
                try { walk(JSON.parse(val), depth + 1); } catch (_) {}
              }
              return;
            }
            if (typeof val === 'number') return;
            if (Array.isArray(val)) { val.forEach(v => walk(v, depth + 1)); return; }
            if (val && typeof val === 'object') {
              for (const [k, v] of Object.entries(val)) {
                if (priceFields.includes(k) && typeof v === 'number' && v > 0) {
                  found.push({ field: k, value: v });
                }
                // Also catch string-encoded numbers
                if (priceFields.includes(k) && typeof v === 'string' && /^\d+$/.test(v)) {
                  found.push({ field: k, value: parseFloat(v) });
                }
                walk(v, depth + 1);
              }
            }
          };
          walk(nextData, 0);

          if (debug) {
            // Also scan raw HTML for any numeric key:value pairs (all escape levels)
            const raw = nextDataMatch[1];
            const numericPairs = {};
            for (const m of raw.matchAll(/[\\]*"(\w+)[\\]*"\s*:\s*[\\]*"?(\d{3,6})[\\]*"?/g)) {
              const k = m[1], v = parseFloat(m[2]);
              if (v >= 100 && v <= 99999) {
                if (!numericPairs[k]) numericPairs[k] = [];
                if (!numericPairs[k].includes(v)) numericPairs[k].push(v);
              }
            }
            debugInfo = { found, numericPairs };
          }

          // Prefer face_value (in cents), then price
          const faceValues = found.filter(f => f.field === 'face_value' && f.value >= 100 && f.value <= 99999);
          if (faceValues.length) {
            price = Math.min(...faceValues.map(f => f.value)) / 100;
          } else {
            const prices = found.filter(f => f.value >= 100 && f.value <= 99999);
            if (prices.length) price = Math.min(...prices.map(f => f.value)) / 100;
          }

          // Fallback: scan raw string for Dice price fields (in cents)
          if (price === null) {
            const raw = nextDataMatch[1];
            const extract = (field) =>
              [...raw.matchAll(new RegExp(`[\\\\]*"${field}[\\\\]*"\\s*:\\s*[\\\\]*"?(\\d{3,6})[\\\\]*"?`, 'g'))]
                .map(m => parseFloat(m[1])).filter(p => !isNaN(p) && p >= 100 && p <= 99999);
            // amount_from = "from" price; amount = ticket amount (both in cents)
            const fromMatches = extract('amount_from');
            const amountMatches = extract('amount');
            const candidates = fromMatches.length ? fromMatches : amountMatches;
            if (candidates.length) price = Math.min(...candidates) / 100;
          }
        } catch (_) {}
      }
    }

    return res.status(200).json({ imageUrl, price, ...(debug ? { debugInfo, jsonLdDebug, htmlLen: html.length } : {}) });
  } catch (err) {
    return res.status(200).json({ imageUrl: null, price: null, error: err.message });
  }
}
