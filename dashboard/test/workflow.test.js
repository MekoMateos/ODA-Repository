import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { makeService, ActionError } from '../src/service.js';
import { check, nextTags, CHECKLIST } from '../src/workflow.js';

const ID = 'a'.repeat(24);

function setup() {
  const db = openDb(':memory:');
  const calls = [];
  const ghost = {
    getPost: async (id) => ({ id, title: 'Test', status: 'draft', authors: [{ email: 'writer@oda.test', name: 'Writer' }] }),
    setWorkflowTags: async (...a) => calls.push(['tags', ...a]),
    publish: async (...a) => calls.push(['publish', ...a]),
    schedule: async (...a) => calls.push(['schedule', ...a]),
    unschedule: async (...a) => calls.push(['unschedule', ...a]),
  };
  const users = {
    writer: { email: 'writer@oda.test', name: 'Writer', role: 'contributor' },
    ed: { email: 'ed@oda.test', name: 'Ed', role: 'editor' },
    ed2: { email: 'ed2@oda.test', name: 'Ed Two', role: 'editor' },
    ver: { email: 'ver@oda.test', name: 'Vera', role: 'verifier' },
    law: { email: 'law@oda.test', name: 'Lawrence', role: 'legal' },
    admin: { email: 'admin@oda.test', name: 'Admin', role: 'admin' },
  };
  for (const u of Object.values(users)) db.upsertUser(u);
  const U = Object.fromEntries(Object.entries(users).map(([k, u]) => [k, db.getUser(u.email)]));
  return { db, ghost, calls, svc: makeService({ db, ghost }), U };
}

async function toApproval(t, { legal = true } = {}) {
  const { svc, U, db } = t;
  await svc.perform('submit', U.writer, ID);
  await svc.perform('triage', U.ed, ID);
  svc.assign(U.ed, ID, { verifier_email: U.ver.email, legal_required: legal ? '1' : '' });
  await svc.perform('send_to_verification', U.ed, ID);
  await svc.perform('pass_verification', U.ver, ID, { rating: 'verified' });
  if (legal) await svc.perform('pass_legal', U.law, ID);
  for (const c of CHECKLIST) if (!c.auto && c.required !== false) db.sign(ID, `checklist:${c.key}`, U.ver.email);
}

test('full happy path ends published in Ghost with the rating tag', async () => {
  const t = setup();
  await toApproval(t);
  assert.equal(t.db.getArticle(ID).status, 'legal_review');
  await t.svc.perform('approve', t.U.ed, ID);
  await t.svc.perform('publish', t.U.ed, ID);
  const a = t.db.getArticle(ID);
  assert.equal(a.status, 'published');
  assert.equal(a.rating, 'verified');
  assert.deepEqual(t.calls.at(-1), ['publish', ID, 'verified']);
});

test('without legal review, verification alone unlocks approval', async () => {
  const t = setup();
  await toApproval(t, { legal: false });
  assert.equal(t.db.getArticle(ID).status, 'in_verification');
  await t.svc.perform('approve', t.U.ed, ID);
  assert.equal(t.db.getArticle(ID).status, 'approved');
});

test('contributors cannot publish or approve, even their own work', async () => {
  const t = setup();
  await toApproval(t);
  await assert.rejects(t.svc.perform('approve', t.U.writer, ID), ActionError);
  await assert.rejects(t.svc.perform('publish', t.U.writer, ID), ActionError);
});

test('an editor who wrote the article cannot approve it', async () => {
  const t = setup();
  t.ghost.getPost = async (id) => ({ id, title: 'T', status: 'draft', authors: [{ email: 'ed@oda.test', name: 'Ed' }] });
  await t.svc.perform('submit', t.U.ed, ID);
  await t.svc.perform('triage', t.U.ed2, ID);
  t.svc.assign(t.U.ed2, ID, { verifier_email: t.U.ver.email, legal_required: '' });
  await t.svc.perform('send_to_verification', t.U.ed2, ID);
  await t.svc.perform('pass_verification', t.U.ver, ID, { rating: 'partly' });
  for (const c of CHECKLIST) if (!c.auto && c.required !== false) t.db.sign(ID, `checklist:${c.key}`, t.U.ver.email);
  await assert.rejects(t.svc.perform('approve', t.U.ed, ID), /artikullin tënd/);
  await t.svc.perform('approve', t.U.ed2, ID);
  assert.equal(t.db.getArticle(ID).status, 'approved');
});

test('approval is blocked until the checklist is complete', async () => {
  const t = setup();
  await toApproval(t);
  t.db.unsign(ID, 'checklist:media_cleared');
  await assert.rejects(t.svc.perform('approve', t.U.ed, ID), /Lista e kontrollit/);
});

test('legal sign-off is required when legal review is on', async () => {
  const t = setup();
  const { svc, U } = t;
  await svc.perform('submit', U.writer, ID);
  await svc.perform('triage', U.ed, ID);
  svc.assign(U.ed, ID, { verifier_email: U.ver.email, legal_required: '1' });
  await svc.perform('send_to_verification', U.ed, ID);
  await svc.perform('pass_verification', U.ver, ID, { rating: 'verified' });
  await assert.rejects(svc.perform('approve', U.ed, ID), /ligjor/);
});

test('revision wipes previous sign-offs so changed text is re-verified', async () => {
  const t = setup();
  await toApproval(t);
  await t.svc.perform('request_revision', t.U.ed, ID, { note: 'Mungon burimi për shifrën e dytë.' });
  const a = t.db.getArticle(ID);
  assert.equal(a.status, 'revision');
  assert.equal(a.signoffs.verification, undefined);
  assert.equal(a.rating, null);
  assert.equal(t.db.notes(ID).length, 1);
});

test('reject needs a reason; technical admin has no editorial power', async () => {
  const t = setup();
  await t.svc.perform('submit', t.U.writer, ID);
  await assert.rejects(t.svc.perform('reject', t.U.ed, ID, {}), /arsyen/);
  await assert.rejects(t.svc.perform('triage', t.U.admin, ID), ActionError);
});

test('verifier must be an active verifier and not the author', async () => {
  const t = setup();
  await t.svc.perform('submit', t.U.writer, ID);
  assert.throws(() => t.svc.assign(t.U.ed, ID, { verifier_email: t.U.law.email }), /verifikues/);
});

test('if Ghost refuses the change, nothing is recorded', async () => {
  const t = setup();
  await t.svc.perform('submit', t.U.writer, ID);
  t.ghost.setWorkflowTags = async () => { throw new Error('Saving failed! Someone else is editing this post.'); };
  await assert.rejects(t.svc.perform('triage', t.U.ed, ID), /Ghost nuk e pranoi/);
  assert.equal(t.db.getArticle(ID).status, 'submitted');
});

test('audit log cannot be edited or deleted', async () => {
  const t = setup();
  await t.svc.perform('submit', t.U.writer, ID);
  assert.throws(() => t.db.raw.exec("UPDATE audit SET actor_email = 'x'"), /append-only/);
  assert.throws(() => t.db.raw.exec('DELETE FROM audit'), /append-only/);
  assert.ok(t.db.history(ID).length >= 2);
});

test('the last admin cannot be demoted', () => {
  const t = setup();
  assert.throws(() => t.svc.setUser(t.U.admin, { email: 'admin@oda.test', name: 'Admin', role: 'editor', active: '1' }), /administrator/);
});

test('scheduling needs a future date', async () => {
  const t = setup();
  await toApproval(t);
  await t.svc.perform('approve', t.U.ed, ID);
  assert.equal(check('schedule', t.U.ed, t.db.getArticle(ID), { publish_at: '2020-01-01T10:00' }).ok, false);
  const later = new Date(Date.now() + 86400e3).toISOString();
  await t.svc.perform('schedule', t.U.ed, ID, { publish_at: later });
  assert.equal(t.db.getArticle(ID).status, 'scheduled');
});

test('nextTags swaps workflow tags and keeps topic tags', () => {
  const tags = nextTags([{ name: 'Ekonomi', slug: 'ekonomi' }, { name: '#submitted' }, { name: '#verifikuar' }], 'in_review', 'partly');
  assert.deepEqual(tags.map(t => t.name).sort(), ['#in-review', '#pjeserisht', 'Ekonomi'].sort());
  const pub = nextTags([{ name: 'Ekonomi', slug: 'ekonomi' }, { name: '#approved' }], 'published', 'verified');
  assert.deepEqual(pub.map(t => t.name).sort(), ['#verifikuar', 'Ekonomi']);
});
