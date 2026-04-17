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
    const jsonLdBlocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const block of jsonLdBlocks) {
      try {
        const data = JSON.parse(block[1]);
        const nodes = Array.isArray(data) ? data : (data['@graph'] ? data['@graph'] : [data]);
        for (const node of nodes) {
          const offers = node.offers;
          if (!offers) continue;
          const list = Array.isArray(offers) ? offers : [offers];
          const available = list.filter(o => !o.availability || o.availability.toString().toLowerCase().includes('instock'));
          const prices = available.map(o => parseFloat(o.price || o.lowPrice)).filter(p => !isNaN(p) && p > 0);
          if (prices.length) { price = Math.min(...prices); break; }
        }
        if (price !== null) break;
      } catch (_) {}
    }

    // Price — 2) Next.js __NEXT_DATA__ (used by Dice.fm)
    let debugInfo = null;
    if (price === null) {
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
      if (nextDataMatch) {
        try {
          const nextData = JSON.parse(nextDataMatch[1]);
          const json = JSON.stringify(nextData);
          if (debug) {
            // Extract all numeric values near price-related keys for inspection
            const priceKeys = [...json.matchAll(/"(price|faceValue|lowestPrice|amount|cost|fee|total)[^"]*"\s*:\s*([^,}\]]+)/gi)];
            debugInfo = priceKeys.slice(0, 20).map(m => ({ key: m[1], val: m[2].trim() }));
          }
          const priceMatch = json.match(/"faceValue"\s*:\s*(\d+(?:\.\d+)?)/) ||
                             json.match(/"lowestPrice"\s*:\s*(\d+(?:\.\d+)?)/) ||
                             json.match(/"totalPrice"\s*:\s*(\d+(?:\.\d+)?)/) ||
                             json.match(/"price"\s*:\s*(\d+(?:\.\d+)?)/);
          if (priceMatch) price = parseFloat(priceMatch[1]);
        } catch (_) {}
      }
    }

    return res.status(200).json({ imageUrl, price, ...(debug ? { debugInfo, htmlLen: html.length } : {}) });
  } catch (err) {
    return res.status(200).json({ imageUrl: null, price: null, error: err.message });
  }
}
