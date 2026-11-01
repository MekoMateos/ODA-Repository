import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { openDb } from '../src/db.js';
import {
  communityStore, makeCommunity, CommunityError, normalizeUrl, validatePoll, tiraneToIso, slugify,
} from '../src/community.js';
import { memberVerifier } from '../src/members.js';
import { publicApi } from '../src/public-api.js';

const SECRET = 'x'.repeat(40);
const SITE = 'https://oda.test';

function setup() {
  const db = openDb(':memory:');
  for (const u of [
    { email: 'ed@oda.test', name: 'Ed', role: 'editor' },
    { email: 'ed2@oda.test', name: 'Ed Two', role: 'editor' },
    { email: 'ver@oda.test', name: 'Vera', role: 'verifier' },
    { email: 'admin@oda.test', name: 'Admin', role: 'admin' },
  ]) db.upsertUser(u);
  const store = communityStore(db);
  const c = makeCommunity({ db, store, secret: SECRET });
  const U = { ed: db.getUser('ed@oda.test'), ed2: db.getUser('ed2@oda.test'), ver: db.getUser('ver@oda.test'), admin: db.getUser('admin@oda.test') };
  return { db, store, c, U };
}
const good = { title: 'MIT OpenCourseWare', url: 'https://www.ocw.mit.edu/?utm_source=x#top', category: 'kurse', language: 'en', description: 'Leksione falas.' };
const rejects = (fn, status) => assert.throws(fn, (e) => e instanceof CommunityError && (!status || e.status === status));

test('links are normalised and unsafe ones refused', () => {
  assert.equal(normalizeUrl('https://WWW.Example.org/path/?utm_source=fb&id=2#x'), 'https://example.org/path?id=2');
  assert.equal(normalizeUrl('https://example.org/'), 'https://example.org/');
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.org', 'https://user:pw@example.org', 'http://localhost:3000', 'not a url', ''])
    assert.equal(normalizeUrl(bad), null, bad);
});

test('a reader suggestion waits for an editor, and duplicates or bots are refused', () => {
  const { c, store, U } = setup();
  const id = c.suggest({ ...good, submitter_name: 'Arta' }, '1.2.3.4');
  assert.equal(store.getResource(id).status, 'pending');
  assert.equal(store.listResources('approved').length, 0, 'nothing public before approval');
  rejects(() => c.suggest({ ...good, url: 'https://ocw.mit.edu' }, '5.6.7.8'), 409);
  rejects(() => c.suggest({ ...good, url: 'https://other.org', website: 'http://spam' }, '5.6.7.8'), 400);
  rejects(() => c.suggest({ ...good, url: 'https://other.org', category: 'kazino' }, '5.6.7.8'));
  rejects(() => c.decide(U.ver, id, { decision: 'approve' }), 403);
  rejects(() => c.decide(U.admin, id, { decision: 'approve' }), 403);
  c.decide(U.ed, id, { decision: 'approve', title: 'MIT OpenCourseWare (OCW)', category: 'kurse', description: 'Mbi 2.500 kurse.', featured: '1' });
  const r = store.getResource(id);
  assert.equal(r.status, 'approved'); assert.equal(r.title, 'MIT OpenCourseWare (OCW)'); assert.equal(r.featured, 1);
  assert.equal(r.ip_hash, null, 'IP trace is erased once decided');
  assert.equal(r.submitter_name, 'Arta');
});

test('one address cannot flood the queue', () => {
  const { c } = setup();
  for (let i = 0; i < 5; i++) c.suggest({ ...good, url: `https://site${i}.org` }, '9.9.9.9');
  rejects(() => c.suggest({ ...good, url: 'https://site6.org' }, '9.9.9.9'), 429);
  c.suggest({ ...good, url: 'https://site7.org' }, '8.8.8.8');
});

test('editors can add resources directly and remove them later', () => {
  const { c, store, U, db } = setup();
  const id = c.addDirect(U.ed, { title: 'OpenStax', url: 'https://openstax.org', category: 'libra', language: 'en' });
  assert.equal(store.getResource(id).status, 'approved');
  rejects(() => c.addDirect(U.ed, { title: 'OpenStax', url: 'https://www.openstax.org/', category: 'libra' }), 409);
  c.decide(U.ed, id, { decision: 'reject', reason: 'U hoq nga redaksia' });
  assert.equal(store.listResources('approved').length, 0);
  assert.ok(db.recentAudit().some(a => a.action === 'resource_rejected'));
});

test('poll wording is checked and closing times are Tirana time', () => {
  rejects(() => validatePoll({ question: 'Po apo jo?', options: 'Po' }));
  rejects(() => validatePoll({ question: 'A duhet të ndryshojë ligji?', options: 'Po\npo' }));
  rejects(() => validatePoll({ question: 'A duhet të ndryshojë ligji?', options: 'A\nB\nC\nD\nE\nF\nG' }));
  rejects(() => validatePoll({ question: 'A duhet të ndryshojë ligji?', options: 'Po\nJo', closes_at: '2001-01-01T10:00' }));
  assert.equal(tiraneToIso('2030-11-15T18:00'), '2030-11-15T17:00:00.000Z'); // winter, UTC+1
  assert.equal(tiraneToIso('2030-07-01T12:00'), '2030-07-01T10:00:00.000Z'); // summer, UTC+2
  assert.equal(slugify('Çfarë mendoni për Bulevardin e Ri?'), 'cfare-mendoni-per-bulevardin-e-ri');
});

test('a poll needs a second editor to open, takes one vote per reader, and hides results until you vote', () => {
  const { c, store, U, db } = setup();
  const id = c.createPoll(U.ed, { question: 'A duhet të transmetohen live mbledhjet e këshillit?', options: 'Po\nJo\nNuk e di' });
  const p0 = store.getPoll(id);
  rejects(() => c.vote(p0.slug, 'lexues@mail.al', p0.options[0].id), 404);
  rejects(() => c.openPoll(U.ed, id), 403);
  c.openPoll(U.ed2, id);
  const p = store.getPoll(id);

  const before = c.publicPoll(p, null);
  assert.equal(before.results, null, 'no live tallies for people who have not voted');
  const out = c.vote(p.slug, 'Lexues@Mail.al', p.options[0].id);
  assert.equal(out.results.total, 1);
  rejects(() => c.vote(p.slug, 'lexues@mail.al', p.options[1].id), 409);
  rejects(() => c.vote(p.slug, 'tjeter@mail.al', 999999));
  c.vote(p.slug, 'tjeter@mail.al', p.options[1].id);
  assert.deepEqual(c.publicPoll(p, 'lexues@mail.al').results.options.map(o => o.votes), [1, 1, 0]);
  assert.equal(c.publicPoll(p, 'lexues@mail.al').voted, p.options[0].id);

  // Emails are never stored, and votes cannot be edited or deleted.
  const rows = db.raw.prepare('SELECT * FROM poll_votes').all();
  assert.ok(rows.every(r => !JSON.stringify(r).includes('@')));
  assert.throws(() => db.raw.exec('UPDATE poll_votes SET option_id = 1'), /cannot be changed/);
  assert.throws(() => db.raw.exec('DELETE FROM poll_votes'), /cannot be deleted/);

  c.closePoll(U.ed, id);
  rejects(() => c.vote(p.slug, 'vone@mail.al', p.options[0].id), 409);
  assert.equal(c.publicPoll(store.getPoll(id), null).results.total, 2, 'closed polls show results to everyone');
  rejects(() => c.deletePoll(U.ed, id));
});

test('a poll with a single editor on the team can be opened by its author; drafts can be deleted', () => {
  const { c, store, U, db } = setup();
  db.upsertUser({ email: 'ed2@oda.test', name: 'Ed Two', role: 'editor', active: 0 });
  const id = c.createPoll(U.ed, { question: 'Cili problem ju shqetëson më shumë?', options: 'Trafiku\nÇmimet' });
  const draft = c.createPoll(U.ed, { question: 'Cili problem ju shqetëson më shumë?', options: 'A\nB' });
  assert.notEqual(store.getPoll(id).slug, store.getPoll(draft).slug);
  c.openPoll(U.ed, id);
  c.deletePoll(U.ed, draft);
  assert.equal(store.getPoll(draft), null);
});

test('polls past their closing time close themselves', () => {
  const { c, store, U, db } = setup();
  const id = c.createPoll(U.ed, { question: 'A ju duket i drejtë tarifimi i ri?', options: 'Po\nJo' });
  c.openPoll(U.ed2, id);
  db.raw.prepare("UPDATE polls SET closes_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(id);
  const p = store.getPoll(id);
  rejects(() => c.vote(p.slug, 'a@b.al', p.options[0].id), 409);
  assert.equal(store.getPoll(id).status, 'closed');
});

// ---------- HTTP: the public API with real signed member tokens ----------
async function server() {
  const t = setup();
  const { publicKey, privateKey } = await generateKeyPair('RS512');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS512', use: 'sig' };
  const verifyMember = memberVerifier({ siteUrl: SITE, keySet: createLocalJWKSet({ keys: [jwk] }) });
  const app = express();
  app.set('trust proxy', true);
  app.use('/api', publicApi({ store: t.store, community: t.c, verifyMember }));
  const srv = await new Promise(res => { const s = app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const token = (claims = {}, opts = {}) => {
    let j = new SignJWT({ sub: 'lexues@mail.al', scope: 'members:identity', ...claims })
      .setProtectedHeader({ alg: opts.alg || 'RS512', kid: 'k1' }).setIssuedAt().setIssuer(opts.iss || `${SITE}/members/api`)
      .setAudience(opts.iss || `${SITE}/members/api`).setExpirationTime(opts.exp || '10m');
    return j.sign(opts.key || privateKey);
  };
  return { ...t, base, srv, token };
}
const json = (url, opts = {}) => fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } })
  .then(async r => ({ status: r.status, body: await r.json(), cache: r.headers.get('cache-control') }));

test('HTTP: suggestions go to the queue and only approved resources are listed', async (t) => {
  const s = await server(); t.after(() => s.srv.close());
  let r = await json(`${s.base}/burime`, { method: 'POST', body: JSON.stringify({ ...good, url: 'https://doaj.org', title: 'DOAJ' }), headers: { 'X-Forwarded-For': '7.7.7.7' } });
  assert.equal(r.status, 202);
  r = await json(`${s.base}/burime`, { method: 'POST', body: JSON.stringify({ ...good, url: 'javascript:alert(1)' }) });
  assert.equal(r.status, 400);
  r = await json(`${s.base}/burime.json`);
  assert.equal(r.body.resources.length, 0);
  assert.match(r.cache, /public/);
  const [pending] = s.store.listResources('pending');
  s.c.decide(s.U.ed, pending.id, { decision: 'approve' });
  r = await json(`${s.base}/burime.json`);
  assert.deepEqual(r.body.resources.map(x => x.url), ['https://doaj.org/']);
  assert.ok(!('ip_hash' in r.body.resources[0]) && !('decided_by' in r.body.resources[0]), 'no internal fields leak');
});

test('HTTP: voting needs a valid Ghost identity token', async (t) => {
  const s = await server(); t.after(() => s.srv.close());
  const id = s.c.createPoll(s.U.ed, { question: 'A duhet më shumë korsi biçikletash?', options: 'Po\nJo' });
  s.c.openPoll(s.U.ed2, id);
  const p = s.store.getPoll(id);
  const vote = (tok, option = p.options[0].id) => json(`${s.base}/sondazhe/${p.slug}/vote`, { method: 'POST', body: JSON.stringify({ option }), headers: tok ? { Authorization: `Bearer ${tok}` } : {} });

  assert.equal((await vote(null)).status, 401);
  assert.equal((await vote('abc.def.ghi')).status, 401);
  assert.equal((await vote(await s.token({ scope: 'members:entitlements:read' }))).status, 401, 'entitlement tokens cannot vote');
  assert.equal((await vote(await s.token({}, { iss: 'https://evil.test/members/api' }))).status, 401);
  assert.equal((await vote(await s.token({}, { exp: '-1m' }))).status, 401);
  const other = await generateKeyPair('RS512');
  assert.equal((await vote(await s.token({}, { key: other.privateKey }))).status, 401, 'signature must be Ghost\'s');

  const list = await json(`${s.base}/sondazhe.json`);
  assert.equal(list.body.polls[0].results, null);
  assert.equal(list.body.polls[0].total, 0);

  const ok = await vote(await s.token());
  assert.equal(ok.status, 200); assert.equal(ok.body.results.total, 1); assert.equal(ok.cache, 'no-store');
  assert.equal((await vote(await s.token())).status, 409, 'second vote refused');

  const mine = await json(`${s.base}/sondazhe/une`, { headers: { Authorization: `Bearer ${await s.token()}` } });
  assert.equal(mine.body.polls[0].voted, p.options[0].id);
  assert.equal(mine.body.polls[0].results.total, 1);
  assert.equal((await json(`${s.base}/sondazhe/une`)).status, 401);
  assert.equal((await json(`${s.base}/sondazhe/nuk-ekziston`)).status, 404);
});
