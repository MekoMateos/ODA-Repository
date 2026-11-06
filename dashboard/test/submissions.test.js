import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { openDb } from '../src/db.js';
import { CommunityError, communityStore, makeCommunity } from '../src/community.js';
import { submissionStore, makeSubmissions, validateSubmission, submissionHtml, SPAM_REASON } from '../src/submissions.js';
import { makeService } from '../src/service.js';
import { publicApi } from '../src/public-api.js';

const SECRET = 'y'.repeat(40);
const words = (n, seed = 'fjalë') => Array.from({ length: n }, (_, i) => `${seed}${i}`).join(' ');
const piece = (over = {}) => ({
  title: 'Si u shpenzuan paratë e ujësjellësit në Fier',
  body: `${words(120, 'a')}\n\n${words(120, 'b')}`,
  sources: '1. https://www.app.gov.al/raporti-2025\nVendimi i KM nr. 12/2025',
  author_name: 'Arta Hoxha', email: 'Arta@Mail.al', section: 'ekonomi', consent: true, ...over,
});
const rejects = (fn, status) => assert.throws(fn, (e) => e instanceof CommunityError && (!status || e.status === status));
const rejectsAsync = (p, status) => assert.rejects(p, (e) => e instanceof CommunityError && (!status || e.status === status));

function setup({ ghostFails = false } = {}) {
  const db = openDb(':memory:');
  for (const u of [
    { email: 'ed@oda.test', name: 'Ed', role: 'editor' },
    { email: 'ver@oda.test', name: 'Vera', role: 'verifier' },
    { email: 'admin@oda.test', name: 'Admin', role: 'admin' },
  ]) db.upsertUser(u);
  const calls = [];
  let n = 0;
  const ghost = {
    createDraft: async (d) => { calls.push(['draft', d]); if (ghostFails) throw new Error('Ghost is down'); n += 1; return { id: String(n).padStart(24, 'f') }; },
    setWorkflowTags: async (...a) => calls.push(['tags', ...a]),
  };
  const store = submissionStore(db);
  const s = makeSubmissions({ db, store, ghost, secret: SECRET, guestAuthorEmail: 'mysafir@oda.test' });
  const U = Object.fromEntries(['ed', 'ver', 'admin'].map(k => [k, db.getUser(`${k}@oda.test`)]));
  return { db, store, s, ghost, calls, U, svc: makeService({ db, ghost }) };
}

test('a piece needs a title, 200 to 8,000 words, a name, an email and the declaration', () => {
  const ok = validateSubmission(piece());
  assert.equal(ok.email, 'arta@mail.al');
  assert.equal(ok.words, 240);
  assert.equal(ok.section, 'ekonomi');
  rejects(() => validateSubmission(piece({ website: 'http://spam.example' })));
  rejects(() => validateSubmission(piece({ title: 'Shkurt' })));
  assert.throws(() => validateSubmission(piece({ body: words(150) })), /150 fjalë/);
  rejects(() => validateSubmission(piece({ body: words(8001) })));
  rejects(() => validateSubmission(piece({ body: `${words(210)} ${'https://x.example/ '.repeat(26)}` })));
  rejects(() => validateSubmission(piece({ email: 'jo-email' })));
  rejects(() => validateSubmission(piece({ author_name: 'A' })));
  rejects(() => validateSubmission(piece({ consent: false })));
  rejects(() => validateSubmission(piece({ consent: undefined })));
  assert.equal(validateSubmission(piece({ section: 'kazino' })).section, null, 'unknown sections are left to the editors');
  assert.equal(validateSubmission(piece({ section: 'constructor' })).section, null);
  const messy = validateSubmission(piece({ body: `${words(100)}\r\n\r\n\r\n\r\n${words(100, 'c')}\u0007` }));
  assert.ok(!messy.body.includes('\r') && !messy.body.includes('\u0007') && !messy.body.includes('\n\n\n'));
});

test('pieces wait in the queue; duplicates and floods are refused', () => {
  const { s, store } = setup();
  const id = s.submit(piece(), '1.1.1.1');
  const row = store.get(id);
  assert.equal(row.status, 'pending');
  assert.ok(row.ip_hash && !row.ip_hash.includes('1.1.1.1'), 'the address is only kept as a salted hash');
  rejects(() => s.submit(piece({ email: 'tjeter@mail.al' }), '2.2.2.2'), 409);
  s.submit(piece({ body: words(220, 'd') }), '3.3.3.3');
  rejects(() => s.submit(piece({ body: words(220, 'e') }), '4.4.4.4'), 429); // third from the same email today
  for (let i = 0; i < 2; i++) s.submit(piece({ body: words(220, `f${i}`), email: `x${i}@mail.al` }), '5.5.5.5');
  s.submit(piece({ body: words(220, 'g'), email: 'y@mail.al' }), '5.5.5.5');
  rejects(() => s.submit(piece({ body: words(220, 'h'), email: 'z@mail.al' }), '5.5.5.5'), 429); // fourth from one address
});

test('accepting creates a Ghost draft in the review queue, with the guest as author', async () => {
  const { s, store, calls, U, db } = setup();
  const id = s.submit(piece({ body: `<script>alert(1)</script> Shih https://example.org/dok?a=1&b=2. ${words(230)}` }), '1.1.1.1');
  await rejectsAsync(s.accept(U.ver, id), 403);
  await rejectsAsync(s.accept(U.admin, id), 403);
  const ghostId = await s.accept(U.ed, id, { title: 'Ujësjellësi i Fierit: ku shkuan paratë', section: 'ekonomi' });

  const [, draft] = calls.find(c => c[0] === 'draft');
  assert.equal(draft.title, 'Ujësjellësi i Fierit: ku shkuan paratë');
  assert.equal(draft.authorEmail, 'mysafir@oda.test');
  assert.deepEqual(draft.tags.map(t => t.name), ['Ekonomi', '#i-ftuar', '#submitted']);
  assert.ok(draft.html.includes('&lt;script&gt;') && !draft.html.includes('<script>'), 'the text is escaped');
  assert.ok(draft.html.includes('<a href="https://example.org/dok?a=1&amp;b=2">https://example.org/dok?a=1&amp;b=2</a>.'), 'links work, punctuation stays outside');
  assert.ok(draft.html.includes('<p class="guest-byline">Shkrim i ftuar nga <strong>Arta Hoxha</strong></p>'));
  assert.ok(draft.html.includes('<h2>Burimet</h2>\n<ol><li><a href="https://www.app.gov.al/raporti-2025">'), 'sources become the evidence list, numbering removed');

  const a = db.getArticle(ghostId);
  assert.equal(a.status, 'submitted');
  assert.equal(a.author_email, 'arta@mail.al');
  assert.equal(a.guest, true);
  const row = store.get(id);
  assert.equal(row.status, 'accepted'); assert.equal(row.ghost_id, ghostId); assert.equal(row.ip_hash, null);
  assert.equal(db.recentAudit(5)[0].action, 'guest_accept');
  await rejectsAsync(s.accept(U.ed, id), 409);
});

test('if Ghost refuses the draft, nothing is recorded and the piece stays in the queue', async () => {
  const { s, store, db, U } = setup({ ghostFails: true });
  const id = s.submit(piece(), '1.1.1.1');
  await rejectsAsync(s.accept(U.ed, id), 502);
  assert.equal(store.get(id).status, 'pending');
  assert.equal(db.listArticles().length, 0);
});

test('a guest article in revision is resubmitted by an editor, never by a verifier', async () => {
  const { s, svc, U, db } = setup();
  const ghostId = await s.accept(U.ed, s.submit(piece(), '1.1.1.1'));
  await svc.perform('triage', U.ed, ghostId);
  await svc.perform('request_revision', U.ed, ghostId, { note: 'Mungon burimi për shifrën e dytë.' });
  await assert.rejects(svc.perform('submit', U.ver, ghostId));
  await svc.perform('submit', U.ed, ghostId);
  assert.equal(db.getArticle(ghostId).status, 'submitted');
});

test('rejecting needs a reason; spam is erased at once, the rest after the retention period', () => {
  const { s, store, db, U } = setup();
  const a = s.submit(piece(), '1.1.1.1');
  const b = s.submit(piece({ body: words(220, 'spam'), email: 'b@mail.al' }), '2.2.2.2');
  const c = s.submit(piece({ body: words(220, 'pritje'), email: 'c@mail.al' }), '3.3.3.3');
  rejects(() => s.reject(U.ed, a, { reason: '' }));
  rejects(() => s.reject(U.ver, a, { reason: 'Jashtë temave të ODA-s' }), 403);
  s.reject(U.ed, a, { reason: 'other', reason_other: 'E kemi botuar një temë shumë të ngjashme javën e kaluar.' });
  s.reject(U.ed, b, { reason: SPAM_REASON });
  assert.equal(store.get(a).reason, 'E kemi botuar një temë shumë të ngjashme javën e kaluar.');
  assert.ok(store.get(a).body && store.get(a).email, 'kept for now, so the editor can reply');
  assert.equal(store.get(b).body, null); assert.equal(store.get(b).email, null);

  db.raw.prepare("UPDATE submissions SET decided_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(a);
  assert.equal(s.purge(), 1);
  const old = store.get(a);
  assert.equal(old.body, null); assert.equal(old.email, null); assert.equal(old.note, null); assert.ok(old.purged_at);
  assert.equal(old.title, piece().title, 'the title and decision stay for the record');
  assert.ok(store.get(c).body, 'pending pieces are never purged');
});

test('submissionHtml keeps line breaks and never passes raw HTML', () => {
  const html = submissionHtml({ author_name: '<b>X</b>', body: 'Rreshti 1\nRreshti 2\n\nParagrafi "dy" & më shumë', sources: '- javascript:alert(1)' });
  assert.ok(html.includes('<p>Rreshti 1<br>Rreshti 2</p>'));
  assert.ok(html.includes('<p>Paragrafi &quot;dy&quot; &amp; më shumë</p>'));
  assert.ok(html.includes('nga <strong>&lt;b&gt;X&lt;/b&gt;</strong>'));
  assert.ok(html.includes('<li>javascript:alert(1)</li>') && !html.includes('href="javascript'), 'only http(s) links become anchors');
});

// ---------- HTTP ----------
async function server() {
  const t = setup();
  const cs = communityStore(t.db);
  const app = express();
  app.set('trust proxy', true);
  app.use('/api', publicApi({ store: cs, community: makeCommunity({ db: t.db, store: cs, secret: SECRET }), submissions: t.s, verifyMember: async () => { throw new Error('x'); } }));
  const srv = await new Promise(res => { const x = app.listen(0, () => res(x)); });
  return { ...t, srv, base: `http://127.0.0.1:${srv.address().port}/api` };
}
const post = (url, body, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body })
  .then(async r => ({ status: r.status, body: await r.json(), cache: r.headers.get('cache-control') }));

test('HTTP: a piece reaches the queue, and nothing about it is readable from outside', async (t) => {
  const s = await server(); t.after(() => s.srv.close());
  let r = await post(`${s.base}/shkrime`, JSON.stringify(piece()), { 'X-Forwarded-For': '6.6.6.6' });
  assert.equal(r.status, 202); assert.equal(r.cache, 'no-store'); assert.match(r.body.message, /mbërriti/);
  assert.equal(s.store.list('pending').length, 1);

  r = await post(`${s.base}/shkrime`, JSON.stringify(piece({ body: words(50) })));
  assert.equal(r.status, 400); assert.match(r.body.error, /50 fjalë/);
  r = await post(`${s.base}/shkrime`, '{"title":');
  assert.equal(r.status, 400); assert.equal(r.body.error, 'Kërkesë e pavlefshme.');
  r = await post(`${s.base}/shkrime`, JSON.stringify(piece({ body: 'ë'.repeat(300000) })));
  assert.equal(r.status, 413); assert.ok(r.body.error);
  r = await post(`${s.base}/burime`, JSON.stringify({ title: 'x'.repeat(20000) }));
  assert.equal(r.status, 413, 'other routes keep the small limit');
  r = await fetch(`${s.base}/shkrime`, { method: 'POST', body: 'tekst' });
  assert.equal(r.status, 400, 'a body that is not JSON or a form is refused cleanly');

  for (const path of ['/shkrime', '/shkrime/1', '/shkrime.json']) {
    const g = await fetch(`${s.base}${path}`);
    assert.equal(g.status, 404, `${path} must not exist`);
  }
});
