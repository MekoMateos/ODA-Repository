// One-time pieces from readers without an account ("Shkruaj një herë" on the home page).
// Nothing is published from here. An editor reads each piece; an accepted one becomes a Ghost draft
// and goes through the normal review (verification, legal review when needed, approval) like any article.
import crypto from 'node:crypto';
import { CommunityError, ipHash } from './community.js';
import { STATUSES } from './workflow.js';

export const SUBMISSION_SECTIONS = {
  politike: 'Politikë',
  ekonomi: 'Ekonomi',
  drejtesi: 'Drejtësi',
  shoqeri: 'Shoqëri',
  kerkim: 'Kërkim',
  arti: 'Arti',
  opinion: 'Opinion',
};
export const SPAM_REASON = 'Spam ose reklamë'; // erases the text and the email at once
export const SUBMISSION_REJECT_REASONS = [
  'Nuk përputhet me politikën editoriale',
  'Mungojnë burimet për faktet kryesore',
  'Tema është mbuluar së fundmi',
  'Teksti nuk është origjinal',
  'Jashtë temave të ODA-s',
  SPAM_REASON,
];
// Internal Ghost tag on every guest piece: the theme shows "Shkrim i ftuar" and the guest's name.
export const GUEST_TAG = { name: '#i-ftuar', slug: 'hash-i-ftuar' };
export const LIMITS = { minWords: 200, maxWords: 8000, maxChars: 60000, maxLinks: 25, retentionDays: 90 };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const line = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max + 1);
const text = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
  .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max + 1);
export const countWords = (s) => (String(s ?? '').match(/\S+/g) || []).length;
const bodyHash = (body) => crypto.createHash('sha256').update(String(body).toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex');
const isYes = (v) => v === true || ['1', 'true', 'on', 'po'].includes(String(v ?? '').toLowerCase());

// Checks a piece sent from the public form. Returns the cleaned record or throws CommunityError (message shown to the writer).
export function validateSubmission(input = {}) {
  if (String(input.website || '').trim()) throw new CommunityError('Kërkesa u refuzua.'); // honeypot field, invisible to people
  const title = line(input.title, 160);
  const body = text(input.body, LIMITS.maxChars);
  const sources = text(input.sources, 5000);
  const note = text(input.note, 1000);
  const author_name = line(input.author_name, 80);
  const email = String(input.email ?? '').trim().toLowerCase();
  const section = Object.hasOwn(SUBMISSION_SECTIONS, String(input.section)) ? String(input.section) : null;
  const words = countWords(body);

  if (title.length < 8 || title.length > 160) throw new CommunityError('Titulli duhet të ketë 8 deri në 160 shkronja.');
  if (words < LIMITS.minWords) throw new CommunityError(`Shkrimi ka ${words} fjalë. Duhen të paktën ${LIMITS.minWords}.`);
  if (words > LIMITS.maxWords || body.length > LIMITS.maxChars) throw new CommunityError('Shkrimi është shumë i gjatë: deri në 8.000 fjalë.');
  if ((body.match(/https?:\/\//gi) || []).length > LIMITS.maxLinks) throw new CommunityError('Shkrimi ka shumë lidhje. Vendosi te "Burimet", një për rresht.');
  if (sources.length > 5000) throw new CommunityError('Burimet duhet të jenë deri në 5.000 shkronja.');
  if (note.length > 1000) throw new CommunityError('Shënimi për redaksinë duhet të jetë deri në 1.000 shkronja.');
  if (author_name.length < 2 || author_name.length > 80) throw new CommunityError('Shkruaj emrin dhe mbiemrin (2 deri në 80 shkronja).');
  if (email.length > 254 || !EMAIL.test(email)) throw new CommunityError('Shkruaj një adresë email të vlefshme, që redaksia të të përgjigjet.');
  if (!isYes(input.consent)) throw new CommunityError('Konfirmo që shkrimi është yti dhe që pranon shqyrtimin e redaksisë.');
  return { title, body, sources: sources || null, note: note || null, author_name, email, section, words };
}

// ---------- The Ghost draft made from an accepted piece ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);
// Runs on already-escaped text: only http(s) links become anchors, trailing punctuation stays outside.
const linkify = (escaped) => escaped.replace(/https?:\/\/[^\s<>"']+/g, (u) => {
  const url = u.replace(/[.,;:!?)\]]+$/, '');
  return `<a href="${url}">${url}</a>${u.slice(url.length)}`;
});

export function submissionHtml(s) {
  const paras = String(s.body || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p>${linkify(esc(p)).replace(/\n/g, '<br>')}</p>`);
  const sources = String(s.sources || '').split('\n').map(x => x.trim().replace(/^(\d+[.)]|[-*•])\s+/, '')).filter(Boolean)
    .map(x => `<li>${linkify(esc(x))}</li>`);
  return [
    // Kept as an HTML card so the class survives; the theme moves the name into the byline.
    '<!--kg-card-begin: html-->',
    `<p class="guest-byline">Shkrim i ftuar nga <strong>${esc(s.author_name)}</strong></p>`,
    '<!--kg-card-end: html-->',
    ...paras,
    ...(sources.length ? ['<h2>Burimet</h2>', `<ol>${sources.join('')}</ol>`] : []),
  ].join('\n');
}

// ---------- Storage ----------
export function submissionStore(db) {
  const raw = db.raw;
  raw.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author_name TEXT NOT NULL,
      email TEXT,                 -- erased after the retention period
      section TEXT,
      body TEXT,                  -- erased after the retention period
      sources TEXT,
      note TEXT,
      words INTEGER NOT NULL,
      body_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
      reason TEXT,
      ghost_id TEXT,
      ip_hash TEXT,               -- daily-salted, cleared once an editor decides
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      decided_at TEXT,
      decided_by TEXT,
      purged_at TEXT
    );
    CREATE INDEX IF NOT EXISTS submissions_status ON submissions(status, created_at);
    CREATE INDEX IF NOT EXISTS submissions_hash ON submissions(body_hash);
  `);
  const q = (sql) => raw.prepare(sql);
  const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
  const ERASE = `email = NULL, body = NULL, sources = NULL, note = NULL, ip_hash = NULL, purged_at = ${NOW}`;

  return {
    add: (s, ip, hash) => Number(q(`INSERT INTO submissions (title, author_name, email, section, body, sources, note, words, body_hash, ip_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(s.title, s.author_name, s.email, s.section, s.body, s.sources, s.note, s.words, hash, ip).lastInsertRowid),
    get: (id) => q('SELECT * FROM submissions WHERE id = ?').get(Number(id)) || null,
    // The queue is read oldest first; decided pieces newest first.
    list: (status) => q(`SELECT * FROM submissions WHERE status = ? ORDER BY ${status === 'pending' ? 'created_at' : 'decided_at DESC'} LIMIT 500`).all(status),
    count: () => Object.fromEntries(q('SELECT status, COUNT(*) AS n FROM submissions GROUP BY status').all().map(r => [r.status, r.n])),
    findByHash: (hash) => q("SELECT id FROM submissions WHERE body_hash = ? AND status IN ('pending','accepted')").get(hash) || null,
    recentFromIp: (ip, hours) => q(`SELECT COUNT(*) AS n FROM submissions WHERE ip_hash = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now', ?)`).get(ip, `-${hours} hours`).n,
    recentFromEmail: (email, hours) => q(`SELECT COUNT(*) AS n FROM submissions WHERE email = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now', ?)`).get(email, `-${hours} hours`).n,
    decide: (id, f) => q(`UPDATE submissions SET status = ?, reason = ?, ghost_id = ?, title = ?, section = ?, ip_hash = NULL,
      decided_at = ${NOW}, decided_by = ? WHERE id = ? AND status = 'pending'`)
      .run(f.status, f.reason ?? null, f.ghost_id ?? null, f.title, f.section ?? null, f.decided_by, id).changes,
    erase: (id) => q(`UPDATE submissions SET ${ERASE} WHERE id = ?`).run(id).changes,
    // Text and contact details of decided pieces go after `days`. Title, name and decision stay for the record.
    purge: (days) => q(`UPDATE submissions SET ${ERASE} WHERE status != 'pending' AND purged_at IS NULL
      AND decided_at < strftime('%Y-%m-%dT%H:%M:%fZ','now', ?)`).run(`-${days} days`).changes,
  };
}

// ---------- Actions (public and editor) ----------
export function makeSubmissions({ db, store, ghost, secret, guestAuthorEmail }) {
  const busy = new Set(); // one decision at a time per piece (Redaksia runs as a single process)
  const editorOnly = (user) => { if (user.role !== 'editor') throw new CommunityError('Vetëm redaktorët vendosin për shkrimet e ftuara.', 403); };
  const pending = (id) => {
    const s = store.get(id);
    if (!s) throw new CommunityError('Shkrimi nuk u gjet.', 404);
    if (s.status !== 'pending' || busy.has(s.id)) throw new CommunityError('Për këtë shkrim është vendosur tashmë.', 409);
    return s;
  };

  return {
    submit(input, ip) {
      const s = validateSubmission(input);
      const ih = ip ? ipHash(secret, ip) : null;
      if (ih && store.recentFromIp(ih, 24) >= 3) throw new CommunityError('Ke dërguar tashmë disa shkrime sot. Provo sërish nesër.', 429);
      if (store.recentFromEmail(s.email, 24) >= 2) throw new CommunityError('Nga kjo adresë kanë mbërritur tashmë dy shkrime sot. Provo sërish nesër.', 429);
      const hash = bodyHash(s.body);
      if (store.findByHash(hash)) throw new CommunityError('Ky shkrim ka mbërritur tashmë te redaksia. Do të të shkruajmë në email.', 409);
      return store.add(s, ih, hash);
    },

    // Ghost first, then our records: if Ghost refuses, nothing is recorded and the piece stays in the queue.
    async accept(user, id, input = {}) {
      editorOnly(user);
      const s = pending(id);
      if (!s.body) throw new CommunityError('Teksti i këtij shkrimi është fshirë.', 410);
      const title = line(input.title ?? s.title, 160);
      if (title.length < 8 || title.length > 160) throw new CommunityError('Titulli duhet të ketë 8 deri në 160 shkronja.');
      const section = input.section === undefined ? s.section : (Object.hasOwn(SUBMISSION_SECTIONS, String(input.section)) ? String(input.section) : null);
      const tags = [
        ...(section ? [{ name: SUBMISSION_SECTIONS[section], slug: section }] : []),
        GUEST_TAG,
        { name: STATUSES.submitted.tag },
      ];
      busy.add(s.id);
      try {
        let post;
        try {
          post = await ghost.createDraft({ title, html: submissionHtml({ ...s, title }), tags, authorEmail: guestAuthorEmail || null });
        } catch (e) {
          throw new CommunityError(`Ghost nuk e krijoi draftin: ${e.message}. Provo sërish.`, 502);
        }
        db.tx(() => {
          if (!store.decide(s.id, { status: 'accepted', ghost_id: post.id, title, section, decided_by: user.email })) {
            throw new CommunityError('Për këtë shkrim është vendosur tashmë.', 409);
          }
          db.createArticle({ ghost_id: post.id, title, author_email: s.email, author_name: s.author_name, status: 'submitted' });
          db.log({ actor: user.email, ghost_id: post.id, action: 'guest_accept', to: 'submitted', detail: { submission: s.id, title } });
        });
        return post.id;
      } finally {
        busy.delete(s.id);
      }
    },

    reject(user, id, input = {}) {
      editorOnly(user);
      const s = pending(id);
      const reason = line(input.reason === 'other' ? input.reason_other : input.reason, 300);
      if (!reason) throw new CommunityError('Zgjidh ose shkruaj arsyen.');
      db.tx(() => {
        store.decide(s.id, { status: 'rejected', reason, title: s.title, section: s.section, decided_by: user.email });
        if (reason === SPAM_REASON) store.erase(s.id);
        db.log({ actor: user.email, action: 'guest_reject', detail: { submission: s.id, title: s.title, reason } });
      });
    },

    purge(days = LIMITS.retentionDays) { return store.purge(days); },
  };
}
