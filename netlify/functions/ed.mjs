// Advon Editor — server side (Netlify Function + Blobs). Edits cost no deploy.
// The passcode lives ONLY in the Netlify environment variable ADMIN_PASS.
import { getStore } from '@netlify/blobs';
import { createHmac, timingSafeEqual } from 'node:crypto';

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
const store = () => getStore('advon-editor');
const KEY = /^[cm]:[a-z0-9]{3,20}$/;
const PATH = /^[A-Za-z0-9\-_.\/%]{0,240}$/;
const EMPTY = { v: 1, t: '', pages: {}, all: {} };

const sign = (exp, pass) => createHmac('sha256', pass).update('aded.' + exp).digest('hex');
function tokenFor(pass) { const exp = Date.now() + 12 * 3600 * 1000; return exp + '.' + sign(exp, pass); }
function authed(req) {
  const pass = process.env.ADMIN_PASS || '';
  if (pass.length < 6) return false;
  const [exp, sig] = String(req.headers.get('x-ed-token') || '').split('.');
  if (!exp || !sig || +exp < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp, pass));
  return a.length === b.length && timingSafeEqual(a, b);
}
function clean(c) {
  const out = { v: 1, t: new Date().toISOString(), pages: {}, all: {} };
  const map = (src) => { const m = {}; for (const [k, v] of Object.entries(src || {})) if (KEY.test(k) && typeof v === 'string' && v.length <= 8000) m[k] = v; return m; };
  out.all = map(c && c.all);
  for (const [p, m] of Object.entries((c && c.pages) || {})) { if (!PATH.test(p) || p.includes('..')) continue; const mm = map(m); if (Object.keys(mm).length) out.pages[p] = mm; }
  return out;
}

export default async (req) => {
  const url = new URL(req.url);
  const act = url.pathname.replace(/^.*\/api\/ed\/?/, '').replace(/\/+$/, '');
  const s = store();
  try {
    if (req.method === 'GET' && act === 'content') {
      const c = (await s.get('content', { type: 'json' })) || EMPTY;
      return json(c, 200, { 'cache-control': 'public, max-age=0, must-revalidate', 'netlify-cdn-cache-control': 'public, max-age=30, stale-while-revalidate=300' });
    }
    if (req.method === 'GET' && act === 'status') return json({ ok: true, ready: (process.env.ADMIN_PASS || '').length >= 6 });
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    const raw = await req.text();
    if (raw.length > 2500000) return json({ error: 'too_big' }, 413);
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { return json({ error: 'bad_json' }, 400); }

    if (act === 'login') {
      const pass = process.env.ADMIN_PASS || '';
      if (pass.length < 6) return json({ error: 'not_ready' }, 503);
      const lock = (await s.get('lock', { type: 'json' })) || { n: 0, at: 0 };
      if (lock.n >= 8 && Date.now() - lock.at < 15 * 60 * 1000) return json({ error: 'locked' }, 429);
      const a = Buffer.from(String(body.pass || '')), b = Buffer.from(pass);
      if (a.length === b.length && timingSafeEqual(a, b)) { if (lock.n) await s.setJSON('lock', { n: 0, at: 0 }); return json({ ok: true, token: tokenFor(pass) }); }
      await s.setJSON('lock', { n: (Date.now() - lock.at < 15 * 60 * 1000 ? lock.n : 0) + 1, at: Date.now() });
      return json({ error: 'wrong' }, 401);
    }
    if (!authed(req)) return json({ error: 'auth' }, 401);
    if (act === 'save') {
      const next = clean(body.content);
      const cur = (await s.get('content', { type: 'json' })) || EMPTY;
      await s.setJSON('prev', cur);
      if (cur.t) await s.setJSON('history/' + cur.t.replace(/[^0-9TZ]/g, ''), cur);
      await s.setJSON('content', next);
      return json({ ok: true, content: next });
    }
    if (act === 'undo') {
      const prev = await s.get('prev', { type: 'json' });
      if (!prev) return json({ error: 'nothing' }, 404);
      const cur = (await s.get('content', { type: 'json' })) || EMPTY;
      prev.t = new Date().toISOString();
      await s.setJSON('content', prev); await s.setJSON('prev', cur);
      return json({ ok: true, content: prev });
    }
    return json({ error: 'unknown' }, 404);
  } catch (e) {
    return json({ error: 'server', detail: String(e && e.message || e).slice(0, 200) }, 500);
  }
};
export const config = { path: '/api/ed/*' };
