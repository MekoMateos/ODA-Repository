// Applies workflow actions: checks the rules, updates Ghost first, then records the change.
// If Ghost refuses (e.g. someone edited the post at the same moment), nothing is recorded.
import { check, ACTIONS, CHECKLIST, canTick, isAuthor, RATINGS } from './workflow.js';

export class ActionError extends Error {}

export function makeService({ db, ghost }) {
  async function perform(action, user, ghostId, input = {}) {
    let article = db.getArticle(ghostId);

    if (!article && action === 'submit') {
      const post = await ghost.getPost(ghostId);
      const author = (post.authors || [])[0];
      if (!author || author.email?.toLowerCase() !== user.email) throw new ActionError('Mund të dorëzosh vetëm draftet e tua.');
      if (post.status !== 'draft') throw new ActionError('Vetëm draftet mund të dorëzohen.');
      db.createArticle({ ghost_id: post.id, title: post.title, author_email: author.email, author_name: author.name, status: 'draft' });
      db.log({ actor: user.email, ghost_id: post.id, action: 'import', to: 'draft' });
      article = db.getArticle(ghostId);
    }
    if (!article) throw new ActionError('Artikulli nuk u gjet.');

    const res = check(action, user, article, input);
    if (!res.ok) throw new ActionError(res.error);
    const from = article.status, to = res.to;
    const rating = action === 'pass_verification' ? input.rating : article.rating;

    // 1. Ghost
    try {
      if (action === 'publish') await ghost.publish(ghostId, rating);
      else if (action === 'schedule') await ghost.schedule(ghostId, rating, input.publish_at);
      else if (action === 'unschedule') await ghost.unschedule(ghostId, rating);
      else if (to !== from || action === 'pass_verification') await ghost.setWorkflowTags(ghostId, to, rating);
    } catch (e) {
      throw new ActionError(`Ghost nuk e pranoi ndryshimin: ${e.message}. Rifresko dhe provo sërish.`);
    }

    // 2. Our records, in one transaction
    db.tx(() => {
      const fields = { status: to };
      if (action === 'submit') {
        db.clearReviewSignoffs(ghostId);
        fields.rating = null;
      }
      if (action === 'triage') fields.editor_email = user.email;
      if (action === 'request_revision') { db.clearReviewSignoffs(ghostId); fields.rating = null; }
      if (action === 'pass_verification') {
        fields.rating = input.rating;
        db.sign(ghostId, 'verification', user.email);
        db.sign(ghostId, 'checklist:rating_recorded', user.email);
      }
      if (action === 'pass_legal') {
        db.sign(ghostId, 'legal', user.email);
        db.sign(ghostId, 'checklist:legal_done', user.email);
      }
      if (action === 'approve') db.sign(ghostId, 'approval', user.email);
      if (action === 'schedule') fields.publish_at = new Date(input.publish_at).toISOString();
      if (action === 'unschedule') fields.publish_at = null;

      db.updateArticle(ghostId, fields);
      const note = String(input.note || '').trim();
      if (note) db.addNote(ghostId, user.email, `${ACTIONS[action].label}: ${note}`);
      db.log({ actor: user.email, ghost_id: ghostId, action, from, to, detail: { note: note || undefined, rating: input.rating, publish_at: input.publish_at } });
    });

    // Legal review not required: verification sign-off on its own unlocks approval;
    // when it IS required, the move to legal_review already happened above.
    return db.getArticle(ghostId);
  }

  function assign(user, ghostId, { verifier_email, deadline, legal_required }) {
    const a = db.getArticle(ghostId);
    if (!a) throw new ActionError('Artikulli nuk u gjet.');
    if (user.role !== 'editor') throw new ActionError('Vetëm redaktorët caktojnë detyrat.');
    if (['published', 'rejected'].includes(a.status)) throw new ActionError('Artikulli është mbyllur.');
    if (verifier_email) {
      const v = db.getUser(verifier_email);
      if (!v || v.role !== 'verifier' || !v.active) throw new ActionError('Zgjidh një verifikues aktiv.');
      if (v.email === a.author_email) throw new ActionError('Autori nuk mund ta verifikojë artikullin e vet.');
    }
    if (deadline && Number.isNaN(Date.parse(deadline))) throw new ActionError('Afati nuk është datë e vlefshme.');
    const fields = {
      verifier_email: verifier_email || null,
      deadline: deadline || null,
      legal_required: legal_required ? 1 : 0,
    };
    db.tx(() => {
      db.updateArticle(ghostId, fields);
      db.log({ actor: user.email, ghost_id: ghostId, action: 'assign', detail: fields });
    });
  }

  function tick(user, ghostId, key, on) {
    const a = db.getArticle(ghostId);
    const item = CHECKLIST.find(c => c.key === key);
    if (!a || !item) throw new ActionError('Pika nuk u gjet.');
    if (!canTick(user, item, a)) throw new ActionError('Roli yt nuk e konfirmon këtë pikë.');
    if (['published', 'rejected', 'scheduled'].includes(a.status)) throw new ActionError('Lista është mbyllur.');
    db.tx(() => {
      if (on) db.sign(ghostId, `checklist:${key}`, user.email); else db.unsign(ghostId, `checklist:${key}`);
      db.log({ actor: user.email, ghost_id: ghostId, action: on ? 'check' : 'uncheck', detail: { item: key } });
    });
  }

  function note(user, ghostId, body) {
    const a = db.getArticle(ghostId);
    if (!a) throw new ActionError('Artikulli nuk u gjet.');
    if (!canSee(user, a)) throw new ActionError('Nuk ke akses në këtë artikull.');
    const text = String(body || '').trim();
    if (!text) throw new ActionError('Shënimi është bosh.');
    if (text.length > 5000) throw new ActionError('Shënimi është shumë i gjatë (maks. 5000 shkronja).');
    db.tx(() => {
      db.addNote(ghostId, user.email, text);
      db.log({ actor: user.email, ghost_id: ghostId, action: 'note' });
    });
  }

  function setUser(admin, input) {
    if (admin.role !== 'admin') throw new ActionError('Vetëm administratori menaxhon ekipin.');
    const email = String(input.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ActionError('Email i pavlefshëm.');
    if (!input.name?.trim()) throw new ActionError('Shkruaj emrin.');
    if (!['contributor', 'editor', 'verifier', 'legal', 'admin'].includes(input.role)) throw new ActionError('Rol i pavlefshëm.');
    const active = input.active !== '0' && input.active !== false;
    const existing = db.getUser(email);
    if (existing?.role === 'admin' && (input.role !== 'admin' || !active) && db.countAdmins() <= 1) {
      throw new ActionError('Duhet të mbetet të paktën një administrator aktiv.');
    }
    db.tx(() => {
      db.upsertUser({ email, name: input.name, role: input.role, active });
      db.log({ actor: admin.email, action: existing ? 'user_update' : 'user_add', detail: { email, role: input.role, active } });
    });
  }

  return { perform, assign, tick, note, setUser };
}

export function canSee(user, article) {
  return user.role !== 'contributor' || isAuthor(user, article);
}

export { RATINGS };
