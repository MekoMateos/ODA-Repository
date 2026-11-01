// Storage for workflow state. Ghost holds the article text; this DB holds who did what and when.
// The audit log is append-only: SQLite triggers refuse any UPDATE or DELETE on it.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY COLLATE NOCASE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('contributor','editor','verifier','legal','admin')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS articles (
      ghost_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author_email TEXT NOT NULL COLLATE NOCASE,
      author_name TEXT NOT NULL,
      status TEXT NOT NULL,
      editor_email TEXT COLLATE NOCASE,
      verifier_email TEXT COLLATE NOCASE,
      legal_required INTEGER NOT NULL DEFAULT 1,
      rating TEXT,
      deadline TEXT,
      publish_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS articles_status ON articles(status);

    CREATE TABLE IF NOT EXISTS signoffs (
      ghost_id TEXT NOT NULL REFERENCES articles(ghost_id),
      kind TEXT NOT NULL,                 -- verification | legal | approval | checklist:<key>
      actor_email TEXT NOT NULL COLLATE NOCASE,
      at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      PRIMARY KEY (ghost_id, kind)
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ghost_id TEXT NOT NULL REFERENCES articles(ghost_id),
      actor_email TEXT NOT NULL COLLATE NOCASE,
      body TEXT NOT NULL,
      at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      actor_email TEXT NOT NULL,
      ghost_id TEXT,
      action TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      detail TEXT
    );
    CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit
      BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit
      BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
  `);
  return wrap(db);
}

function wrap(db) {
  const q = (sql) => db.prepare(sql);
  const tx = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  };

  const api = {
    raw: db,
    tx,

    // Users
    getUser: (email) => q('SELECT * FROM users WHERE email = ?').get(email) || null,
    listUsers: () => q('SELECT * FROM users ORDER BY active DESC, role, name').all(),
    usersByRole: (role) => q('SELECT * FROM users WHERE role = ? AND active = 1 ORDER BY name').all(role),
    upsertUser: ({ email, name, role, active = 1 }) =>
      q(`INSERT INTO users (email, name, role, active) VALUES (?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = excluded.role, active = excluded.active`)
        .run(email.trim().toLowerCase(), name.trim(), role, active ? 1 : 0),
    countAdmins: () => q("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").get().n,

    // Articles
    getArticle: (id) => {
      const a = q(`SELECT articles.*, (SELECT name FROM users WHERE email = editor_email) AS editor_name,
                   (SELECT name FROM users WHERE email = verifier_email) AS verifier_name FROM articles WHERE ghost_id = ?`).get(id);
      return a ? hydrate(a) : null;
    },
    listArticles: ({ status, assignee, author } = {}) => {
      const where = [], args = [];
      if (status) { where.push('status = ?'); args.push(status); }
      if (assignee) { where.push('(editor_email = ? OR verifier_email = ?)'); args.push(assignee, assignee); }
      if (author) { where.push('author_email = ?'); args.push(author); }
      const sql = `SELECT articles.*, (SELECT name FROM users WHERE email = editor_email) AS editor_name,
                   (SELECT name FROM users WHERE email = verifier_email) AS verifier_name
                   FROM articles ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                   ORDER BY CASE WHEN deadline IS NULL THEN 1 ELSE 0 END, deadline, updated_at DESC LIMIT 500`;
      return q(sql).all(...args).map(hydrate);
    },
    countByStatus: () => Object.fromEntries(q('SELECT status, COUNT(*) AS n FROM articles GROUP BY status').all().map(r => [r.status, r.n])),
    createArticle: (a) =>
      q(`INSERT INTO articles (ghost_id, title, author_email, author_name, status) VALUES (?, ?, ?, ?, ?)`)
        .run(a.ghost_id, a.title, a.author_email, a.author_name, a.status),
    updateArticle: (id, fields) => {
      const allowed = ['title', 'status', 'editor_email', 'verifier_email', 'legal_required', 'rating', 'deadline', 'publish_at'];
      const keys = Object.keys(fields).filter(k => allowed.includes(k));
      if (!keys.length) return;
      q(`UPDATE articles SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ghost_id = ?`)
        .run(...keys.map(k => fields[k] ?? null), id);
    },

    // Sign-offs and checklist
    sign: (id, kind, email) => q('INSERT OR REPLACE INTO signoffs (ghost_id, kind, actor_email) VALUES (?, ?, ?)').run(id, kind, email),
    unsign: (id, kind) => q('DELETE FROM signoffs WHERE ghost_id = ? AND kind = ?').run(id, kind),
    clearReviewSignoffs: (id) => q("DELETE FROM signoffs WHERE ghost_id = ? AND kind IN ('verification','legal','approval','checklist:rating_recorded','checklist:legal_done')").run(id),

    // Notes
    addNote: (id, email, body) => q('INSERT INTO notes (ghost_id, actor_email, body) VALUES (?, ?, ?)').run(id, email, body),
    notes: (id) => q('SELECT n.*, u.name AS actor_name FROM notes n LEFT JOIN users u ON u.email = n.actor_email WHERE ghost_id = ? ORDER BY n.id').all(id),

    // Audit
    log: (entry) => q('INSERT INTO audit (actor_email, ghost_id, action, from_status, to_status, detail) VALUES (?, ?, ?, ?, ?, ?)')
      .run(entry.actor, entry.ghost_id ?? null, entry.action, entry.from ?? null, entry.to ?? null, entry.detail ? JSON.stringify(entry.detail) : null),
    history: (id) => q('SELECT a.*, u.name AS actor_name FROM audit a LEFT JOIN users u ON u.email = a.actor_email WHERE ghost_id = ? ORDER BY a.id DESC').all(id),
    recentAudit: (limit = 200) => q('SELECT a.*, u.name AS actor_name FROM audit a LEFT JOIN users u ON u.email = a.actor_email ORDER BY a.id DESC LIMIT ?').all(limit),
  };

  function hydrate(a) {
    const rows = q('SELECT s.*, u.name AS actor_name FROM signoffs s LEFT JOIN users u ON u.email = s.actor_email WHERE ghost_id = ?').all(a.ghost_id);
    const signoffs = {}, checklist = {};
    for (const r of rows) {
      if (r.kind.startsWith('checklist:')) checklist[r.kind.slice(10)] = r;
      else signoffs[r.kind] = r;
    }
    return { ...a, legal_required: !!a.legal_required, signoffs, checklist };
  }

  return api;
}
