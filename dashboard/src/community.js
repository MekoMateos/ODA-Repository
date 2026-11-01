// Reader-facing features run by the editors: suggested student resources and reader polls.
// Nothing a reader sends is shown publicly until an editor approves it.
import crypto from 'node:crypto';

export class CommunityError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const RESOURCE_CATEGORIES = {
  kurse: 'Kurse falas',
  libra: 'Libra dhe tekste',
  bursa: 'Bursa dhe mundësi',
  mjete: 'Mjete dhe programe',
  'te-dhena': 'Të dhëna dhe statistika',
  akademike: 'Kërkim akademik',
  gjuhe: 'Gjuhë të huaja',
  karriere: 'Praktika dhe karrierë',
};
export const RESOURCE_LANGS = { sq: 'Shqip', en: 'Anglisht', tjeter: 'Tjetër' };
// Name stored on the starter list so editors can tell it apart in the queue; never shown publicly.
export const SEED_NAME = 'Lista fillestare e ODA';
export const REJECT_REASONS = ['Nuk është falas', 'Spam ose reklamë', 'Burim i pabesueshëm', 'Dublikatë', 'Jashtë temës', 'Lidhja nuk punon'];

const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref$)/i;

export function normalizeUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol)) return null;
  if (u.username || u.password || !u.hostname.includes('.')) return null;
  u.hash = '';
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.toString();
}

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max + 1);

// A datetime-local value typed by an editor in Albania ("2026-11-15T18:00") is Tirana time, whatever the server's zone.
export function tiraneToIso(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(local || '').trim());
  if (!m) { const t = Date.parse(local); return Number.isNaN(t) ? null : new Date(t).toISOString(); }
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const wanted = Date.UTC(y, mo - 1, d, h, mi);
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Tirane', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  let guess = wanted;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(guess)).map(x => [x.type, x.value]));
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    if (shown === wanted) break;
    guess += wanted - shown;
  }
  return new Date(guess).toISOString();
}

// Validates a public suggestion. Returns the cleaned record or throws CommunityError.
export function validateSuggestion(input) {
  if (String(input.website || '').trim()) throw new CommunityError('Kërkesa u refuzua.', 400); // honeypot field, invisible to people
  const title = clean(input.title, 120);
  const description = clean(input.description, 280);
  const submitter = clean(input.submitter_name, 60);
  const url = normalizeUrl(input.url);
  if (title.length < 3 || title.length > 120) throw new CommunityError('Titulli duhet të ketë 3 deri në 120 shkronja.');
  if (!url || url.length > 500) throw new CommunityError('Shkruaj një lidhje të vlefshme që nis me https://');
  if (!RESOURCE_CATEGORIES[input.category]) throw new CommunityError('Zgjidh një kategori.');
  if (description.length > 280) throw new CommunityError('Përshkrimi duhet të jetë deri në 280 shkronja.');
  if (submitter.length > 60) throw new CommunityError('Emri duhet të jetë deri në 60 shkronja.');
  const language = RESOURCE_LANGS[input.language] ? input.language : 'tjeter';
  return { title, url, category: input.category, description, language, submitter_name: submitter || null };
}

export function validatePoll(input) {
  const question = clean(input.question, 200);
  const description = clean(input.description, 500);
  const options = (Array.isArray(input.options) ? input.options : String(input.options || '').split('\n'))
    .map(o => clean(o, 80)).filter(Boolean);
  if (question.length < 8 || question.length > 200) throw new CommunityError('Pyetja duhet të ketë 8 deri në 200 shkronja.');
  if (description.length > 500) throw new CommunityError('Sqarimi duhet të jetë deri në 500 shkronja.');
  if (options.length < 2 || options.length > 6) throw new CommunityError('Shkruaj 2 deri në 6 përgjigje, një për rresht.');
  if (options.some(o => o.length > 80)) throw new CommunityError('Çdo përgjigje duhet të jetë deri në 80 shkronja.');
  if (new Set(options.map(o => o.toLowerCase())).size !== options.length) throw new CommunityError('Përgjigjet duhet të jenë të ndryshme.');
  let closes_at = null;
  if (String(input.closes_at || '').trim()) {
    closes_at = tiraneToIso(input.closes_at);
    if (!closes_at || Date.parse(closes_at) < Date.now()) throw new CommunityError('Data e mbylljes duhet të jetë në të ardhmen.');
  }
  return { question, description: description || null, options, closes_at };
}

export function slugify(s) {
  let out = String(s).replace(/[ëË]/g, 'e').replace(/[çÇ]/g, 'c').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (out.length > 60) out = out.slice(0, 61).replace(/-[^-]*$/, '') || out.slice(0, 60); // cut at a whole word
  return out || 'sondazh';
}

export function isPollOpen(p, now = Date.now()) {
  return p.status === 'open' && (!p.closes_at || Date.parse(p.closes_at) > now);
}

export function memberHash(secret, email) {
  return crypto.createHmac('sha256', secret).update(`member:${String(email).trim().toLowerCase()}`).digest('hex');
}
// Daily-salted, so the same address cannot be followed from one day to the next. Cleared once an editor decides.
export function ipHash(secret, ip) {
  const day = new Date().toISOString().slice(0, 10);
  return crypto.createHmac('sha256', secret).update(`ip:${ip}:${day}`).digest('hex').slice(0, 32);
}

// ---------- Storage ----------
export function communityStore(db) {
  const raw = db.raw;
  raw.exec(`
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      language TEXT NOT NULL DEFAULT 'tjeter',
      submitter_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      featured INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      ip_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      decided_at TEXT,
      decided_by TEXT
    );
    CREATE INDEX IF NOT EXISTS resources_status ON resources(status, category);
    CREATE INDEX IF NOT EXISTS resources_url ON resources(url);

    CREATE TABLE IF NOT EXISTS polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      question TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed')),
      opened_at TEXT,
      opened_by TEXT,
      closes_at TEXT,
      closed_at TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS poll_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL REFERENCES polls(id),
      label TEXT NOT NULL,
      position INTEGER NOT NULL
    );
    -- One row per reader per poll. Readers are stored only as a keyed hash, never by email.
    CREATE TABLE IF NOT EXISTS poll_votes (
      poll_id INTEGER NOT NULL REFERENCES polls(id),
      member_hash TEXT NOT NULL,
      option_id INTEGER NOT NULL REFERENCES poll_options(id),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      PRIMARY KEY (poll_id, member_hash)
    );
    CREATE TRIGGER IF NOT EXISTS poll_votes_no_update BEFORE UPDATE ON poll_votes
      BEGIN SELECT RAISE(ABORT, 'votes cannot be changed'); END;
    CREATE TRIGGER IF NOT EXISTS poll_votes_no_delete BEFORE DELETE ON poll_votes
      BEGIN SELECT RAISE(ABORT, 'votes cannot be deleted'); END;
  `);
  const q = (sql) => raw.prepare(sql);
  const withOptions = (p) => p ? { ...p, options: q('SELECT id, label FROM poll_options WHERE poll_id = ? ORDER BY position').all(p.id) } : null;

  const store = {
    // Resources
    findByUrl: (url) => q("SELECT * FROM resources WHERE url = ? AND status IN ('pending','approved')").get(url) || null,
    addResource: (r, ip) => Number(q(`INSERT INTO resources (title, url, category, description, language, submitter_name, ip_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(r.title, r.url, r.category, r.description, r.language, r.submitter_name, ip).lastInsertRowid),
    getResource: (id) => q('SELECT * FROM resources WHERE id = ?').get(id) || null,
    listResources: (status) => q(`SELECT * FROM resources WHERE status = ? ORDER BY ${status === 'approved' ? 'featured DESC, title COLLATE NOCASE' : 'COALESCE(decided_at, created_at) DESC'} LIMIT 1000`).all(status),
    countResources: () => Object.fromEntries(q('SELECT status, COUNT(*) AS n FROM resources GROUP BY status').all().map(r => [r.status, r.n])),
    decideResource: (id, f) => q(`UPDATE resources SET status = ?, title = ?, category = ?, description = ?, featured = ?, reason = ?, ip_hash = NULL,
      decided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), decided_by = ? WHERE id = ?`)
      .run(f.status, f.title, f.category, f.description, f.featured ? 1 : 0, f.reason ?? null, f.decided_by, id),
    recentFromIp: (ip, minutes) => q(`SELECT COUNT(*) AS n FROM resources WHERE ip_hash = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now', ?)`)
      .get(ip, `-${minutes} minutes`).n,

    // Polls
    addPoll: (p, by) => {
      const base = slugify(p.question);
      let slug = base, n = 2;
      while (q('SELECT 1 FROM polls WHERE slug = ?').get(slug)) slug = `${base.slice(0, 55)}-${n++}`;
      const id = Number(q('INSERT INTO polls (slug, question, description, closes_at, created_by) VALUES (?, ?, ?, ?, ?)')
        .run(slug, p.question, p.description, p.closes_at, by).lastInsertRowid);
      p.options.forEach((label, i) => q('INSERT INTO poll_options (poll_id, label, position) VALUES (?, ?, ?)').run(id, label, i));
      return id;
    },
    getPoll: (id) => withOptions(q('SELECT * FROM polls WHERE id = ?').get(Number(id))),
    getPollBySlug: (slug) => withOptions(q('SELECT * FROM polls WHERE slug = ?').get(String(slug))),
    listPolls: (statuses) => q(`SELECT * FROM polls WHERE status IN (${statuses.map(() => '?').join(',')})
      ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, COALESCE(opened_at, created_at) DESC LIMIT 200`)
      .all(...statuses).map(withOptions),
    openPoll: (id, by) => q("UPDATE polls SET status = 'open', opened_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), opened_by = ? WHERE id = ? AND status = 'draft'").run(by, id),
    closePoll: (id) => q("UPDATE polls SET status = 'closed', closed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'open'").run(id),
    // Polls past their closing time are closed for good, so their results are final and public.
    closeExpired: () => q("UPDATE polls SET status = 'closed', closed_at = closes_at WHERE status = 'open' AND closes_at IS NOT NULL AND closes_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')").run().changes,
    deleteDraft: (id) => {
      q("DELETE FROM poll_options WHERE poll_id = ? AND EXISTS (SELECT 1 FROM polls WHERE id = ? AND status = 'draft')").run(id, id);
      return q("DELETE FROM polls WHERE id = ? AND status = 'draft'").run(id).changes;
    },
    tallies: (pollId) => {
      const rows = q('SELECT o.id, o.label, COUNT(v.member_hash) AS votes FROM poll_options o LEFT JOIN poll_votes v ON v.option_id = o.id WHERE o.poll_id = ? GROUP BY o.id ORDER BY o.position').all(pollId);
      const total = rows.reduce((s, r) => s + r.votes, 0);
      return { total, options: rows.map(r => ({ id: r.id, label: r.label, votes: r.votes, pct: total ? Math.round((r.votes / total) * 1000) / 10 : 0 })) };
    },
    totalVotes: (pollId) => q('SELECT COUNT(*) AS n FROM poll_votes WHERE poll_id = ?').get(pollId).n,
    voteOf: (pollId, hash) => q('SELECT option_id FROM poll_votes WHERE poll_id = ? AND member_hash = ?').get(pollId, hash)?.option_id ?? null,
    addVote: (pollId, hash, optionId) => q('INSERT INTO poll_votes (poll_id, member_hash, option_id) VALUES (?, ?, ?)').run(pollId, hash, optionId),
  };
  return store;
}

// ---------- Actions (editor and public) ----------
export function makeCommunity({ db, store, secret }) {
  const editorOnly = (user, msg) => { if (user.role !== 'editor') throw new CommunityError(msg, 403); };

  const api = {
    suggest(input, ip) {
      const r = validateSuggestion(input);
      const ih = ip ? ipHash(secret, ip) : null;
      if (ih && store.recentFromIp(ih, 60) >= 5) throw new CommunityError('Ke dërguar shumë sugjerime. Provo sërish pas një ore.', 429);
      if (store.findByUrl(r.url)) throw new CommunityError('Ky burim është sugjeruar tashmë. Faleminderit!', 409);
      return store.addResource(r, ih);
    },

    // An editor adds a resource directly: same checks, and the log shows who added it.
    addDirect(user, input) {
      editorOnly(user, 'Vetëm redaktorët shtojnë burime.');
      const r = validateSuggestion({ ...input, website: '' });
      if (store.findByUrl(r.url)) throw new CommunityError('Ky burim ekziston tashmë në listë ose në pritje.', 409);
      return db.tx(() => {
        const id = store.addResource({ ...r, submitter_name: null }, null);
        store.decideResource(id, { status: 'approved', title: r.title, category: r.category, description: r.description || null, featured: input.featured === '1', reason: null, decided_by: user.email });
        db.log({ actor: user.email, action: 'resource_added', detail: { id, url: r.url } });
        return id;
      });
    },

    decide(user, id, input) {
      editorOnly(user, 'Vetëm redaktorët miratojnë burimet.');
      const r = store.getResource(Number(id));
      if (!r) throw new CommunityError('Burimi nuk u gjet.', 404);
      const status = input.decision === 'approve' ? 'approved' : input.decision === 'reject' ? 'rejected' : null;
      if (!status) throw new CommunityError('Vendim i pavlefshëm.');
      const title = clean(input.title ?? r.title, 120);
      const category = RESOURCE_CATEGORIES[input.category] ? input.category : r.category;
      const description = clean(input.description ?? r.description ?? '', 280);
      if (title.length < 3) throw new CommunityError('Titulli është shumë i shkurtër.');
      db.tx(() => {
        store.decideResource(r.id, {
          status, title, category, description: description || null,
          featured: status === 'approved' && (input.featured === '1' || input.featured === true),
          reason: status === 'rejected' ? (clean(input.reason, 200) || null) : null, decided_by: user.email,
        });
        db.log({ actor: user.email, action: `resource_${status}`, detail: { id: r.id, url: r.url } });
      });
    },

    createPoll(user, input) {
      editorOnly(user, 'Vetëm redaktorët krijojnë sondazhe.');
      const p = validatePoll(input);
      return db.tx(() => {
        const id = store.addPoll(p, user.email);
        db.log({ actor: user.email, action: 'poll_create', detail: { id, question: p.question } });
        return id;
      });
    },

    openPoll(user, id) {
      editorOnly(user, 'Vetëm redaktorët hapin sondazhe.');
      const p = store.getPoll(id);
      if (!p) throw new CommunityError('Sondazhi nuk u gjet.', 404);
      if (p.status !== 'draft') throw new CommunityError('Vetëm një draft mund të hapet.');
      if (p.closes_at && Date.parse(p.closes_at) <= Date.now()) throw new CommunityError('Data e mbylljes ka kaluar. Krijo sondazhin përsëri me një datë të re.');
      // Four eyes: when the team has more than one editor, someone other than the author opens the poll.
      if (p.created_by === user.email && db.usersByRole('editor').length > 1) {
        throw new CommunityError('Një redaktor tjetër duhet ta lexojë dhe ta hapë këtë sondazh.', 403);
      }
      db.tx(() => {
        store.openPoll(p.id, user.email);
        db.log({ actor: user.email, action: 'poll_open', detail: { id: p.id, question: p.question } });
      });
    },

    closePoll(user, id) {
      editorOnly(user, 'Vetëm redaktorët mbyllin sondazhe.');
      const p = store.getPoll(id);
      if (!p) throw new CommunityError('Sondazhi nuk u gjet.', 404);
      if (p.status !== 'open') throw new CommunityError('Vetëm një sondazh i hapur mund të mbyllet.');
      db.tx(() => {
        store.closePoll(p.id);
        db.log({ actor: user.email, action: 'poll_close', detail: { id: p.id, question: p.question } });
      });
    },

    deletePoll(user, id) {
      editorOnly(user, 'Vetëm redaktorët fshijnë drafte.');
      const p = store.getPoll(id);
      if (!p) throw new CommunityError('Sondazhi nuk u gjet.', 404);
      if (p.status !== 'draft') throw new CommunityError('Një sondazh që është hapur nuk fshihet. Mund ta mbyllësh.');
      db.tx(() => {
        store.deleteDraft(p.id);
        db.log({ actor: user.email, action: 'poll_delete', detail: { id: p.id, question: p.question } });
      });
    },

    vote(slug, email, optionId) {
      store.closeExpired();
      const p = store.getPollBySlug(slug);
      if (!p || p.status === 'draft') throw new CommunityError('Sondazhi nuk u gjet.', 404);
      if (!isPollOpen(p)) throw new CommunityError('Ky sondazh është mbyllur.', 409);
      const opt = p.options.find(o => o.id === Number(optionId));
      if (!opt) throw new CommunityError('Zgjidh një nga përgjigjet.');
      const h = memberHash(secret, email);
      if (store.voteOf(p.id, h) !== null) throw new CommunityError('Ke votuar tashmë në këtë sondazh.', 409);
      try { store.addVote(p.id, h, opt.id); }
      catch (e) { if (String(e.message).includes('UNIQUE')) throw new CommunityError('Ke votuar tashmë në këtë sondazh.', 409); throw e; }
      return { voted: opt.id, results: store.tallies(p.id) };
    },

    // Public view of a poll. Live tallies only after the reader has voted, or once the poll is closed.
    publicPoll(p, email) {
      const open = isPollOpen(p);
      const voted = email ? store.voteOf(p.id, memberHash(secret, email)) : null;
      const showResults = !open || voted !== null;
      return {
        slug: p.slug, question: p.question, description: p.description,
        status: open ? 'open' : 'closed', opened_at: p.opened_at, closes_at: p.closes_at, closed_at: p.closed_at,
        options: p.options.map(o => ({ id: o.id, label: o.label })),
        total: store.totalVotes(p.id),
        voted, results: showResults ? store.tallies(p.id) : null,
      };
    },

    publicPolls(email) {
      store.closeExpired();
      return store.listPolls(['open', 'closed']).map(p => api.publicPoll(p, email));
    },
  };
  return api;
}
