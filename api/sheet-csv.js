export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
  const allowedHosts = ['docs.google.com', 'sheets.googleusercontent.com', 'doc-0c-3s-sheets.googleusercontent.com'];
  // Allow any *.googleusercontent.com (Google's redirect target for sheet exports).
  const hostOk = allowedHosts.includes(parsed.hostname) || parsed.hostname.endsWith('.googleusercontent.com');
  if (!hostOk) return res.status(400).json({ error: 'Host not allowed' });

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SoccerRavesBot/1.0)' },
      redirect: 'follow',
    });
    if (!resp.ok) return res.status(502).json({ error: `Upstream ${resp.status}` });
    const text = await resp.text();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    return res.status(200).send(text);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
