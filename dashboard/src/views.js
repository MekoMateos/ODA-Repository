// Server-rendered HTML. Every interpolated value is escaped by the `html` tag unless wrapped in raw().
import { STATUSES, RATINGS, ROLES, CHECKLIST, availableActions, canTick, requiredItems } from './workflow.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => {
    if (Array.isArray(v)) out += v.map(x => (x instanceof Raw ? x.s : esc(x))).join('');
    else if (v instanceof Raw) out += v.s;
    else if (v === false || v === null || v === undefined) out += '';
    else out += esc(v);
    out += strings[i + 1];
  });
  return raw(out);
}

const fmtDate = (iso, withTime) => {
  if (!iso) return '';
  const d = new Date(iso);
  const opts = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Tirane' };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('sq-AL', opts);
};
const statusBadge = (s) => html`<span class="status st-${s}">${STATUSES[s]?.sq || s}</span>`;
const ratingBadge = (r) => r ? html`<span class="rating rt-${r}">${RATINGS[r]?.sq || r}</span>` : '';
const isOverdue = (a) => a.deadline && !['published', 'scheduled', 'rejected'].includes(a.status) && Date.parse(a.deadline) < Date.now();

export function layout({ user, title, active, body, flash, csrf }) {
  const nav = [
    ...(user.role !== 'contributor' ? [['queue', '/', 'Radha']] : []),
    ['mine', '/te-miat', 'Artikujt e mi'],
    ...(['editor', 'admin'].includes(user.role) ? [['audit', '/regjistri', 'Regjistri']] : []),
    ...(user.role === 'admin' ? [['team', '/ekipi', 'Ekipi']] : []),
  ];
  return html`<!doctype html>
<html lang="sq">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title} · ODA Redaksia</title>
<link rel="stylesheet" href="/redaksia/static/app.css">
</head>
<body data-csrf="${csrf}">
<header class="bar">
  <a class="mark" href="/redaksia/">oda <span>redaksia</span></a>
  <nav aria-label="Redaksia">${nav.map(([k, href, label]) => html`<a href="/redaksia${href}" ${raw(k === active ? 'aria-current="page"' : '')}>${label}</a>`)}</nav>
  <p class="who"><span>${user.name}</span> <span class="role">${ROLES[user.role]}</span></p>
</header>
<main class="page">
${flash ? html`<p class="flash flash-${flash.type}" role="${flash.type === 'error' ? 'alert' : 'status'}">${flash.msg}</p>` : ''}
${body}
</main>
<script src="/redaksia/static/app.js" defer></script>
</body>
</html>`;
}

export function queuePage({ user, articles, counts, filter }) {
  const tabs = [['', 'Të gjitha'], ...Object.entries(STATUSES).filter(([k]) => k !== 'draft').map(([k, v]) => [k, v.sq])];
  const total = Object.entries(counts).filter(([k]) => k !== 'draft').reduce((s, [, n]) => s + n, 0);
  return html`
<div class="head">
  <h1>Radha editoriale</h1>
  <form class="inline" method="get" action="/redaksia/">
    ${filter.status ? html`<input type="hidden" name="status" value="${filter.status}">` : ''}
    <label class="toggle"><input type="checkbox" name="mine" value="1" ${raw(filter.mine ? 'checked' : '')} data-autosubmit> Vetëm të caktuarat për mua</label>
  </form>
</div>
<nav class="tabs" aria-label="Filtro sipas statusit">
  ${tabs.map(([k, label]) => {
    const n = k ? (counts[k] || 0) : total;
    const href = `/redaksia/?${new URLSearchParams({ ...(k ? { status: k } : {}), ...(filter.mine ? { mine: '1' } : {}) })}`;
    return html`<a href="${href}" ${raw((filter.status || '') === k ? 'aria-current="true"' : '')}>${label} <span class="n">${n}</span></a>`;
  })}
</nav>
${articles.length ? html`
<div class="table-wrap"><table class="queue">
  <thead><tr><th scope="col">Artikulli</th><th scope="col">Statusi</th><th scope="col">Redaktor / verifikues</th><th scope="col">Afati</th><th scope="col">Përditësuar</th></tr></thead>
  <tbody>
  ${articles.map(a => html`<tr>
    <td data-l=""><a class="title" href="/redaksia/artikull/${a.ghost_id}">${a.title}</a><span class="sub">${a.author_name}</span></td>
    <td data-l="Statusi">${statusBadge(a.status)} ${ratingBadge(a.rating)}</td>
    <td class="people" data-l="Redaktor / verifikues">${a.editor_name || a.editor_email || '—'}<span class="sub">${a.verifier_name || a.verifier_email || 'pa verifikues'}</span></td>
    <td data-l="Afati" class="${isOverdue(a) ? 'overdue' : ''}">${a.deadline ? fmtDate(a.deadline) : '—'}${isOverdue(a) ? html`<span class="sub">Me vonesë</span>` : ''}</td>
    <td class="muted" data-l="Përditësuar">${fmtDate(a.updated_at, true)}</td>
  </tr>`)}
  </tbody>
</table></div>` : html`<p class="empty">${filter.status ? 'Asnjë artikull me këtë status.' : 'Radha është bosh. Kur një autor dorëzon një draft, ai shfaqet këtu.'}</p>`}`;
}

export function minePage({ user, drafts, articles }) {
  const tracked = new Set(articles.map(a => a.ghost_id));
  const fresh = drafts.filter(d => !tracked.has(d.id));
  return html`
<div class="head"><h1>Artikujt e mi</h1></div>
<section class="block">
  <h2>Drafte në Ghost, ende pa u dorëzuar</h2>
  <p class="hint">Shkruaj në Ghost. Kur drafti është gati dhe ka seksionin "Burimet" në fund, dorëzoje këtu.</p>
  ${fresh.length ? html`<ul class="drafts">${fresh.map(d => html`<li>
    <div><strong>${d.title}</strong><span class="sub">Ndryshuar ${fmtDate(d.updated_at, true)}</span></div>
    <form method="post" action="/redaksia/artikull/${d.id}/veprim">
      <input type="hidden" name="_csrf" value="${raw('{{csrf}}')}"><input type="hidden" name="action" value="submit">
      <button class="btn">Dorëzo për shqyrtim</button>
    </form></li>`)}</ul>` : html`<p class="empty">Nuk ke drafte të padorëzuara.</p>`}
</section>
<section class="block">
  <h2>Në proces dhe të publikuar</h2>
  ${articles.length ? html`<ul class="drafts">${articles.map(a => html`<li>
    <div><a class="title" href="/redaksia/artikull/${a.ghost_id}">${a.title}</a><span class="sub">Përditësuar ${fmtDate(a.updated_at, true)}</span></div>
    <div>${statusBadge(a.status)} ${ratingBadge(a.rating)}</div></li>`)}</ul>` : html`<p class="empty">Ende asnjë artikull i dorëzuar.</p>`}
</section>`;
}

export function articlePage({ user, a, post, notes, history, verifiers, links }) {
  const actions = availableActions(user, a);
  const isEditor = user.role === 'editor';
  const open = !['published', 'rejected'].includes(a.status);
  const req = requiredItems(a);
  const reqDone = req.filter(c => a.checklist[c.key]).length;
  const reqAll = req.length;
  const steps = [
    ['Dorëzuar', !['draft'].includes(a.status)],
    ['Verifikimi', !!a.signoffs.verification],
    ...(a.legal_required ? [['Ligjore', !!a.signoffs.legal]] : []),
    ['Miratimi', !!a.signoffs.approval],
    ['Publikimi', ['published', 'scheduled'].includes(a.status)],
  ];

  return html`
<p class="crumb"><a href="/redaksia/">Radha</a></p>
<div class="head head-article">
  <div>
    <h1>${a.title}</h1>
    <p class="meta">nga ${a.author_name}, ${statusBadge(a.status)} ${ratingBadge(a.rating)}</p>
  </div>
  <p class="links">
    ${links.preview ? html`<a class="btn btn-quiet" href="${links.preview}" target="_blank" rel="noopener">Parapamje</a>` : ''}
    <a class="btn btn-quiet" href="${links.editor}" target="_blank" rel="noopener">Hap në Ghost</a>
  </p>
</div>

<ol class="steps" aria-label="Ecuria">${steps.map(([label, done]) => html`<li class="${done ? 'done' : ''}">${label}</li>`)}</ol>

<div class="cols">
<div class="col-main">
  ${actions.length ? html`<section class="block">
    <h2>Veprimet</h2>
    <div class="actions">
    ${actions.map(act => html`
      <form method="post" action="/redaksia/artikull/${a.ghost_id}/veprim" class="action ${act.key === 'reject' ? 'action-danger' : ''}" ${raw(act.confirm ? `data-confirm="${esc(act.label)}?"` : '')}>
        <input type="hidden" name="_csrf" value="${raw('{{csrf}}')}"><input type="hidden" name="action" value="${act.key}">
        ${act.needsRating ? html`<fieldset class="ratings"><legend>Vlerësimi faktik</legend>${Object.entries(RATINGS).map(([k, r]) => html`<label><input type="radio" name="rating" value="${k}" required> ${r.sq}</label>`)}</fieldset>` : ''}
        ${act.needsDate ? html`<label>Data dhe ora e publikimit <input type="datetime-local" name="publish_at" required></label>` : ''}
        ${act.needsNote ? html`<label>Arsyeja (e sheh autori) <textarea name="note" rows="2" required></textarea></label>` : ''}
        <button class="btn ${act.key === 'reject' ? 'btn-danger' : ''}" ${raw(act.blocked ? 'disabled' : '')}>${act.label}</button>
        ${act.blocked ? html`<p class="blocked">${act.blocked}</p>` : ''}
      </form>`)}
    </div>
  </section>` : ''}

  ${isEditor && open ? html`<section class="block">
    <h2>Caktimi</h2>
    <form method="post" action="/redaksia/artikull/${a.ghost_id}/caktim" class="grid-form">
      <input type="hidden" name="_csrf" value="${raw('{{csrf}}')}">
      <label>Verifikuesi
        <select name="verifier_email"><option value="">Zgjidh</option>
        ${verifiers.map(v => html`<option value="${v.email}" ${raw(v.email === a.verifier_email ? 'selected' : '')}>${v.name}</option>`)}
        </select></label>
      <label>Afati <input type="date" name="deadline" value="${a.deadline ? a.deadline.slice(0, 10) : ''}"></label>
      <label class="check"><input type="checkbox" name="legal_required" value="1" ${raw(a.legal_required ? 'checked' : '')}> Kërkohet shqyrtim ligjor</label>
      <button class="btn btn-quiet">Ruaj caktimin</button>
    </form>
  </section>` : html`<section class="block"><h2>Caktimi</h2>
    <dl class="facts"><dt>Redaktori</dt><dd>${a.editor_name || a.editor_email || '—'}</dd><dt>Verifikuesi</dt><dd>${a.verifier_name || a.verifier_email || '—'}</dd>
    <dt>Afati</dt><dd>${a.deadline ? fmtDate(a.deadline) : '—'}</dd><dt>Shqyrtim ligjor</dt><dd>${a.legal_required ? 'Po' : 'Jo'}</dd>
    ${a.publish_at ? html`<dt>Publikimi</dt><dd>${fmtDate(a.publish_at, true)}</dd>` : ''}</dl></section>`}

  <section class="block">
    <h2>Lista e kontrollit <span class="count">${reqDone} nga ${reqAll}</span></h2>
    <ul class="checklist">
    ${CHECKLIST.filter(item => item.key !== 'legal_done' || a.legal_required).map(item => {
      const done = a.checklist[item.key];
      const can = canTick(user, item, a) && open && a.status !== 'scheduled';
      return html`<li class="${done ? 'done' : ''}">
        <form method="post" action="/redaksia/artikull/${a.ghost_id}/kontroll">
          <input type="hidden" name="_csrf" value="${raw('{{csrf}}')}"><input type="hidden" name="key" value="${item.key}"><input type="hidden" name="on" value="${done ? '0' : '1'}">
          <button class="tick" ${raw(can ? '' : 'disabled')} aria-pressed="${done ? 'true' : 'false'}" aria-label="${item.label}"></button>
        </form>
        <div><span>${item.label}${item.required === false ? html` <em>(opsionale)</em>` : ''}</span>
        ${done ? html`<span class="sub">${done.actor_name || done.actor_email}, ${fmtDate(done.at, true)}</span>` : html`<span class="sub">${item.auto ? 'Plotësohet automatikisht nga nënshkrimi' : item.roles.map(r => ROLES[r]).join(' ose ')}</span>`}</div>
      </li>`;
    })}
    </ul>
  </section>
</div>

<div class="col-side">
  <section class="block">
    <h2>Shënime me autorin</h2>
    ${notes.length ? html`<ol class="notes">${notes.map(n => html`<li><p class="note-head"><strong>${n.actor_name || n.actor_email}</strong> <span class="sub">${fmtDate(n.at, true)}</span></p><p>${n.body}</p></li>`)}</ol>` : html`<p class="empty">Ende asnjë shënim.</p>`}
    <form method="post" action="/redaksia/artikull/${a.ghost_id}/shenim" class="note-form">
      <input type="hidden" name="_csrf" value="${raw('{{csrf}}')}">
      <label class="sr-only" for="note">Shënim i ri</label>
      <textarea id="note" name="body" rows="3" required maxlength="5000" placeholder="Pyetje, kërkesë për burim, sqarim..."></textarea>
      <button class="btn btn-quiet">Shto shënimin</button>
    </form>
  </section>
  <section class="block">
    <h2>Historiku</h2>
    <ol class="history">${history.map(h => html`<li><span class="sub">${fmtDate(h.at, true)}</span> <strong>${h.actor_name || h.actor_email}</strong> ${describe(h)}</li>`)}</ol>
  </section>
</div>
</div>`;
}

function describe(h) {
  const st = (s) => STATUSES[s]?.sq || s;
  const map = {
    import: 'e solli nga Ghost', assign: 'ndryshoi caktimin', note: 'shtoi shënim',
    user_add: 'shtoi anëtar në ekip', user_update: 'ndryshoi rolin e një anëtari',
  };
  if (map[h.action]) return map[h.action];
  if (h.action === 'check' || h.action === 'uncheck') {
    let key = ''; try { key = JSON.parse(h.detail || '{}').item; } catch {}
    const label = CHECKLIST.find(c => c.key === key)?.label || 'një pikë';
    return h.action === 'check' ? html`konfirmoi: ${label}` : html`hoqi konfirmimin: ${label}`;
  }
  if (h.from_status && h.to_status && h.from_status !== h.to_status) return html`kaloi ${st(h.from_status)} → ${st(h.to_status)}`;
  if (h.action === 'pass_verification') return 'nënshkroi verifikimin';
  if (h.action === 'pass_legal') return 'nënshkroi shqyrtimin ligjor';
  return h.action;
}

export function teamPage({ users }) {
  return html`
<div class="head"><h1>Ekipi dhe rolet</h1></div>
<p class="hint">Hyrja në Redaksi kalon nga Cloudflare Access. Këtu vendos rolin e secilit. Administratori teknik nuk ka të drejta editoriale.</p>
<section class="block">
  <h2>Shto ose ndrysho anëtar</h2>
  <form method="post" action="/redaksia/ekipi" class="grid-form">
    <input type="hidden" name="_csrf" value="${raw('{{csrf}}')}">
    <label>Email <input type="email" name="email" required autocomplete="off"></label>
    <label>Emri <input name="name" required></label>
    <label>Roli <select name="role">${Object.entries(ROLES).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
    <label>Statusi <select name="active"><option value="1">Aktiv</option><option value="0">Pezulluar</option></select></label>
    <button class="btn">Ruaj</button>
  </form>
</section>
<div class="table-wrap"><table class="queue">
  <thead><tr><th scope="col">Emri</th><th scope="col">Email</th><th scope="col">Roli</th><th scope="col">Statusi</th></tr></thead>
  <tbody>${users.map(u => html`<tr class="${u.active ? '' : 'inactive'}"><td>${u.name}</td><td>${u.email}</td><td>${ROLES[u.role]}</td><td>${u.active ? 'Aktiv' : 'Pezulluar'}</td></tr>`)}</tbody>
</table></div>`;
}

export function auditPage({ rows }) {
  return html`
<div class="head"><h1>Regjistri i veprimeve</h1></div>
<p class="hint">Çdo veprim regjistrohet këtu dhe nuk mund të ndryshohet ose fshihet.</p>
<div class="table-wrap"><table class="queue">
  <thead><tr><th scope="col">Koha</th><th scope="col">Kush</th><th scope="col">Veprimi</th><th scope="col">Artikulli</th></tr></thead>
  <tbody>${rows.map(r => html`<tr><td class="muted">${fmtDate(r.at, true)}</td><td>${r.actor_name || r.actor_email}</td><td>${describe(r)}</td>
    <td>${r.ghost_id ? html`<a href="/redaksia/artikull/${r.ghost_id}">Hap</a>` : html`<span class="sub">${r.detail || ''}</span>`}</td></tr>`)}</tbody>
</table></div>`;
}
