// ODA Redaksia: editorial dashboard. Mounted at /redaksia on the admin domain, behind Cloudflare Access.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { ghostClient } from './ghost.js';
import { authMiddleware, csrf as makeCsrf } from './auth.js';
import { makeService, ActionError, canSee } from './service.js';
import * as V from './views.js';
import { STATUSES } from './workflow.js';

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const required = ['GHOST_ADMIN_URL', 'GHOST_ADMIN_API_KEY', 'SESSION_SECRET'];
for (const k of required) if (!env[k]) { console.error(`Missing ${k}`); process.exit(1); }
if (env.SESSION_SECRET.length < 32) { console.error('SESSION_SECRET must be at least 32 characters'); process.exit(1); }

const db = openDb(env.DB_FILE || path.resolve('data/redaksia.db'));
const ghost = ghostClient({ url: env.GHOST_ADMIN_URL, key: env.GHOST_ADMIN_API_KEY, publicUrl: env.GHOST_PUBLIC_ADMIN_URL });
const svc = makeService({ db, ghost });
const csrf = makeCsrf(env.SESSION_SECRET);

// First run: the bootstrap admin can log in and add everyone else.
if (env.BOOTSTRAP_ADMIN_EMAIL && !db.getUser(env.BOOTSTRAP_ADMIN_EMAIL)) {
  db.upsertUser({ email: env.BOOTSTRAP_ADMIN_EMAIL, name: env.BOOTSTRAP_ADMIN_NAME || 'Administrator', role: 'admin' });
  db.log({ actor: 'system', action: 'user_add', detail: { email: env.BOOTSTRAP_ADMIN_EMAIL, role: 'admin', bootstrap: true } });
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback, uniquelocal');

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  next();
});

const here = path.dirname(fileURLToPath(import.meta.url));
app.get('/healthz', (req, res) => res.json({ ok: true }));

const r = express.Router();
r.use('/static', express.static(path.join(here, '../public'), { maxAge: '1h' }));
r.use(express.urlencoded({ extended: false, limit: '64kb' }));
r.use(rateLimit({ windowMs: 60e3, max: 120 }));
r.use(authMiddleware({ db, teamDomain: env.CF_ACCESS_TEAM_DOMAIN, audience: env.CF_ACCESS_AUD, devEmail: env.DEV_USER_EMAIL, isProd }));
r.use(csrf.verify);

function render(req, res, { title, active, body, status = 200 }) {
  const flash = req.query.ok ? { type: 'ok', msg: String(req.query.ok).slice(0, 200) } : req.query.err ? { type: 'error', msg: String(req.query.err).slice(0, 300) } : null;
  const token = csrf.tokenFor(req.user.email);
  const out = String(V.layout({ user: req.user, title, active, body, flash, csrf: token })).replaceAll('{{csrf}}', token);
  res.status(status).type('html').send(out);
}
const back = (res, url, kind, msg) => res.redirect(303, `${url}${url.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(msg)}`);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

r.get('/', (req, res) => {
  if (req.user.role === 'contributor') return res.redirect(303, '/redaksia/te-miat');
  const status = String(req.query.status || '');
  const filter = { status: status in STATUSES ? status : '', mine: req.query.mine === '1' };
  const articles = db.listArticles({ status: filter.status || undefined, assignee: filter.mine ? req.user.email : undefined })
    .filter(a => filter.status || a.status !== 'draft');
  render(req, res, { title: 'Radha', active: 'queue', body: V.queuePage({ user: req.user, articles, counts: db.countByStatus(), filter }) });
});

r.get('/te-miat', wrap(async (req, res) => {
  let drafts = [];
  try { drafts = await ghost.draftsByEmail(req.user.email); } catch (e) { console.error('ghost drafts', e.message); }
  render(req, res, { title: 'Artikujt e mi', active: 'mine', body: V.minePage({ user: req.user, drafts, articles: db.listArticles({ author: req.user.email }) }) });
}));

r.get('/artikull/:id', wrap(async (req, res) => {
  const a = db.getArticle(req.params.id);
  if (!a || !canSee(req.user, a)) return render(req, res, { title: 'Nuk u gjet', body: V.html`<h1>Artikulli nuk u gjet</h1><p><a href="/redaksia/">Kthehu te radha</a></p>`, status: 404 });
  let post = null;
  try { post = await ghost.getPost(a.ghost_id); if (post.title !== a.title) db.updateArticle(a.ghost_id, { title: post.title }); } catch (e) { console.error('ghost read', e.message); }
  render(req, res, {
    title: a.title, active: 'queue',
    body: V.articlePage({
      user: req.user, a: db.getArticle(a.ghost_id), post, notes: db.notes(a.ghost_id), history: db.history(a.ghost_id),
      verifiers: db.usersByRole('verifier'), links: { editor: ghost.editorLink(a.ghost_id), preview: ghost.previewLink(post) },
    }),
  });
}));

const idOk = (id) => /^[a-f0-9]{24}$/.test(id);

r.post('/artikull/:id/veprim', wrap(async (req, res) => {
  const id = req.params.id, url = `/redaksia/artikull/${id}`;
  if (!idOk(id)) return back(res, '/redaksia/', 'err', 'Artikull i pavlefshëm.');
  try {
    await svc.perform(String(req.body.action), req.user, id, req.body);
    back(res, url, 'ok', 'U ruajt.');
  } catch (e) {
    if (!(e instanceof ActionError)) throw e;
    back(res, db.getArticle(id) ? url : '/redaksia/te-miat', 'err', e.message);
  }
}));

r.post('/artikull/:id/caktim', (req, res) => {
  const url = `/redaksia/artikull/${req.params.id}`;
  try { svc.assign(req.user, req.params.id, req.body); back(res, url, 'ok', 'Caktimi u ruajt.'); }
  catch (e) { if (!(e instanceof ActionError)) throw e; back(res, url, 'err', e.message); }
});

r.post('/artikull/:id/kontroll', (req, res) => {
  const url = `/redaksia/artikull/${req.params.id}`;
  try { svc.tick(req.user, req.params.id, String(req.body.key), req.body.on === '1'); res.redirect(303, url); }
  catch (e) { if (!(e instanceof ActionError)) throw e; back(res, url, 'err', e.message); }
});

r.post('/artikull/:id/shenim', (req, res) => {
  const url = `/redaksia/artikull/${req.params.id}`;
  try { svc.note(req.user, req.params.id, req.body.body); back(res, url, 'ok', 'Shënimi u shtua.'); }
  catch (e) { if (!(e instanceof ActionError)) throw e; back(res, url, 'err', e.message); }
});

r.get('/ekipi', (req, res) => {
  if (req.user.role !== 'admin') return res.redirect(303, '/redaksia/');
  render(req, res, { title: 'Ekipi', active: 'team', body: V.teamPage({ users: db.listUsers() }) });
});
r.post('/ekipi', (req, res) => {
  try { svc.setUser(req.user, req.body); back(res, '/redaksia/ekipi', 'ok', 'Anëtari u ruajt.'); }
  catch (e) { if (!(e instanceof ActionError)) throw e; back(res, '/redaksia/ekipi', 'err', e.message); }
});

r.get('/regjistri', (req, res) => {
  if (!['editor', 'admin'].includes(req.user.role)) return res.redirect(303, '/redaksia/');
  render(req, res, { title: 'Regjistri', active: 'audit', body: V.auditPage({ rows: db.recentAudit(300) }) });
});

app.use('/redaksia', r);
app.get('/', (req, res) => res.redirect('/redaksia/'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).type('html').send('<!doctype html><meta charset="utf-8"><p style="font-family:system-ui;padding:2rem">Diçka nuk shkoi. Ndryshimi nuk u ruajt. Provo sërish ose njofto ekipin teknik.</p>');
});

// Simple in-memory rate limit per user/IP. Cloudflare rate limits sit in front as the first line.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const key = req.get('Cf-Connecting-Ip') || req.ip;
    const n = (hits.get(key) || 0) + 1;
    hits.set(key, n);
    if (n > max) return res.status(429).send('Shumë kërkesa. Prit një minutë.');
    next();
  };
}

const port = Number(env.PORT || 3000);
app.listen(port, () => console.log(`ODA Redaksia on :${port} (${isProd ? 'production' : 'development'})`));
