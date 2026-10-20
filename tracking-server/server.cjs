#!/usr/bin/env node
/**
 * tracking-server — self-hosted replacement for link.getmailspring.com
 *
 * Endpoints the Mailspring client expects (see app/internal_packages/{open,link}-tracking):
 *   GET /o/<token>.png          tracking pixel; token = base64url(JSON{messageId,accountId,recipient})
 *   GET /link/<messageId>/<i>   link redirect; ?redirect=<url-encoded target>
 *   GET /api/tracked            aggregate counts the fork polls back into message metadata
 *
 * No dependencies: node:http + a JSON file. Node >= 18.
 *
 * Env: PORT (5199), BIND (127.0.0.1), DATA_FILE (./tracking-data.json), API_TOKEN (optional
 * bearer for /api/tracked — the client sends it as ?token= or Authorization).
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 5199);
const BIND = process.env.BIND || '127.0.0.1';
const DATA_FILE = path.resolve(process.env.DATA_FILE || path.join(__dirname, 'tracking-data.json'));
const API_TOKEN = process.env.API_TOKEN || '';

// 1x1 transparent GIF-sized PNG, the same shape every tracking pixel uses.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

// ---------------------------------------------------------------- persistence

let db = { messages: {} };
try {
  db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!db.messages) db.messages = {};
} catch {
  /* first boot */
}

let dirty = false;
function touch() {
  dirty = true;
}
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);
}, 1000).unref();

function entry(messageId, accountId) {
  let e = db.messages[messageId];
  if (!e) {
    e = { messageId, accountId: accountId || null, opens: {}, links: {}, createdAt: new Date().toISOString() };
    db.messages[messageId] = e;
  }
  if (accountId && !e.accountId) e.accountId = accountId;
  return e;
}

// ---------------------------------------------------------------- helpers

function decodeToken(token) {
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function pixel(res) {
  res.writeHead(200, {
    'content-type': 'image/png',
    'content-length': PIXEL.length,
    'cache-control': 'no-store, no-cache, must-revalidate, private',
    pragma: 'no-cache',
  });
  res.end(PIXEL);
}

function json(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}

function authorized(req, url) {
  if (!API_TOKEN) return true;
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return bearer === API_TOKEN || url.searchParams.get('token') === API_TOKEN;
}

// Gmail/Outlook proxy images through their own caches; those "opens" are not a human.
const PROXY_UA = /googleimageproxy|ggpht|outlook|microsoft office|yahoo|proofpoint|mimecast|barracuda/i;

// ---------------------------------------------------------------- routes

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  if (p === '/health') return json(res, 200, { ok: true, tracked: Object.keys(db.messages).length });

  // ---- tracking pixel
  if (p.startsWith('/o/')) {
    const token = p.slice(3).replace(/\.png$/i, '');
    const t = decodeToken(token);
    if (!t || !t.messageId) return pixel(res);
    const e = entry(t.messageId, t.accountId);
    const key = (t.recipient || 'unknown').toLowerCase();
    const o = (e.opens[key] ||= { count: 0, first: null, last: null, proxyHits: 0, uas: [] });
    const ua = String(req.headers['user-agent'] || '');
    const proxy = PROXY_UA.test(ua);
    o.count += 1;
    if (proxy) o.proxyHits += 1;
    o.first ||= new Date().toISOString();
    o.last = new Date().toISOString();
    if (ua && !o.uas.includes(ua.slice(0, 120))) o.uas = [...o.uas.slice(-4), ua.slice(0, 120)];
    touch();
    if (process.env.VERBOSE) console.log(`open ${t.messageId} ${key}${proxy ? ' (proxy)' : ''}`);
    return pixel(res);
  }

  // ---- link redirect: /link/<messageId>/<index>?redirect=<url>
  if (p.startsWith('/link/')) {
    // The client interpolates the raw Message-ID into the path (`<id@host>`), so the
    // segments arrive percent-encoded — decode them or clicks land under a different
    // key than the opens for the same message.
    const seg = p.split('/').map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
    const messageId = seg[2] || '';
    const idxRaw = seg[3] || '0';
    const target = url.searchParams.get('redirect');
    let ok = false;
    try {
      const u = new URL(target);
      ok = u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      ok = false;
    }
    if (!ok) return json(res, 400, { error: 'missing or invalid redirect target' });

    const e = entry(messageId);
    const idx = Number(idxRaw);
    const l = (e.links[idx] ||= { url: target, clicks: [] });
    // The composer appends `&recipient=<base64(email)>` to each per-recipient link.
    let rcpt = '';
    const rawRcpt = url.searchParams.get('recipient');
    if (rawRcpt) {
      try {
        rcpt = Buffer.from(rawRcpt, 'base64').toString('utf8').trim().toLowerCase();
      } catch {
        rcpt = '';
      }
    }
    l.clicks.push({
      at: new Date().toISOString(),
      recipient: rcpt || null,
      ua: String(req.headers['user-agent'] || '').slice(0, 120),
    });
    if (l.clicks.length > 200) l.clicks = l.clicks.slice(-200);
    touch();
    res.writeHead(302, { location: target, 'cache-control': 'no-store' });
    return res.end();
  }

  // ---- aggregate for the client poller
  if (p === '/api/tracked') {
    if (!authorized(req, url)) return json(res, 401, { error: 'unauthorized' });
    const accountId = url.searchParams.get('accountId');
    const messages = Object.values(db.messages)
      .filter((e) => !accountId || e.accountId === accountId)
      .map((e) => {
        const recipients = Object.entries(e.opens).map(([email, o]) => ({
          email,
          count: o.count,
          proxyHits: o.proxyHits || 0,
          firstOpenAt: o.first,
          lastOpenAt: o.last,
        }));
        const opens = recipients.reduce((n, r) => n + r.count, 0);
        const lastOpenAt = recipients.map((r) => r.lastOpenAt).filter(Boolean).sort().pop() || null;
        // open_data: [{recipient, timestamp(unix seconds)}] — the shape the popover renders.
        const openData = Object.entries(e.opens)
          .flatMap(([email, o]) =>
            Array.from({ length: o.count }, () => ({
              recipient: email,
              timestamp: Math.round(new Date(o.last).getTime() / 1000),
            }))
          )
          .slice(-50);
        return {
          messageId: e.messageId,
          accountId: e.accountId,
          opens,
          lastOpenAt,
          recipients,
          openData,
          links: Object.entries(e.links).map(([index, l]) => ({
            index: Number(index),
            url: l.url,
            clickCount: l.clicks.length,
            lastClickAt: l.clicks.length ? l.clicks[l.clicks.length - 1].at : null,
            clickData: l.clicks.slice(-50).map((c) => ({
              recipient: c.recipient || 'unknown',
              timestamp: Math.round(new Date(c.at).getTime() / 1000),
            })),
          })),
        };
      });
    return json(res, 200, { messages });
  }

  if (p === '/') {
    const rows = Object.values(db.messages)
      .map((e) => {
        const opens = Object.values(e.opens).reduce((n, o) => n + o.count, 0);
        const clicks = Object.values(e.links).reduce((n, l) => n + l.clicks.length, 0);
        return `<tr><td><code>${e.messageId}</code></td><td>${opens}</td><td>${clicks}</td></tr>`;
      })
      .join('');
    const html = `<!doctype html><meta charset=utf-8><title>tracking</title>
<style>body{font:14px system-ui;margin:2rem}td,th{padding:.25rem .75rem;text-align:left;border-bottom:1px solid #ddd}</style>
<h1>Tracking</h1><p>${Object.keys(db.messages).length} berichten gevolgd.</p>
<table><tr><th>message-id</th><th>opens</th><th>clicks</th></tr>${rows}</table>`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  json(res, 404, { error: 'not found' });
});

server.listen(PORT, BIND, () => {
  console.log(`tracking-server on http://${BIND}:${PORT}  data=${DATA_FILE}${API_TOKEN ? '  (api token required)' : ''}`);
});
