// Public endpoints used by the website, served at /api/ on the public domain through Caddy.
// No Cloudflare Access here: everything is validated, rate-limited and returns only approved content.
import express from 'express';
import { CommunityError, RESOURCE_CATEGORIES, RESOURCE_LANGS, SEED_NAME } from './community.js';

export function publicApi({ store, community, verifyMember, allowedOrigins = [], turnstileSecret }) {
  const r = express.Router();
  r.use(express.json({ limit: '16kb' }));
  r.use(express.urlencoded({ extended: false, limit: '16kb' }));

  // Same-origin in production (Caddy). Extra origins only for local development and the design preview.
  r.use((req, res, next) => {
    const origin = req.get('Origin');
    if (origin && allowedOrigins.includes(origin)) {
      res.set({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST', Vary: 'Origin' });
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    res.set({ 'X-Robots-Tag': 'noindex', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" });
    next();
  });

  const limiter = (max, windowMs) => {
    const hits = new Map(); setInterval(() => hits.clear(), windowMs).unref();
    return (req, res, next) => {
      const key = req.get('Cf-Connecting-Ip') || req.ip; const n = (hits.get(key) || 0) + 1; hits.set(key, n);
      if (n > max) return res.status(429).json({ error: 'Shumë kërkesa. Provo sërish më vonë.' });
      next();
    };
  };
  const fail = (res, e) => {
    if (e instanceof CommunityError || (e.status && e.status < 500) || e.status === 503) return res.status(e.status || 400).set('Cache-Control', 'no-store').json({ error: e.message });
    console.error(e); return res.status(500).set('Cache-Control', 'no-store').json({ error: 'Diçka nuk shkoi. Provo sërish.' });
  };
  const bearer = (req) => (req.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim() || null;
  const clientIp = (req) => req.get('Cf-Connecting-Ip') || req.ip;

  // ----- Student resources -----
  const resourcesJson = (req, res) => {
    const items = store.listResources('approved').map(x => ({
      id: x.id, title: x.title, url: x.url, category: x.category, description: x.description,
      language: x.language, featured: !!x.featured, suggested_by: x.submitter_name && x.submitter_name !== SEED_NAME ? x.submitter_name : null, added: (x.decided_at || x.created_at).slice(0, 10),
    }));
    res.set('Cache-Control', 'public, max-age=15, s-maxage=60').json({ categories: RESOURCE_CATEGORIES, languages: RESOURCE_LANGS, resources: items });
  };
  r.get(['/burime', '/burime.json'], resourcesJson);

  r.post('/burime', limiter(20, 60 * 60e3), async (req, res) => {
    try {
      if (turnstileSecret) {
        const token = req.body['cf-turnstile-response'];
        const ok = token && await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST', body: new URLSearchParams({ secret: turnstileSecret, response: String(token), remoteip: clientIp(req) || '' }),
          signal: AbortSignal.timeout(5000),
        }).then(x => x.json()).then(j => j.success === true).catch(() => false);
        if (!ok) throw new CommunityError('Verifikimi kundër spam-it dështoi. Rifresko faqen dhe provo sërish.');
      }
      community.suggest(req.body, clientIp(req));
      res.status(202).set('Cache-Control', 'no-store').json({ ok: true, message: 'Faleminderit! Redaksia e shqyrton sugjerimin para se të shfaqet në faqe.' });
    } catch (e) { fail(res, e); }
  });

  // ----- Polls -----
  r.get(['/sondazhe', '/sondazhe.json'], (req, res) => {
    res.set('Cache-Control', 'public, max-age=10, s-maxage=30').json({ label: 'Sondazh i hapur për lexuesit, jo përfaqësues', polls: community.publicPolls(null) });
  });

  // The signed-in reader's view: which polls they voted in, and the results of those. Never cached.
  r.get('/sondazhe/une', limiter(120, 60e3), async (req, res) => {
    try {
      const email = await verifyMember(bearer(req));
      res.set('Cache-Control', 'no-store').json({ polls: community.publicPolls(email) });
    } catch (e) { fail(res, e); }
  });

  r.get('/sondazhe/:slug', limiter(120, 60e3), async (req, res) => {
    try {
      const p = store.getPollBySlug(req.params.slug);
      if (!p || p.status === 'draft') throw new CommunityError('Sondazhi nuk u gjet.', 404);
      const email = bearer(req) ? await verifyMember(bearer(req)) : null;
      res.set('Cache-Control', 'no-store').json(community.publicPoll(p, email)); // never cached: a shared cache could mix readers up
    } catch (e) { fail(res, e); }
  });

  r.post('/sondazhe/:slug/vote', limiter(40, 60 * 60e3), async (req, res) => {
    try {
      const email = await verifyMember(bearer(req));
      const out = community.vote(req.params.slug, email, req.body.option);
      res.set('Cache-Control', 'no-store').json({ ok: true, ...out });
    } catch (e) { fail(res, e); }
  });

  r.use((req, res) => res.status(404).json({ error: 'Nuk u gjet.' }));
  return r;
}
