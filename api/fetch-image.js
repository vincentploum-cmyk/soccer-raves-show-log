export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  const allowedHosts = ['crowdvolt.com', 'www.crowdvolt.com', 'dice.fm', 'www.dice.fm', 'ra.co', 'www.ra.co', 'shotgun.live', 'www.shotgun.live', 'ticketmaster.com', 'www.ticketmaster.com'];
  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
  if (!allowedHosts.includes(parsed.hostname)) {
    return res.status(400).json({ error: 'Host not allowed' });
  }

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SoccerRavesBot/1.0)' },
      redirect: 'follow',
    });
    if (!resp.ok) return res.status(200).json({ imageUrl: null });
    const html = await resp.text();

    const patterns = [
      /<meta\s+property="og:image"\s+content="([^"]+)"/i,
      /<meta\s+content="([^"]+)"\s+property="og:image"/i,
      /<meta\s+name="twitter:image"\s+content="([^"]+)"/i,
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m) return res.status(200).json({ imageUrl: m[1] });
    }
    return res.status(200).json({ imageUrl: null });
  } catch (err) {
    return res.status(200).json({ imageUrl: null, error: err.message });
  }
}
