export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(200).json({ image: null });

  let parsed;
  try { parsed = new URL(url); } catch { return res.status(200).json({ image: null }); }

  const allowedHosts = ['crowdvolt.com', 'www.crowdvolt.com', 'dice.fm', 'www.dice.fm'];
  if (!allowedHosts.includes(parsed.hostname)) return res.status(200).json({ image: null });

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SoccerRaves/1.0)' },
      redirect: 'follow',
    });
    if (!response.ok) return res.status(200).json({ image: null });

    // If CrowdVolt/Dice redirected away from the requested path, the event page doesn't exist.
    try {
      const requestedPath = new URL(url).pathname.replace(/\/$/, '');
      const finalPath = new URL(response.url).pathname.replace(/\/$/, '');
      if (requestedPath && finalPath && requestedPath !== finalPath) return res.status(200).json({ image: null });
    } catch { /* ignore */ }

    const html = await response.text();

    // CrowdVolt: prefer the clean artist portrait embedded in the page
    // (img.crowdvolt.com/<uuid>.<ext>) over the og:image, which is a branded share card.
    const isCrowdvolt = parsed.hostname === 'crowdvolt.com' || parsed.hostname === 'www.crowdvolt.com';
    if (isCrowdvolt) {
      const portrait = html.match(/https?:\/\/img\.crowdvolt\.com\/[a-f0-9-]+\.(?:png|jpg|jpeg|webp)/i);
      if (portrait) return res.status(200).json({ image: portrait[0] });
    }

    const m =
      html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    return res.status(200).json({ image: m?.[1] || null });
  } catch {
    return res.status(200).json({ image: null });
  }
}
