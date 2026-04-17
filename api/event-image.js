export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SoccerRaves/1.0)' },
    });
    if (!response.ok) return res.status(200).json({ imageUrl: null, price: null });

    const html = await response.text();

    // og:image
    const imgMatch =
      html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    const imageUrl = imgMatch?.[1] || null;

    // Price — try JSON-LD structured data first
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
          const prices = list.map(o => parseFloat(o.price || o.lowPrice)).filter(p => !isNaN(p) && p > 0);
          if (prices.length) { price = Math.min(...prices); break; }
        }
        if (price !== null) break;
      } catch (_) {}
    }

    // Fallback: scan for "$XX" patterns near "ticket" keyword
    if (price === null) {
      const priceMatches = [...html.matchAll(/\$\s*(\d+(?:\.\d{1,2})?)/g)].map(m => parseFloat(m[1])).filter(p => p > 0 && p < 10000);
      if (priceMatches.length) price = Math.min(...priceMatches);
    }

    return res.status(200).json({ imageUrl, price });
  } catch (err) {
    return res.status(200).json({ imageUrl: null, price: null, error: err.message });
  }
}
