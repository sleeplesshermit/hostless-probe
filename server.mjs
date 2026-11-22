import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns/promises';

const PORT = process.env.PORT || 8000;
let cache = { status: 'probing' };

function tcp(host, port, ms = 5000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const s = net.connect({ host, port });
    const done = (ok, err) => { s.destroy(); resolve({ host, port, ok, ms: Date.now() - t0, err: err || undefined }); };
    s.setTimeout(ms);
    s.once('connect', () => done(true));
    s.once('timeout', () => done(false, 'timeout'));
    s.once('error', (e) => done(false, e.code || e.message));
  });
}

async function probe() {
  const out = { at: new Date().toISOString() };
  out.egress = {};
  for (const u of ['http://ip-api.com/json/?fields=status,country,countryCode,city,isp,org,query', 'https://ifconfig.co/json', 'https://ipapi.co/json/']) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
      out.egress[u] = await r.json();
    } catch (e) { out.egress[u] = { error: String(e) }; }
  }
  try { out.dns_example = await dns.lookup('example.com'); } catch (e) { out.dns_example = { error: String(e) }; }
  try { out.dns_region1 = await dns.lookup('region1.argotunnel.com'); } catch (e) { out.dns_region1 = { error: String(e) }; }
  out.tcp = [];
  for (const [h, p] of [['region1.argotunnel.com', 7844], ['region2.argotunnel.com', 7844], ['1.1.1.1', 443], ['github.com', 22], ['api.trycloudflare.com', 443]]) {
    out.tcp.push(await tcp(h, p));
  }
  return out;
}

probe().then((r) => { cache = r; }).catch((e) => { cache = { error: String(e) }; });
setInterval(() => { probe().then((r) => { cache = r; }).catch(() => {}); }, 600000);

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(cache, null, 2));
}).listen(PORT, '0.0.0.0', () => console.log('probe listening on', PORT));
