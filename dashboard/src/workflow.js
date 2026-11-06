// The editorial workflow from the ODA blueprint, as pure rules (no I/O) so it can be tested.

export const STATUSES = {
  draft:           { sq: 'Draft',                 en: 'Draft',              tag: null },
  submitted:       { sq: 'Dorëzuar',              en: 'Submitted',          tag: '#submitted' },
  in_review:       { sq: 'Në shqyrtim',           en: 'In review',          tag: '#in-review' },
  revision:        { sq: 'Kërkohet rishikim',     en: 'Revision requested', tag: '#revision' },
  in_verification: { sq: 'Në verifikim',          en: 'In verification',    tag: '#in-verification' },
  legal_review:    { sq: 'Në shqyrtim ligjor',    en: 'Legal review',       tag: '#legal-review' },
  approved:        { sq: 'Miratuar',              en: 'Approved',           tag: '#approved' },
  scheduled:       { sq: 'Planifikuar',           en: 'Scheduled',          tag: null },
  published:       { sq: 'Publikuar',             en: 'Published',          tag: null },
  rejected:        { sq: 'Refuzuar',              en: 'Rejected',           tag: '#rejected' },
};

export const WORKFLOW_TAGS = Object.values(STATUSES).map(s => s.tag).filter(Boolean);

export const RATINGS = {
  verified: { sq: 'Verifikuar', tag: '#verifikuar' },
  partly:   { sq: 'Pjesërisht i verifikuar', tag: '#pjeserisht' },
  opinion:  { sq: 'Opinion (pa vlerësim faktik)', tag: null },
};

export const ROLES = {
  contributor: 'Kontribues',
  editor: 'Redaktor',
  verifier: 'Verifikues',
  legal: 'Jurist',
  admin: 'Administrator teknik',
};

// Publication checklist (blueprint §16). `required: false` items don't block approval.
export const CHECKLIST = [
  { key: 'claims_sourced',   label: 'Çdo pretendim ka burim të bashkëngjitur', roles: ['verifier', 'editor'] },
  { key: 'two_sources',      label: 'Dokument primar ose dy burime të pavarura të konfirmuara', roles: ['verifier'] },
  { key: 'rating_recorded',  label: 'Vlerësimi faktik i regjistruar', roles: ['verifier'], auto: true },
  { key: 'legal_done',       label: 'Shqyrtimi ligjor i kryer', roles: ['legal'], auto: true },
  { key: 'personal_data',    label: 'Emrat dhe të dhënat personale të kontrolluara', roles: ['legal', 'editor'] },
  { key: 'media_cleared',    label: 'Imazhet dhe citimet me të drejta të qarta', roles: ['editor', 'legal'] },
  { key: 'summary_30s',      label: 'Përmbledhja lexohet në 30 sekonda', roles: ['editor'] },
  { key: 'sources_section',  label: 'Seksioni "Burimet" në fund të artikullit', roles: ['editor', 'verifier'] },
  { key: 'translation',      label: 'Versioni anglisht gati', roles: ['editor'], required: false },
];

// Each action: who may do it, from which statuses, where it leads.
// `guard` returns an error string (in Albanian, shown to the user) or null.
export const ACTIONS = {
  submit: {
    label: 'Dorëzo për shqyrtim', from: ['draft', 'revision'], to: 'submitted',
    // A guest writer has no account: after a revision an editor resubmits on their behalf.
    allowed: (u, a) => isAuthor(u, a) || (!!a.guest && u.role === 'editor'),
  },
  triage: {
    label: 'Merre në shqyrtim', from: ['submitted'], to: 'in_review',
    allowed: u => u.role === 'editor',
  },
  send_to_verification: {
    label: 'Dërgo në verifikim', from: ['in_review'], to: 'in_verification',
    allowed: u => u.role === 'editor',
    guard: a => a.verifier_email ? null : 'Cakto një verifikues para se ta dërgosh.',
  },
  request_revision: {
    label: 'Kërko rishikim', from: ['in_review', 'in_verification', 'legal_review', 'approved'], to: 'revision', needsNote: true,
    allowed: (u, a) => u.role === 'editor' || (u.role === 'verifier' && a.status === 'in_verification') || (u.role === 'legal' && a.status === 'legal_review'),
  },
  pass_verification: {
    label: 'Verifikimi kaloi', from: ['in_verification'], to: a => (a.legal_required ? 'legal_review' : 'in_verification'), needsRating: true,
    allowed: (u, a) => u.role === 'verifier' && !isAuthor(u, a),
  },
  pass_legal: {
    label: 'Shqyrtimi ligjor kaloi', from: ['legal_review'], to: 'legal_review',
    allowed: (u, a) => u.role === 'legal' && !isAuthor(u, a),
    guard: a => a.signoffs.verification ? null : 'Verifikimi duhet të kalojë para shqyrtimit ligjor.',
  },
  approve: {
    label: 'Mirato', from: ['in_verification', 'legal_review'], to: 'approved',
    allowed: (u, a) => u.role === 'editor' && !isAuthor(u, a),
    guard: approvalBlocker,
  },
  publish: {
    label: 'Publiko tani', from: ['approved'], to: 'published', confirm: true,
    allowed: (u, a) => u.role === 'editor' && !isAuthor(u, a),
  },
  schedule: {
    label: 'Planifiko', from: ['approved'], to: 'scheduled', needsDate: true,
    allowed: (u, a) => u.role === 'editor' && !isAuthor(u, a),
  },
  unschedule: {
    label: 'Anulo planifikimin', from: ['scheduled'], to: 'approved',
    allowed: u => u.role === 'editor',
  },
  reject: {
    label: 'Refuzo', from: ['submitted', 'in_review', 'in_verification', 'legal_review', 'revision', 'approved'], to: 'rejected', needsNote: true, confirm: true,
    allowed: u => u.role === 'editor',
  },
  reopen: {
    label: 'Rihap (apel)', from: ['rejected'], to: 'submitted', needsNote: true,
    allowed: u => u.role === 'editor',
  },
};

export function isAuthor(user, article) {
  return !!user && !!article && user.email.toLowerCase() === String(article.author_email || '').toLowerCase();
}

export function approvalBlocker(a) {
  if (!a.signoffs.verification) return 'Mungon nënshkrimi i verifikimit.';
  if (a.legal_required && !a.signoffs.legal) return 'Mungon nënshkrimi i shqyrtimit ligjor.';
  if (!a.rating) return 'Mungon vlerësimi faktik.';
  const missing = requiredItems(a).filter(c => !a.checklist[c.key]);
  if (missing.length) return `Lista e kontrollit nuk është e plotë (${missing.length} pika).`;
  return null;
}

// Checklist items that must be done for this article (legal item only when legal review is on).
export function requiredItems(a) {
  return CHECKLIST.filter(c => c.required !== false && (c.key !== 'legal_done' || a.legal_required));
}

export function resolveTarget(action, article) {
  const def = ACTIONS[action];
  return typeof def.to === 'function' ? def.to(article) : def.to;
}

// Returns { ok: true, to } or { ok: false, error }.
export function check(action, user, article, input = {}) {
  const def = ACTIONS[action];
  if (!def) return { ok: false, error: 'Veprim i panjohur.' };
  if (!user || !user.active) return { ok: false, error: 'Nuk ke akses.' };
  if (!def.from.includes(article.status)) return { ok: false, error: `Ky veprim nuk lejohet kur statusi është "${STATUSES[article.status].sq}".` };
  if (!def.allowed(user, article)) {
    if (isAuthor(user, article) && action !== 'submit') return { ok: false, error: 'Nuk mund ta shqyrtosh, miratosh ose publikosh artikullin tënd.' };
    return { ok: false, error: 'Roli yt nuk e lejon këtë veprim.' };
  }
  if (def.needsNote && !String(input.note || '').trim()) return { ok: false, error: 'Shkruaj arsyen.' };
  if (def.needsRating && !RATINGS[input.rating]) return { ok: false, error: 'Zgjidh vlerësimin faktik.' };
  if (def.needsDate) {
    const t = Date.parse(input.publish_at || '');
    if (!t || t < Date.now() + 5 * 60e3) return { ok: false, error: 'Zgjidh një datë të paktën 5 minuta në të ardhmen.' };
  }
  const blocked = def.guard && def.guard(article);
  if (blocked) return { ok: false, error: blocked };
  return { ok: true, to: resolveTarget(action, article) };
}

export function availableActions(user, article) {
  return Object.entries(ACTIONS)
    .filter(([, d]) => d.from.includes(article.status) && d.allowed(user, article))
    .map(([key, d]) => ({ key, ...d, blocked: d.guard ? d.guard(article) : null }));
}

export function canTick(user, item, article) {
  if (item.auto) return false;
  if (isAuthor(user, article)) return false;
  return item.roles.includes(user.role);
}

// Ghost tag list after a status change: drop old workflow tags, add the new one, keep everything else.
export function nextTags(currentTags, status, rating) {
  const keep = currentTags.filter(t => !WORKFLOW_TAGS.includes(t.name) && !['#verifikuar', '#pjeserisht'].includes(t.name));
  const add = [];
  const st = STATUSES[status]?.tag;
  if (st && status !== 'published') add.push({ name: st });
  if (rating && RATINGS[rating]?.tag) add.push({ name: RATINGS[rating].tag });
  if (rating === 'opinion' && !keep.some(t => t.slug === 'opinion')) add.push({ name: 'Opinion', slug: 'opinion' });
  return [...keep.map(t => ({ name: t.name })), ...add];
}
