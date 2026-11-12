// ODA theme script, v0.7. No libraries, no tracking.
// Every block below stands on its own: if one fails, the rest of the page still works,
// and nothing on the page depends on this file to be readable.
var odaRoot = document.documentElement;
var odaSq = odaRoot.lang.indexOf('sq') === 0;
var odaReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var odaFine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
var odaPhone = window.matchMedia('(max-width: 767px), (max-width: 900px) and (pointer: coarse)');

// Styles may hide things for an entrance only under "oda-on", so it is set here, by the script that reveals them.
// "oda-in" starts the first-screen entrance; the timer is a safety net in case nothing else sets it.
if (!odaReduce) {
    odaRoot.classList.add('oda-on');
    setTimeout(function () { odaRoot.classList.add('oda-in'); }, 2600);
}

// ---------- One animation loop for everything that follows the scroll or the pointer ----------
// Jobs run at most once a frame; a job returns true while it still has easing to finish.
var odaFrame = (function () {
    var jobs = [], queued = false;
    function run() {
        queued = false;
        var y = window.scrollY, h = window.innerHeight, more = false;
        for (var i = 0; i < jobs.length; i++) { try { if (jobs[i](y, h)) more = true; } catch (e) {} }
        if (more) ask();
    }
    function ask() { if (!queued) { queued = true; requestAnimationFrame(run); } }
    window.addEventListener('scroll', ask, { passive: true });
    window.addEventListener('resize', ask, { passive: true });
    return { add: function (fn) { jobs.push(fn); ask(); }, ask: ask };
})();

// A tiny notice board: the pop-ups tell each other when one opens or closes, so they never stack.
var odaBus = (function () {
    var fns = [];
    return { on: function (fn) { fns.push(fn); }, emit: function () { fns.forEach(function (fn) { try { fn(); } catch (e) {} }); } };
})();

// The header's real height (the live bar can add to it) for everything that sticks below it.
(function () {
    var head = document.querySelector('[data-head]');
    if (!head) return;
    function set() { odaRoot.style.setProperty('--head-now', head.offsetHeight + 'px'); }
    set();
    if ('ResizeObserver' in window) new ResizeObserver(set).observe(head);
    else window.addEventListener('resize', set, { passive: true });
})();

// ---------- The "Burimet" / "Sources" section of an article becomes the evidence box ----------
// Writers just add a heading called "Burimet" (or "Sources") at the end of the article,
// followed by a numbered or bulleted list of sources. No plugins, no tracking.
(function () {
    var body = document.querySelector('.article-body');
    if (!body) return;

    var heading = Array.prototype.find.call(body.querySelectorAll('h2, h3'), function (h) {
        var t = h.textContent.trim().toLowerCase();
        return t === 'burimet' || t === 'sources' || t === 'dosja e burimeve';
    });
    if (!heading) return;

    var box = document.createElement('aside');
    box.className = 'evidence';
    box.setAttribute('aria-label', heading.textContent.trim());

    var node = heading.nextElementSibling;
    var items = [];
    while (node && !/^H[23]$/.test(node.tagName)) {
        items.push(node);
        node = node.nextElementSibling;
    }

    heading.parentNode.insertBefore(box, heading);
    box.appendChild(heading);
    items.forEach(function (el) { box.appendChild(el); });

    var count = box.querySelectorAll('li').length;
    if (count) {
        var tally = document.createElement('p');
        tally.className = 'evidence-count';
        tally.textContent = count + (odaSq
            ? (count === 1 ? ' burim i lidhur' : ' burime të lidhura')
            : (count === 1 ? ' linked source' : ' linked sources'));
        heading.after(tally);
    }

    // Open source links in a new tab and never pass referrer data to them.
    box.querySelectorAll('a[href^="http"]').forEach(function (a) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
    });
})();

// ---------- Share: the phone's share sheet where there is one, otherwise the link is copied ----------
// One listener for every share button: the one on an article and the one on each post in the feed.
document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-share]') : null;
    if (!btn) return;
    var url = btn.getAttribute('data-url') || location.href, title = btn.getAttribute('data-title') || document.title;
    if (navigator.share) { navigator.share({ title: title, url: url }).catch(function () {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () {
        var label = btn.querySelector('span') || btn, old = label.textContent;
        label.textContent = odaSq ? 'Lidhja u kopjua' : 'Link copied';
        setTimeout(function () { label.textContent = old; }, 1800);
    }, function () {});
});

// ---------- Small storage helper (storage can be blocked; the page must still work) ----------
var odaStore = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { window.localStorage.removeItem(k); } catch (e) {} }
};
var DAY = 86400000;

// ---------- Newsletter pop-up ----------
// Shows after the reader has read half the page or spent 40 seconds, at most once every 14 days,
// never on the thank-you page, never if they already subscribed from this browser,
// and never while the cookie pop-up, the loader or the menu is on screen, or while someone is writing in the composer.
(function () {
    var pop = document.getElementById('nl-pop');
    if (!pop || typeof pop.showModal !== 'function') return;
    if (document.body.classList.contains('page-faleminderit')) return;
    var last = Number(odaStore.get('oda-nl-seen') || 0);
    if (odaStore.get('oda-subscribed') || Date.now() - last < 14 * DAY) return;

    var shown = false, waiting = false;
    function blocked() { var c = odaRoot.classList; return c.contains('cookie-open') || c.contains('loading') || c.contains('menu-open') || c.contains('write-open'); }
    function open() {
        if (shown) return;
        if (blocked()) { waiting = true; return; }   // one pop-up at a time
        shown = true;
        odaStore.set('oda-nl-seen', String(Date.now()));
        odaRoot.classList.add('nl-open');
        if (odaPhone.matches) pop.show(); else pop.showModal();   // phones: a sheet above the tab bar that does not block the page
        odaBus.emit();
    }
    odaBus.on(function () { if (waiting && !shown && !blocked()) { waiting = false; setTimeout(open, 12000); } });
    function close() { pop.close(); }
    pop.addEventListener('close', function () { odaRoot.classList.remove('nl-open'); odaBus.emit(); });
    pop.querySelectorAll('[data-nl-close]').forEach(function (b) { b.addEventListener('click', close); });
    pop.addEventListener('click', function (e) { if (e.target === pop) close(); });

    var timer = setTimeout(open, 40000), armed = true;
    odaFrame.add(function (y, h) {
        if (armed && (y + h) / odaRoot.scrollHeight > 0.5) { armed = false; clearTimeout(timer); open(); }
        return false;
    });
})();

// ---------- Sticky subscribe bar (phones, above the tab bar) ----------
(function () {
    var bar = document.getElementById('sticky-cta');
    if (!bar || odaStore.get('oda-cta-closed') || odaStore.get('oda-subscribed')) return;
    var join = document.querySelector('.join');
    var joinVisible = false, closed = false;
    function update(y) {
        if (closed) return false;
        var c = odaRoot.classList;
        var hide = (typeof y === 'number' ? y : window.scrollY) < 600 || joinVisible || c.contains('nl-open') || c.contains('cookie-open') || c.contains('menu-open') || c.contains('loading') || c.contains('write-open');
        if (bar.hidden !== hide) { bar.hidden = hide; c.toggle('cta-on', !hide); }
        return false;
    }
    if (join && 'IntersectionObserver' in window) {
        new IntersectionObserver(function (es) { joinVisible = es[0].isIntersecting; update(); }).observe(join);
    }
    odaFrame.add(update);
    odaBus.on(update);
    bar.querySelector('[data-cta-close]').addEventListener('click', function () {
        closed = true; odaStore.set('oda-cta-closed', '1'); bar.hidden = true; odaRoot.classList.remove('cta-on');
    });
})();

// ---------- Cookie pop-up (information only: necessary cookies, no tracking) ----------
// In the middle of the screen on the first visit, once the loader has gone. There is nothing to accept or refuse:
// closing it by any route (the button, Esc, a click outside) is remembered in this browser.
(function () {
    var pop = document.getElementById('cookie-pop');
    if (!pop || typeof pop.showModal !== 'function' || odaStore.get('oda-cookie-ok')) return;
    var shown = false;
    function open() {
        var c = odaRoot.classList;
        if (shown || c.contains('loading') || c.contains('menu-open')) return;
        shown = true;
        c.add('cookie-open');
        pop.showModal();
        odaBus.emit();
    }
    pop.addEventListener('close', function () { odaStore.set('oda-cookie-ok', '1'); odaRoot.classList.remove('cookie-open'); odaBus.emit(); });
    pop.addEventListener('click', function (e) {
        var r = pop.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) pop.close();
    });
    odaBus.on(function () { if (!shown) setTimeout(open, 350); });
    setTimeout(open, 3200);
})();

// ---------- After a successful signup: remember it and go to the thank-you page ----------
(function () {
    var forms = document.querySelectorAll('form[data-members-form="signup"]');
    if (!forms.length || !('MutationObserver' in window)) return;
    forms.forEach(function (f) {
        new MutationObserver(function () {
            if (f.classList.contains('success')) {
                odaStore.set('oda-subscribed', '1');
                setTimeout(function () { window.location.href = '/faleminderit/'; }, 1200);
            }
        }).observe(f, { attributes: true, attributeFilter: ['class'] });
    });
})();

// ---------- FAQ: H3 questions become an accordion + FAQPage structured data ----------
(function () {
    var body = document.querySelector('[data-faq]');
    if (!body) return;
    var items = [];
    body.querySelectorAll('h3').forEach(function (h) {
        var d = document.createElement('details');
        d.className = 'faq-item';
        var s = document.createElement('summary');
        s.textContent = h.textContent;
        d.appendChild(s);
        var wrap = document.createElement('div');
        wrap.className = 'faq-answer';
        var n = h.nextElementSibling;
        while (n && !/^H[23]$/.test(n.tagName)) { var next = n.nextElementSibling; wrap.appendChild(n); n = next; }
        d.appendChild(wrap);
        h.replaceWith(d);
        items.push({ '@type': 'Question', name: s.textContent.trim(), acceptedAnswer: { '@type': 'Answer', text: wrap.textContent.trim().replace(/\s+/g, ' ') } });
    });
    if (!items.length) return;
    var ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items });
    document.head.appendChild(ld);
    if (location.hash) { var t = document.getElementById(location.hash.slice(1)); if (t && t.closest('details')) t.closest('details').open = true; }
})();

// =====================================================================
// v0.5: live coverage, research, art labels, reader polls, student resources
// =====================================================================
// ---------- Reader API (Redaksia) and the Ghost member session ----------
var odaApi = (function () {
    var base = (document.body.getAttribute('data-api') || '/api').replace(/\/$/, '');
    function call(method, path, body, token) {
        var headers = {};
        if (body) headers['Content-Type'] = 'application/json';
        if (token) headers.Authorization = 'Bearer ' + token;
        return fetch(base + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, credentials: 'omit' })
            .then(function (r) {
                return r.json().catch(function () { return {}; }).then(function (j) {
                    if (!r.ok) { var e = new Error(j.error || (odaSq ? 'Diçka nuk shkoi. Provo sërish.' : 'Something went wrong. Try again.')); e.status = r.status; throw e; }
                    return j;
                });
            });
    }
    // A short-lived identity token from Ghost proves which reader is signed in. Null when signed out.
    function token() {
        return fetch('/members/api/session', { credentials: 'same-origin' })
            .then(function (r) { return r.status === 200 ? r.text() : null; })
            .then(function (t) { return t && t.split('.').length === 3 ? t : null; })
            .catch(function () { return null; });
    }
    return { get: function (p, t) { return call('GET', p, null, t); }, post: function (p, b, t) { return call('POST', p, b, t); }, token: token };
})();

function odaEl(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
}
var odaMonths = odaSq ? ['janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor', 'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor']
    : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function odaDate(iso, withTime) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var s = d.getDate() + ' ' + odaMonths[d.getMonth()] + ' ' + d.getFullYear();
    if (withTime) s += ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return s;
}

// ---------- Breaking bar: hide for this story if the reader closed it ----------
(function () {
    var bar = document.querySelector('[data-live-bar]');
    if (!bar) return;
    bar.querySelector('[data-live-x]').addEventListener('click', function () {
        odaStore.set('oda-live-x', bar.getAttribute('data-live-bar'));
        bar.hidden = true;
    });
})();

// ---------- Live coverage: "14:32 · Konfirmuar · Title" headings become a timeline ----------
// Newest update goes at the top. Status words: Konfirmuar, Në verifikim, Korrigjim.
(function () {
    var art = document.querySelector('.article[data-timeline]');
    var body = art && art.querySelector('.article-body');
    if (!body) return;
    var TIME = /^\s*(\d{1,2})[:.](\d{2})(?!\d)\s*[·•|:,\-–—]?\s*/;
    var STATUS = [
        [/^(konfirmuar|e konfirmuar|confirmed)\b/i, 'ok', odaSq ? 'Konfirmuar' : 'Confirmed'],
        [/^(në verifikim|ne verifikim|pa u verifikuar|being checked|unverified)\b/i, 'part', odaSq ? 'Në verifikim' : 'Being checked'],
        [/^(korrigjim|korrigjuar|correction)\b/i, 'fix', odaSq ? 'Korrigjim' : 'Correction']
    ];
    var heads = Array.prototype.filter.call(body.querySelectorAll('h3'), function (h) { return TIME.test(h.textContent); });
    if (!heads.length) return;

    var feed = odaEl('ol', 'live-feed');
    heads[0].parentNode.insertBefore(feed, heads[0]);
    var seen = {};
    heads.forEach(function (h) {
        var text = h.textContent, m = text.match(TIME);
        var time = m[1].padStart(2, '0') + ':' + m[2];
        var rest = text.slice(m[0].length), status = null;
        STATUS.some(function (s) {
            var sm = rest.match(s[0]);
            if (!sm) return false;
            status = s; rest = rest.slice(sm[0].length).replace(/^\s*[·•|:,\-–—]?\s*/, ''); return true;
        });
        var id = 'u' + time.replace(':', ''); seen[id] = (seen[id] || 0) + 1; if (seen[id] > 1) id += '-' + seen[id];
        var li = odaEl('li', 'live-item'); li.id = id;
        var t = odaEl('time', 'live-time'); var a = odaEl('a', null, time); a.href = '#' + id; t.appendChild(a); li.appendChild(t);
        var entry = odaEl('div', 'live-entry');
        if (status) entry.appendChild(odaEl('span', 'live-status st-' + status[1], status[2]));
        var nh = odaEl('h3', null, rest || time); entry.appendChild(nh);
        var n = h.nextElementSibling;
        while (n && !(n.tagName === 'H3' && TIME.test(n.textContent)) && !/^(H2|HR)$/.test(n.tagName) && !n.classList.contains('evidence')) { var next = n.nextElementSibling; entry.appendChild(n); n = next; }
        li.appendChild(entry); feed.appendChild(li); h.remove();
    });

    if (!art.hasAttribute('data-live')) {
        var ended = odaEl('p', 'live-ended', odaSq ? 'Mbulimi live ka përfunduar. Përditësimet më poshtë janë arkivi i ditës.' : 'Live coverage has ended. The updates below are the archive of the day.');
        feed.parentNode.insertBefore(ended, feed);
        return;
    }
    // While live: check quietly for new updates and offer a reload (no auto-jumping while someone reads).
    var count = heads.length, first = heads[0].textContent.trim();
    var notice = odaEl('button', 'live-new', odaSq ? 'Ka përditësime të reja · Rifresko' : 'New updates · Refresh');
    notice.type = 'button'; notice.hidden = true;
    notice.addEventListener('click', function () { location.reload(); });
    document.body.appendChild(notice);
    function check() {
        if (document.visibilityState !== 'visible' || !notice.hidden) return;
        fetch(location.pathname, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (html) {
            if (!html) return;
            var doc = new DOMParser().parseFromString(html, 'text/html');
            var hs = Array.prototype.filter.call(doc.querySelectorAll('.article-body h3'), function (h) { return TIME.test(h.textContent); });
            if (hs.length && (hs.length !== count || hs[0].textContent.trim() !== first)) notice.hidden = false;
            if (!doc.querySelector('.article[data-live]')) notice.hidden = false;
        }).catch(function () {});
    }
    setInterval(check, 75000 + Math.floor(Math.random() * 20000));
})();

// ---------- Research: findings, method and data boxes, and the citation ----------
(function () {
    var art = document.querySelector('.article.tag-kerkim');
    if (!art) return;
    var body = art.querySelector('.article-body');
    var KINDS = { 'gjetjet kryesore': 'findings', 'key findings': 'findings', 'metodologjia': 'method', 'methodology': 'method',
        'të dhënat': 'data', 'te dhenat': 'data', 'data': 'data', 'kufizimet': 'limits', 'limitations': 'limits' };
    if (body) Array.prototype.slice.call(body.querySelectorAll('h2')).forEach(function (h) {
        var kind = KINDS[h.textContent.trim().toLowerCase()];
        if (!kind || h.closest('.rbox, .evidence')) return;
        var box = odaEl('section', 'rbox rbox-' + kind);
        h.parentNode.insertBefore(box, h);
        var n = h.nextElementSibling; box.appendChild(h);
        while (n && !/^(H2|HR)$/.test(n.tagName) && !n.classList.contains('evidence')) { var next = n.nextElementSibling; box.appendChild(n); n = next; }
    });

    var cite = document.querySelector('[data-cite]');
    if (!cite) return;
    var names = (cite.getAttribute('data-authors') || '').split('|').filter(Boolean).map(function (full) {
        var parts = full.trim().split(/\s+/);
        if (parts.length < 2) return full.trim();
        var last = parts.pop();
        return last + ', ' + parts.map(function (p) { return p.charAt(0).toUpperCase() + '.'; }).join(' ');
    });
    var who = names.length > 1 ? names.slice(0, -1).join(', ') + ', & ' + names[names.length - 1] : (names[0] || 'ODA');
    var d = new Date(cite.getAttribute('data-date') + 'T12:00:00');
    var when = d.getFullYear() + ', ' + d.getDate() + ' ' + odaMonths[d.getMonth()];
    var out = cite.querySelector('[data-cite-text]');
    out.textContent = '';
    out.appendChild(document.createTextNode(who + ' (' + when + '). '));
    out.appendChild(odaEl('i', null, cite.getAttribute('data-title')));
    out.appendChild(document.createTextNode('. ODA. ' + cite.getAttribute('data-url')));
    var btn = cite.querySelector('[data-cite-copy]');
    btn.addEventListener('click', function () {
        var text = out.textContent, old = btn.textContent;
        var done = function () { btn.textContent = odaSq ? 'U kopjua' : 'Copied'; setTimeout(function () { btn.textContent = old; }, 1800); };
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { selectText(out); });
        else selectText(out);
    });
    function selectText(el) { var r = document.createRange(); r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r); }
})();

// ---------- Art: a "Për veprën" list becomes a museum wall label next to the work ----------
(function () {
    var art = document.querySelector('.article.tag-arti');
    var body = art && art.querySelector('.article-body');
    if (!body) return;
    var NAMES = ['për veprën', 'per vepren', 'rreth veprës', 'rreth vepres', 'about the work'];
    var h = Array.prototype.find.call(body.querySelectorAll('h2, h3'), function (x) { return NAMES.indexOf(x.textContent.trim().toLowerCase()) > -1; });
    var list = h && h.nextElementSibling;
    if (!list || !/^(UL|OL)$/.test(list.tagName)) return;
    var wall = odaEl('aside', 'wall'); var inner = odaEl('div', 'wall-inner');
    inner.appendChild(odaEl('p', 'wall-kicker', h.textContent.trim()));
    var dl = odaEl('dl');
    list.querySelectorAll('li').forEach(function (li) {
        var t = li.textContent, i = t.indexOf(':');
        if (i < 1) { dl.appendChild(odaEl('dt', null, '')); dl.appendChild(odaEl('dd', null, t.trim())); return; }
        dl.appendChild(odaEl('dt', null, t.slice(0, i).trim())); dl.appendChild(odaEl('dd', null, t.slice(i + 1).trim()));
    });
    inner.appendChild(dl); wall.appendChild(inner);
    var anchor = art.querySelector('.article-head');
    anchor.parentNode.insertBefore(wall, anchor.nextSibling);
    h.remove(); list.remove();
})();

// ---------- Reader polls: the polls page and the home page band ----------
(function () {
    var page = document.querySelector('[data-polls]');
    var band = document.querySelector('[data-poll-home]');
    if (!page && !band) return;
    var T = odaSq ? {
        open: 'I hapur', closed: 'I mbyllur', votes: function (n) { return n === 1 ? '1 votë' : n.toLocaleString('sq-AL') + ' vota'; },
        closes: 'Mbyllet më', closedOn: 'U mbyll më', you: 'Vota jote', signin: 'Hyr për të votuar', join: 'regjistrohu falas',
        signinNote: 'Votojnë vetëm lexuesit e regjistruar, një herë për sondazh.', after: 'Rezultatet shfaqen pasi voton.',
        label: 'Sondazh i hapur për lexuesit, jo përfaqësues.', thanks: 'Faleminderit! Vota jote u ruajt.', none: 'Nuk ka sondazhe ende. Kur redaksia hap një, do ta gjesh këtu.',
        error: 'Sondazhet nuk u ngarkuan. Rifresko faqen pas pak.', share: 'Kopjo lidhjen', copied: 'U kopjua'
    } : {
        open: 'Open', closed: 'Closed', votes: function (n) { return n === 1 ? '1 vote' : n.toLocaleString('en') + ' votes'; },
        closes: 'Closes', closedOn: 'Closed on', you: 'Your vote', signin: 'Sign in to vote', join: 'join for free',
        signinNote: 'Only signed-in readers vote, once per poll.', after: 'Results appear after you vote.',
        label: 'Open reader poll, not representative.', thanks: 'Thank you! Your vote was saved.', none: 'No polls yet. When the editors open one, it will be here.',
        error: 'Polls did not load. Refresh the page in a moment.', share: 'Copy link', copied: 'Copied'
    };
    var signedIn = false;

    odaApi.token().then(function (tok) {
        signedIn = !!tok;
        return tok ? odaApi.get('/sondazhe/une', tok).catch(function () { return odaApi.get('/sondazhe.json'); }) : odaApi.get('/sondazhe.json');
    }).then(function (data) {
        var polls = data.polls || [];
        if (page) {
            page.textContent = '';
            if (!polls.length) page.appendChild(odaEl('p', 'polls-empty', T.none));
            polls.forEach(function (p) { page.appendChild(card(p, false)); });
            if (location.hash.length > 1) { var t = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (t) t.scrollIntoView(); }
        }
        if (band) {
            var open = polls.filter(function (p) { return p.status === 'open'; })[0];
            if (open) { band.querySelector('[data-poll-slot]').appendChild(card(open, true)); band.hidden = false; }
        }
    }).catch(function () { if (page) { page.textContent = ''; page.appendChild(odaEl('p', 'polls-empty', T.error)); } });

    function card(p, compact) {
        var el = odaEl('article', 'poll' + (p.status === 'closed' ? ' poll-closed' : ''));
        if (!compact) el.id = p.slug;
        var meta = odaEl('p', 'poll-meta');
        meta.appendChild(odaEl('span', 'poll-state', p.status === 'open' ? T.open : T.closed));
        meta.appendChild(odaEl('span', 'poll-total', T.votes(p.total || 0)));
        if (p.status === 'open' && p.closes_at) meta.appendChild(odaEl('span', null, T.closes + ' ' + odaDate(p.closes_at, true)));
        if (p.status === 'closed' && (p.closed_at || p.closes_at)) meta.appendChild(odaEl('span', null, T.closedOn + ' ' + odaDate(p.closed_at || p.closes_at)));
        el.appendChild(meta);
        var q = odaEl(compact ? 'h3' : 'h2', 'poll-q', p.question); q.id = 'q-' + p.slug + (compact ? '-h' : ''); el.appendChild(q);
        if (p.description) el.appendChild(odaEl('p', 'poll-desc', p.description));
        var area = odaEl('div', 'poll-area'); el.appendChild(area);
        var msg = odaEl('p', 'poll-msg'); msg.setAttribute('role', 'status'); el.appendChild(msg);
        if (p.results) area.appendChild(results(p)); else area.appendChild(options(p, el, msg, q.id, compact));
        var foot = odaEl('p', 'poll-foot');
        foot.appendChild(odaEl('span', null, T.label));
        if (p.status === 'open' && !p.results) {
            if (!signedIn) {
                var a = odaEl('a', null, T.signin); a.href = '#/portal/signin'; foot.appendChild(a);
                var j = odaEl('a', null, T.join); j.href = '#/portal/signup'; foot.appendChild(j);
            } else foot.appendChild(odaEl('span', null, T.after));
        }
        if (!compact) {
            var share = odaEl('button', null, T.share); share.type = 'button';
            share.addEventListener('click', function () {
                var url = location.origin + location.pathname + '#' + p.slug;
                if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { share.textContent = T.copied; setTimeout(function () { share.textContent = T.share; }, 1600); }, function () {});
            });
            foot.appendChild(share);
        }
        el.appendChild(foot);
        return el;
    }

    function options(p, el, msg, qid, compact) {
        var wrap = odaEl('div', 'poll-options'); wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-labelledby', qid);
        p.options.forEach(function (o) {
            var b = odaEl('button', 'poll-opt', o.label); b.type = 'button';
            b.addEventListener('click', function () { vote(p, o.id, el, msg, wrap, compact); });
            wrap.appendChild(b);
        });
        return wrap;
    }

    function vote(p, optionId, el, msg, wrap, compact) {
        var buttons = wrap.querySelectorAll('button');
        buttons.forEach(function (b) { b.disabled = true; });
        msg.textContent = '';
        odaApi.token().then(function (tok) {
            if (!tok) { buttons.forEach(function (b) { b.disabled = false; }); location.hash = '#/portal/signin'; return; }
            return odaApi.post('/sondazhe/' + encodeURIComponent(p.slug) + '/vote', { option: optionId }, tok).then(function (res) {
                p.voted = res.voted; p.results = res.results; p.total = res.results.total;
                var fresh = card(p, compact); el.replaceWith(fresh);
                var m = fresh.querySelector('.poll-msg'); m.textContent = T.thanks;
            });
        }).catch(function (e) {
            buttons.forEach(function (b) { b.disabled = false; });
            msg.textContent = e.message;
            if (e.status === 409) setTimeout(function () { location.reload(); }, 2500);
        });
    }

    function results(p) {
        var list = odaEl('ol', 'poll-results');
        var opts = p.results.options, top = Math.max.apply(null, opts.map(function (o) { return o.votes; }));
        opts.forEach(function (o) {
            var li = odaEl('li', 'pr-row' + (o.votes === top && top > 0 ? ' pr-top' : ''));
            var label = odaEl('span', 'pr-label', o.label);
            if (p.voted === o.id) label.appendChild(odaEl('span', 'pr-you', T.you));
            li.appendChild(label);
            li.appendChild(odaEl('span', 'pr-pct', String(o.pct).replace('.', odaSq ? ',' : '.') + '%'));
            var bar = odaEl('span', 'pr-bar'); var fill = odaEl('i'); bar.appendChild(fill); li.appendChild(bar);
            li.appendChild(odaEl('span', 'pr-n', T.votes(o.votes)));
            list.appendChild(li);
            requestAnimationFrame(function () { requestAnimationFrame(function () { fill.style.transform = 'scaleX(' + (o.pct / 100) + ')'; }); });
        });
        return list;
    }
})();

// ---------- Student resources: the list, filters and the suggestion form ----------
(function () {
    var app = document.querySelector('[data-resources]');
    var form = document.querySelector('[data-res-form]');
    if (!app && !form) return;
    var CATS = { kurse: 'Kurse falas', libra: 'Libra dhe tekste', bursa: 'Bursa dhe mundësi', mjete: 'Mjete dhe programe',
        'te-dhena': 'Të dhëna dhe statistika', akademike: 'Kërkim akademik', gjuhe: 'Gjuhë të huaja', karriere: 'Praktika dhe karrierë' };
    var LANG = { sq: 'SQ', en: 'EN', tjeter: '•' };
    var T = odaSq ? {
        all: 'Të gjitha', featured: 'Zgjedhjet e redaksisë', count: function (n) { return n === 1 ? '1 burim' : n + ' burime'; },
        none: 'Asnjë burim nuk përputhet me kërkimin.', clear: 'Pastro filtrat', by: 'Sugjeruar nga', error: 'Lista nuk u ngarkua. Rifresko faqen pas pak.',
        sending: 'Duke dërguar...', bad: 'Plotëso emrin, lidhjen (me https://) dhe kategorinë.', newtab: '(hapet në skedë të re)'
    } : {
        all: 'All', featured: 'Editors’ picks', count: function (n) { return n === 1 ? '1 resource' : n + ' resources'; },
        none: 'No resource matches your search.', clear: 'Clear filters', by: 'Suggested by', error: 'The list did not load. Refresh the page in a moment.',
        sending: 'Sending...', bad: 'Fill in the name, the link (with https://) and the category.', newtab: '(opens in a new tab)'
    };
    var items = [], state = { cat: '', q: '', lang: '' };

    function fillSelect(cats) {
        var sel = form && form.querySelector('[data-res-catselect]');
        if (!sel || sel.options.length > 1) return;
        Object.keys(cats).forEach(function (k) { var o = odaEl('option', null, cats[k]); o.value = k; sel.appendChild(o); });
    }

    if (app) {
        var listEl = app.querySelector('[data-res-list]'), countEl = app.querySelector('[data-res-count]'), chipsEl = app.querySelector('[data-res-cats]');
        var qEl = app.querySelector('[data-res-q]'), langEl = app.querySelector('[data-res-lang]');
        odaApi.get('/burime.json').then(function (d) {
            CATS = d.categories || CATS; items = d.resources || [];
            fillSelect(CATS); chips(); render();
        }).catch(function () { fillSelect(CATS); listEl.textContent = ''; listEl.appendChild(odaEl('p', 'res-empty', T.error)); });
        var timer;
        qEl.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { state.q = qEl.value.trim().toLowerCase(); render(); }, 120); });
        langEl.addEventListener('change', function () { state.lang = langEl.value; render(); });
    } else fillSelect(CATS);

    function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
    function matches(r) {
        if (state.cat && r.category !== state.cat) return false;
        if (state.lang && r.language !== state.lang) return false;
        if (state.q) { var hay = (r.title + ' ' + (r.description || '') + ' ' + host(r.url) + ' ' + (CATS[r.category] || '')).toLowerCase(); if (hay.indexOf(state.q) === -1) return false; }
        return true;
    }
    function chips() {
        chipsEl.textContent = '';
        var counts = {}; items.forEach(function (r) { counts[r.category] = (counts[r.category] || 0) + 1; });
        [['', T.all, items.length]].concat(Object.keys(CATS).filter(function (k) { return counts[k]; }).map(function (k) { return [k, CATS[k], counts[k]]; }))
            .forEach(function (c) {
                var b = odaEl('button', 'res-chip', c[1]); b.type = 'button'; b.setAttribute('aria-pressed', String(state.cat === c[0]));
                b.appendChild(odaEl('span', 'n', String(c[2])));
                b.addEventListener('click', function () { state.cat = c[0]; chipsEl.querySelectorAll('.res-chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); render(); });
                chipsEl.appendChild(b);
            });
    }
    function item(r) {
        var li = odaEl('li', 'res-item');
        li.appendChild(odaEl('span', 'res-host', host(r.url)));
        var h = odaEl('h3', 'res-title'); var a = odaEl('a', null, r.title); a.href = r.url; a.target = '_blank'; a.rel = 'noopener nofollow ugc';
        a.setAttribute('aria-label', r.title + ' ' + T.newtab);
        h.appendChild(a);
        h.insertAdjacentHTML('beforeend', '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2h6v6M10 2 3 9" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>');
        li.appendChild(h);
        if (r.description) li.appendChild(odaEl('p', 'res-desc', r.description));
        var meta = odaEl('p', 'res-meta');
        meta.appendChild(odaEl('span', 'res-lang-tag', LANG[r.language] || '•'));
        if (r.suggested_by) meta.appendChild(odaEl('span', null, T.by + ' ' + r.suggested_by));
        li.appendChild(meta);
        return li;
    }
    function group(title, list, cls) {
        var sec = odaEl('section', 'res-group' + (cls ? ' ' + cls : ''));
        var head = odaEl('div', 'res-group-head'); head.appendChild(odaEl('h2', null, title)); head.appendChild(odaEl('span', null, String(list.length)));
        sec.appendChild(head);
        var ul = odaEl('ul', 'res-grid'); list.forEach(function (r) { ul.appendChild(item(r)); }); sec.appendChild(ul);
        return sec;
    }
    function render() {
        var shown = items.filter(matches);
        listEl.textContent = '';
        countEl.textContent = T.count(shown.length);
        if (!shown.length) {
            var p = odaEl('p', 'res-empty', T.none + ' ');
            var b = odaEl('button', null, T.clear); b.type = 'button';
            b.addEventListener('click', function () { state = { cat: '', q: '', lang: '' }; qEl.value = ''; langEl.value = ''; chips(); render(); });
            p.appendChild(b); listEl.appendChild(p); return;
        }
        var plain = !state.cat && !state.q && !state.lang;
        var featured = shown.filter(function (r) { return r.featured; });
        if (plain && featured.length) listEl.appendChild(group(T.featured, featured, 'res-featured'));
        Object.keys(CATS).forEach(function (k) {
            var inCat = shown.filter(function (r) { return r.category === k; });
            if (inCat.length) listEl.appendChild(group(CATS[k], inCat));
        });
    }

    if (!form) return;
    var msg = form.querySelector('[data-res-msg]'), btn = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var data = {}; new FormData(form).forEach(function (v, k) { data[k] = typeof v === 'string' ? v.trim() : v; });
        var bad = [];
        if (!data.title || data.title.length < 3) bad.push('title');
        if (!/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(data.url || '')) bad.push('url');
        if (!data.category) bad.push('category');
        form.querySelectorAll('[name]').forEach(function (f) { f.removeAttribute('aria-invalid'); });
        if (bad.length) {
            bad.forEach(function (n) { form.querySelector('[name="' + n + '"]').setAttribute('aria-invalid', 'true'); });
            form.querySelector('[name="' + bad[0] + '"]').focus();
            msg.className = 'res-form-msg err'; msg.textContent = T.bad; return;
        }
        btn.disabled = true; msg.className = 'res-form-msg'; msg.textContent = T.sending;
        odaApi.post('/burime', data).then(function (res) {
            form.reset(); msg.className = 'res-form-msg ok'; msg.textContent = res.message;
            if (window.turnstile) try { window.turnstile.reset(); } catch (x) {}
        }).catch(function (err) {
            msg.className = 'res-form-msg err'; msg.textContent = err.message;
            if (window.turnstile) try { window.turnstile.reset(); } catch (x) {}
        }).then(function () { btn.disabled = false; });
    });
})();

// =====================================================================
// v0.6: "Shkruaj artikullin tënd", now the composer at the top of the feed, and guest pieces
// =====================================================================
(function () {
    var root = document.querySelector('[data-write]');
    if (!root) return;
    var toggle = root.querySelector('[data-write-toggle]'), panel = root.querySelector('[data-write-panel]');
    var doors = root.querySelector('[data-write-doors]'), form = root.querySelector('[data-write-form]'), done = root.querySelector('[data-write-done]');
    var openBtn = root.querySelector('[data-write-open]');
    var countEl = form.querySelector('[data-write-count]'), savedEl = form.querySelector('[data-write-saved]');
    var restoredEl = form.querySelector('[data-write-restored]'), msg = form.querySelector('[data-write-msg]');
    var send = form.querySelector('button[type="submit"]');
    var title = form.elements.title, body = form.elements.body;
    var KEY = 'oda-shkrim', MIN = 200, MAX = 8000, FIELDS = ['title', 'section', 'body', 'sources', 'author_name', 'note'];
    var T = odaSq ? {
        words: function (n) { return n === 1 ? '1 fjalë' : n + ' fjalë'; },
        need: function (n) { return n === 0 ? 'duhen të paktën ' + MIN : 'edhe ' + (MIN - n) + ' deri te minimumi'; },
        over: 'shumë i gjatë: deri në 8.000 fjalë',
        saved: function (t) { return 'U ruajt në këtë pajisje, ' + t; },
        sending: 'Duke dërguar…',
        bad: 'Plotëso titullin, shkrimin (të paktën 200 fjalë), emrin dhe email-in, dhe konfirmo deklaratën.',
        offline: 'Shkrimi nuk u dërgua. Teksti yt mbetet i ruajtur në këtë pajisje. Provo sërish pas pak.'
    } : {
        words: function (n) { return n === 1 ? '1 word' : n + ' words'; },
        need: function (n) { return n === 0 ? 'at least ' + MIN + ' needed' : (MIN - n) + ' more to the minimum'; },
        over: 'too long: up to 8,000 words',
        saved: function (t) { return 'Saved on this device, ' + t; },
        sending: 'Sending…',
        bad: 'Fill in the title, the piece (at least 200 words), your name and email, and tick the declaration.',
        offline: 'The piece was not sent. Your text is still saved on this device. Try again in a moment.'
    };

    function wordCount(s) { return (String(s || '').match(/\S+/g) || []).length; }
    function grow(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
    function growAll() { form.querySelectorAll('[data-grow]').forEach(grow); }
    function setOpen(open) {
        toggle.setAttribute('aria-expanded', String(open));
        root.classList.toggle('is-open', open);
        panel.inert = !open; // closed content cannot be reached with the keyboard
        odaRoot.classList.toggle('write-open', open);   // the subscribe prompts stay away while someone is writing
        odaBus.emit();
    }
    function view(name) { doors.hidden = name !== 'doors'; form.hidden = name !== 'form'; done.hidden = name !== 'done'; }
    // Arriving with a link: by the next frame the page above has its final height, so land there at once, without a long glide.
    function land(el) {
        root.classList.add('is-arriving');   // no entrance on arrival: it would move the target while the page lands on it
        requestAnimationFrame(function () {
            el.scrollIntoView({ block: 'start', behavior: 'instant' });
            var y = window.scrollY;
            // the web font can move the lines above once it arrives: land again, unless the reader has already scrolled
            if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () {
                if (Math.abs(window.scrollY - y) < 4) el.scrollIntoView({ block: 'start', behavior: 'instant' });
            });
        });
    }
    function openSheet(arriving) {
        setOpen(true); view('form'); restore(); loadTurnstile(); count();
        requestAnimationFrame(growAll);
        title.focus({ preventScroll: true });
        if (arriving === true) { land(form); return; }
        var top = form.getBoundingClientRect().top;
        if (top < 0 || top > window.innerHeight * 0.45) form.scrollIntoView({ block: 'start' });
    }

    panel.inert = true;
    toggle.addEventListener('click', function () { setOpen(toggle.getAttribute('aria-expanded') !== 'true'); });
    openBtn.addEventListener('click', openSheet);
    form.querySelector('[data-write-back]').addEventListener('click', function () { save(); view('doors'); openBtn.focus(); });

    // Links from anywhere: /#shkruaj opens the two paths, /#shkruaj-nje-here goes straight to the sheet.
    function fromHash(arriving) {
        if (location.hash === '#shkruaj') { setOpen(true); if (done.hidden && form.hidden) view('doors'); if (arriving === true) land(root); }
        else if (location.hash === '#shkruaj-nje-here') openSheet(arriving);
    }
    fromHash(true);
    window.addEventListener('hashchange', fromHash);
    // The "Posto" buttons (left rail, tab bar) point at /#shkruaj: on this page they open the composer even if it was closed again.
    document.addEventListener('click', function (e) {
        var link = e.target.closest ? e.target.closest('[data-post-link]') : null;
        if (!link) return;
        setOpen(true); if (done.hidden && form.hidden) view('doors');
    });

    function count() {
        var n = wordCount(body.value);
        countEl.className = 'sheet-count' + (n > MAX ? ' over' : n >= MIN ? ' ok' : '');
        countEl.textContent = T.words(n) + (n < MIN ? ' · ' + T.need(n) : n > MAX ? ' · ' + T.over : '');
    }

    // The draft is kept only in this browser until it is sent, so a closed tab or a lost connection loses nothing.
    var restoredOnce = false, saveTimer;
    function save() {
        var d = { t: Date.now() }, any = false;
        FIELDS.forEach(function (f) { d[f] = form.elements[f].value; if (f !== 'section' && d[f].trim()) any = true; });
        if (!any) { odaStore.del(KEY); return; }
        odaStore.set(KEY, JSON.stringify(d));
        var now = new Date();
        savedEl.textContent = T.saved(String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'));
    }
    function restore() {
        if (restoredOnce) return;
        restoredOnce = true;
        var d = null;
        try { d = JSON.parse(odaStore.get(KEY) || 'null'); } catch (e) {}
        if (!d || !d.t || Date.now() - d.t > 30 * DAY) return;
        var used = false;
        FIELDS.forEach(function (f) { if (typeof d[f] === 'string' && d[f] && !form.elements[f].value) { form.elements[f].value = d[f]; used = true; } });
        if (used) restoredEl.hidden = false;
    }
    form.querySelector('[data-write-clear]').addEventListener('click', function () {
        FIELDS.forEach(function (f) { form.elements[f].value = ''; });
        odaStore.del(KEY); restoredEl.hidden = true; count(); growAll(); title.focus();
    });
    form.addEventListener('input', function (e) {
        var t = e.target;
        if (t === title && /\n/.test(title.value)) title.value = title.value.replace(/\s*\n+\s*/g, ' ');
        if (t.hasAttribute('data-grow')) grow(t);
        if (t === body) count();
        if (t.hasAttribute('aria-invalid')) {
            t.removeAttribute('aria-invalid');
            if (!form.querySelector('[aria-invalid]')) msg.textContent = ''; // everything flagged is fixed now
        }
        clearTimeout(saveTimer); saveTimer = setTimeout(save, 700);
    });
    title.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); body.focus(); } });
    window.addEventListener('resize', function () { if (!form.hidden) growAll(); });

    // Cloudflare Turnstile loads only when someone opens the sheet, never for every visitor of the home page.
    var ts = form.querySelector('.write-turnstile'), tsId = null, tsLoading = false;
    function loadTurnstile() {
        if (!ts || tsLoading) return;
        tsLoading = true;
        window.odaTurnstileReady = function () { try { tsId = window.turnstile.render(ts, { sitekey: ts.getAttribute('data-sitekey'), theme: 'dark' }); } catch (e) {} };
        var s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=odaTurnstileReady';
        s.async = true;
        document.head.appendChild(s);
    }
    function resetTurnstile() { if (window.turnstile && tsId !== null) { try { window.turnstile.reset(tsId); } catch (e) {} } }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var data = {};
        new FormData(form).forEach(function (v, k) { data[k] = typeof v === 'string' ? v.trim() : v; });
        data.consent = form.elements.consent.checked;
        var n = wordCount(data.body), bad = [];
        if ((data.title || '').length < 8) bad.push('title');
        if (n < MIN || n > MAX) bad.push('body');
        if ((data.author_name || '').length < 2) bad.push('author_name');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email || '')) bad.push('email');
        if (!data.consent) bad.push('consent');
        form.querySelectorAll('[aria-invalid]').forEach(function (f) { f.removeAttribute('aria-invalid'); });
        if (bad.length) {
            bad.forEach(function (k) { form.elements[k].setAttribute('aria-invalid', 'true'); });
            form.elements[bad[0]].focus();
            msg.className = 'sheet-msg err'; msg.textContent = T.bad;
            return;
        }
        save();
        send.disabled = true; msg.className = 'sheet-msg'; msg.textContent = T.sending;
        odaApi.post('/shkrime', data).then(function () {
            odaStore.del(KEY); form.reset(); restoredEl.hidden = true; msg.textContent = '';
            view('done'); done.focus();
        }).catch(function (err) {
            msg.className = 'sheet-msg err';
            msg.textContent = err && err.status ? err.message : T.offline;
            resetTurnstile();
        }).then(function () { send.disabled = false; });
    });
})();

// ---------- Guest pieces: the guest's name moves from the text into the byline ----------
(function () {
    var by = document.querySelector('[data-guest-byline]');
    var card = document.querySelector('.article-body > .guest-byline');
    if (!by || !card) return;
    var name = (card.querySelector('strong') || card).textContent.trim();
    if (!name) return;
    by.textContent = '';
    by.appendChild(odaEl('strong', 'guest-name', name));
    by.appendChild(document.createTextNode(' '));
    by.appendChild(odaEl('span', 'guest-flag', odaSq ? 'Shkrim i ftuar' : 'Guest piece'));
    card.remove();
})();

// =====================================================================
// v0.7: the feed. Loader, menu, relative time, entrances, the stage, topic accents,
// ticker, pointer label, draggable rows, joined pages, reading progress.
// =====================================================================

// ---------- Loader: first page of a tab session (the "loading" class is set in <head>) ----------
// It covers a page that is already rendered. It ends when the fonts and the lead image have arrived,
// and never later than 1.2 seconds after the page started loading.
(function () {
    var loader = document.getElementById('loader');
    function enter() { odaRoot.classList.add('oda-in'); odaBus.emit(); }
    if (!loader || !odaRoot.classList.contains('loading')) { requestAnimationFrame(enter); return; }
    var pct = loader.querySelector('[data-loader-pct]');
    var begin = performance.now(), deadline = Math.max(begin + 350, 1200), minEnd = Math.min(begin + 600, deadline);
    var ready = false, done = false, shown = 0;
    function show(p) { pct.textContent = p; loader.style.setProperty('--p', p); }
    function finish() {
        if (done) return; done = true;
        show(100);
        try { window.sessionStorage.setItem('oda-seen', '1'); } catch (e) {}
        odaRoot.classList.add('loader-out');
        setTimeout(enter, 180);
        setTimeout(function () { odaRoot.classList.remove('loading', 'loader-out'); loader.remove(); odaBus.emit(); }, 820);
    }
    var waits = [];
    if (document.fonts && document.fonts.ready) waits.push(document.fonts.ready);
    var lead = document.querySelector('.stage-img, .article-image img, .post-media img');
    if (lead && !lead.complete) waits.push(new Promise(function (res) { lead.addEventListener('load', res); lead.addEventListener('error', res); }));
    Promise.all(waits).then(function () { ready = true; }, function () { ready = true; });
    function tick(now) {
        if (done) return;
        if (now >= deadline || (ready && now >= minEnd)) { finish(); return; }
        var goal = Math.min(ready ? 100 : 92, ((now - begin) / (minEnd - begin)) * 100);
        shown = Math.max(shown, goal);
        show(Math.floor(shown));
        requestAnimationFrame(tick);
    }
    if (document.visibilityState === 'hidden') finish(); else requestAnimationFrame(tick);
    setTimeout(finish, 1600);   // frames can stall; the page is never left covered
})();

// ---------- Full-screen menu ----------
(function () {
    var menu = document.querySelector('[data-menu]');
    var openBtn = document.querySelector('[data-menu-open]');
    if (!menu || !openBtn) return;
    var closeBtn = menu.querySelector('[data-menu-close]');
    function isOpen() { return odaRoot.classList.contains('menu-open'); }
    function set(open) {
        odaRoot.classList.toggle('menu-open', open);
        openBtn.setAttribute('aria-expanded', String(open));
        odaBus.emit();
        if (open) closeBtn.focus({ preventScroll: true });
        else if (menu.contains(document.activeElement)) openBtn.focus({ preventScroll: true });
    }
    // Without this script the button is a link to #menu; with it, the address stays clean.
    if (location.hash === '#menu') { history.replaceState(null, '', location.pathname + location.search); set(true); }
    openBtn.addEventListener('click', function (e) { e.preventDefault(); set(!isOpen()); });
    closeBtn.addEventListener('click', function (e) { e.preventDefault(); set(false); });
    menu.addEventListener('click', function (e) { var a = e.target.closest('a'); if (a && a !== closeBtn) set(false); });
    document.addEventListener('keydown', function (e) {
        if ((e.key === ' ' || e.key === 'Spacebar') && e.target.matches && e.target.matches('a[role="button"]')) { e.preventDefault(); e.target.click(); return; }
        if (!isOpen()) return;
        if (e.key === 'Escape') { set(false); return; }
        if (e.key !== 'Tab') return;   // keep the keyboard inside the open menu
        var items = menu.querySelectorAll('a[href], button:not([disabled])');
        var first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        else if (!menu.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    });
})();

// ---------- Relative time ----------
// Pages are cached at the edge, so "2 orë" cannot be printed by the server: it is worked out here
// from the <time datetime>. Without this script the reader sees the date.
var odaShortMonths = odaSq ? ['jan', 'shk', 'mar', 'pri', 'maj', 'qer', 'kor', 'gus', 'sht', 'tet', 'nën', 'dhj']
    : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function odaAgo(root) {
    var now = Date.now(), list = (root || document).querySelectorAll('time[data-ago]');
    if (root && root.matches && root.matches('time[data-ago]')) list = [root];
    Array.prototype.forEach.call(list, function (t) {
        var d = new Date(t.getAttribute('datetime'));
        if (isNaN(d)) return;
        var s = (now - d.getTime()) / 1000, out;
        if (s < 0) return;
        if (s < 60) out = odaSq ? 'tani' : 'now';
        else if (s < 3600) out = Math.floor(s / 60) + ' min';
        else if (s < 86400) out = Math.floor(s / 3600) + (odaSq ? ' orë' : ' h');
        else if (s < 7 * 86400) out = Math.floor(s / 86400) + (odaSq ? ' ditë' : ' d');
        else out = d.getDate() + ' ' + odaShortMonths[d.getMonth()] + (d.getFullYear() !== new Date(now).getFullYear() ? ' ' + d.getFullYear() : '');
        if (t.textContent !== out) t.textContent = out;
        if (!t.title) t.title = odaDate(d.toISOString(), true);
    });
}
odaAgo();
setInterval(function () { if (document.visibilityState === 'visible') odaAgo(); }, 60000);

// ---------- Entrances: things rise as they come into view; big words leave their mask ----------
var odaReveal = (function () {
    if (odaReduce || !('IntersectionObserver' in window)) return function () {};
    var RISE = '.feed-post, .mod, .stories, .rail-card, .tile, .paper, .case, .art, .tl-item, .join, .author-box, .evidence, .cite, .guest-box, .poll';
    var MARK = '[data-reveal], .channel, [data-wipe]';
    var io = new IntersectionObserver(function (entries) {
        var i = 0;
        entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            e.target.style.setProperty('--i', Math.min(i++, 6));
            e.target.classList.add('in');
            io.unobserve(e.target);
        });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
    return function (root, fresh) {
        var h = window.innerHeight;
        (root || document).querySelectorAll(RISE + ', ' + MARK).forEach(function (el) {
            if (el._rv) return;
            el._rv = 1;
            if (!el.matches(MARK)) {
                if (!fresh && el.getBoundingClientRect().top < h) return;   // already on screen at load: leave it alone
                el.setAttribute('data-rv', '');
            }
            io.observe(el);
        });
    };
})();
odaReveal();

// ---------- The stage: lead stories travel sideways while the page scrolls down ----------
(function () {
    var stage = document.querySelector('[data-stage]');
    if (!stage) return;
    var pin = stage.querySelector('.stage-pin'), track = stage.querySelector('[data-stage-track]');
    var cards = track.children, n = cards.length;
    var nowEl = stage.querySelector('[data-stage-now]'), totalEl = stage.querySelector('[data-stage-total]'), bar = stage.querySelector('[data-stage-bar]');
    function two(x) { return String(x).padStart(2, '0'); }
    if (!n) { stage.hidden = true; return; }
    totalEl.textContent = '/ ' + two(n);
    var current = 0;
    function count(i) { if (i !== current) { current = i; nowEl.textContent = two(i + 1); } }

    // The drifting words and the floating cards only run while the stage is on screen.
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { stage.classList.toggle('is-live', es[0].isIntersecting); }).observe(stage);
    else stage.classList.add('is-live');

    if (odaReduce || n < 2) {
        // A plain row that scrolls sideways: the counter follows it.
        track.addEventListener('scroll', function () {
            var max = track.scrollWidth - track.clientWidth;
            count(max > 0 ? Math.round((track.scrollLeft / max) * (n - 1)) : 0);
        }, { passive: true });
        return;
    }

    stage.style.setProperty('--n', n);
    stage.classList.add('is-pinned');
    var x = 0, travel = 0, top = 0, dist = 1, headH = 0;
    function measure() {
        headH = parseFloat(getComputedStyle(pin).top) || 0;
        travel = Math.max(0, track.offsetWidth - pin.clientWidth);
        top = stage.getBoundingClientRect().top + window.scrollY - headH;
        dist = Math.max(1, stage.offsetHeight - pin.offsetHeight);
        odaFrame.ask();
    }
    measure();
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('load', measure);
    if ('ResizeObserver' in window) new ResizeObserver(measure).observe(track);

    var first = true;
    odaFrame.add(function (y) {
        var p = Math.min(1, Math.max(0, (y - top) / dist));
        var target = -p * travel;
        if (first) { x = target; first = false; }
        x += (target - x) * 0.16;
        if (Math.abs(target - x) < 0.35) x = target;
        track.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)';
        bar.style.setProperty('--prog', p.toFixed(4));
        count(Math.min(n - 1, Math.round(p * (n - 1))));
        return x !== target;
    });

    // Tilt and sheen under a desktop pointer.
    if (!odaFine) return;
    var tilted = null, pending = null;
    function rest(card) {
        if (!card) return;
        card.classList.remove('is-tilt');
        var link = card.firstElementChild;
        link.style.setProperty('--rx', '0deg'); link.style.setProperty('--ry', '0deg');
    }
    track.addEventListener('pointermove', function (e) {
        var card = e.target.closest('[data-tilt]');
        if (card !== tilted) { rest(tilted); tilted = card; }
        if (!card) { pending = null; return; }
        var r = card.getBoundingClientRect();
        pending = { card: card, px: (e.clientX - r.left) / r.width, py: (e.clientY - r.top) / r.height };
        odaFrame.ask();
    }, { passive: true });
    track.addEventListener('pointerleave', function () { rest(tilted); tilted = null; pending = null; });
    odaFrame.add(function () {
        if (!pending) return false;
        var link = pending.card.firstElementChild, px = pending.px, py = pending.py;
        pending.card.classList.add('is-tilt');
        link.style.setProperty('--ry', ((px - 0.5) * 9).toFixed(2) + 'deg');
        link.style.setProperty('--rx', ((0.5 - py) * 7).toFixed(2) + 'deg');
        link.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        link.style.setProperty('--my', (py * 100).toFixed(1) + '%');
        pending = null;
        return false;
    });
})();

// ---------- Topic accent: the page's accent and the browser bar take the colour of the topic on screen ----------
(function () {
    var meta = document.querySelector('meta[name="theme-color"]');
    var base = document.body.getAttribute('data-topic') || '';
    function apply(slug, src) {
        if (slug) odaRoot.setAttribute('data-accent', slug); else odaRoot.removeAttribute('data-accent');
        if (!meta) return;
        var colour = src ? getComputedStyle(src).getPropertyValue('--tb').trim() : '';
        meta.setAttribute('content', /^#[0-9a-f]{3,8}$/i.test(colour) ? colour : '#000000');
    }
    apply(base, base ? document.body : null);
    var zones = Array.prototype.slice.call(document.querySelectorAll('.band[data-accent]'));
    if (!zones.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { e.target._mid = e.isIntersecting; });
        var on = zones.filter(function (z) { return z._mid; }).pop();
        if (on) apply(on.getAttribute('data-accent'), on); else apply(base, base ? document.body : null);
    }, { rootMargin: '-48% 0px -48% 0px' });
    zones.forEach(function (z) { io.observe(z); });
})();

// ---------- Ticker: the list is doubled so it can loop; it stops under the pointer and off screen ----------
(function () {
    var ticker = document.querySelector('[data-ticker]');
    if (!ticker || odaReduce) return;
    var track = ticker.querySelector('.ticker-track');
    var items = Array.prototype.slice.call(track.children);
    if (items.length < 2) return;
    var width = track.offsetWidth;
    items.forEach(function (li) {
        var copy = li.cloneNode(true);
        copy.setAttribute('aria-hidden', 'true');
        copy.querySelectorAll('a').forEach(function (a) { a.tabIndex = -1; });
        track.appendChild(copy);
    });
    ticker.style.setProperty('--dur', Math.max(24, Math.round(width / 48)) + 's');   // about 48px a second
    ticker.classList.add('is-on');
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { ticker.classList.toggle('is-off', !es[0].isIntersecting); }).observe(ticker);
})();

// ---------- Loops rest while they are off screen ----------
(function () {
    if (odaReduce || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { e.target.classList.toggle('loop-off', !e.isIntersecting); }); });
    document.querySelectorAll('.site-foot, .stories, .rail-live, .live-now, .feed-post.tag-hash-live').forEach(function (el) { io.observe(el); });
})();

// ---------- Rows that scroll sideways can be dragged with a mouse ----------
(function () {
    var rail = null, startX = 0, startLeft = 0, moved = false;
    document.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        var el = e.target.closest('[data-drag]');
        if (!el || el.scrollWidth <= el.clientWidth + 4) return;
        rail = el; startX = e.clientX; startLeft = el.scrollLeft; moved = false;
    });
    document.addEventListener('pointermove', function (e) {
        if (!rail) return;
        var dx = e.clientX - startX;
        if (!moved && Math.abs(dx) > 6) { moved = true; rail.classList.add('is-drag'); }
        if (moved) rail.scrollLeft = startLeft - dx;
    }, { passive: true });
    function end() {
        if (!rail) return;
        var el = rail; rail = null;
        if (!moved) return;
        // the click that ends a drag must not open the card under the pointer
        var stop = function (ev) { ev.preventDefault(); ev.stopPropagation(); };
        el.addEventListener('click', stop, true);
        setTimeout(function () { el.classList.remove('is-drag'); el.removeEventListener('click', stop, true); }, 60);
    }
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
    document.addEventListener('dragstart', function (e) { if (e.target.closest && e.target.closest('[data-drag]')) e.preventDefault(); });
})();

// ---------- A label that follows a desktop pointer: Lexo, Shiko, Zvarrit ----------
(function () {
    if (!odaFine || odaReduce) return;
    var LABEL = odaSq ? { read: 'Lexo', view: 'Shiko', drag: 'Zvarrit' } : { read: 'Read', view: 'View', drag: 'Drag' };
    var pill = odaEl('div', 'cursor-pill'), text = odaEl('span');
    pill.setAttribute('aria-hidden', 'true');
    pill.appendChild(text);
    document.body.appendChild(pill);
    var x = 0, y = 0, tx = 0, ty = 0, kind = '', placed = false;
    function set(k) {
        if (k === kind) return;
        kind = k;
        if (k) text.textContent = LABEL[k] || '';
        pill.classList.toggle('is-on', !!k);
    }
    document.addEventListener('pointermove', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        tx = e.clientX; ty = e.clientY;
        if (!placed) { x = tx; y = ty; placed = true; }
        var t = e.target.closest ? e.target : null, k = '';
        var el = t && t.closest('[data-cursor]');
        if (el) k = el.getAttribute('data-cursor');
        else { var row = t && t.closest('[data-drag]'); if (row && row.scrollWidth > row.clientWidth + 4) k = 'drag'; }
        set(k);
        odaFrame.ask();
    }, { passive: true });
    document.addEventListener('pointerdown', function () { set(''); }, { passive: true });
    window.addEventListener('scroll', function () { set(''); }, { passive: true });
    document.documentElement.addEventListener('pointerleave', function () { set(''); });
    odaFrame.add(function () {
        if (!placed) return false;
        x += (tx - x) * 0.24; y += (ty - y) * 0.24;
        var settled = Math.abs(tx - x) + Math.abs(ty - y) < 0.5;
        if (settled) { x = tx; y = ty; }
        pill.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
        return !settled;
    });
})();

// ---------- Joined pages: older posts are added under the list ----------
// Two pages arrive by themselves as the reader nears the end; after that the "Më shumë" button asks.
// Without this script the button is an ordinary link to the next page.
(function () {
    var nav = document.querySelector('[data-pagination]'), list = document.querySelector('[data-feed-list]');
    if (!nav || !list || !window.fetch || !window.DOMParser) return;
    var auto = 2, busy = false;
    function more() { return nav.querySelector('[data-more]'); }
    function near() { return nav.getBoundingClientRect().top < window.innerHeight + 700; }
    function load(byHand) {
        var link = more();
        if (!link || busy) return;
        var url = link.href;
        busy = true; nav.classList.add('is-busy');
        fetch(url, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('page'); return r.text(); }).then(function (html) {
            var doc = new DOMParser().parseFromString(html, 'text/html');
            var fresh = doc.querySelector('[data-feed-list]');
            if (!fresh) throw new Error('list');
            var added = Array.prototype.map.call(fresh.children, function (el) { return document.importNode(el, true); });
            added.forEach(function (el) { list.appendChild(el); });
            var next = doc.querySelector('[data-pagination] [data-more]');
            if (next) link.href = next.href; else link.remove();
            var newer = nav.querySelector('.newer-posts');
            if (newer) newer.remove();   // the list now starts where the reader started
            odaAgo(list);
            odaReveal(list, true);
            if (byHand && added[0]) { var a = added[0].querySelector('a[href]'); if (a) a.focus({ preventScroll: true }); }
            busy = false; nav.classList.remove('is-busy');
            if (auto > 0 && more() && near()) { auto--; load(false); }
        }).catch(function () { window.location.href = url; });
    }
    nav.addEventListener('click', function (e) {
        var link = e.target.closest('[data-more]');
        if (!link) return;
        e.preventDefault();
        load(true);
    });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) {
        if (es[0].isIntersecting && auto > 0 && !busy) { auto--; load(false); }
    }, { rootMargin: '0px 0px 700px 0px' }).observe(nav);
})();

// ---------- Reading progress on articles ----------
(function () {
    var bar = document.querySelector('[data-read-bar]'), body = document.querySelector('.article-body');
    if (!bar || !body) return;
    var head = document.querySelector('[data-head]');
    odaFrame.add(function (y, h) {
        var r = body.getBoundingClientRect(), top = head ? head.offsetHeight : 0;
        var span = r.height - (h - top);
        var p = span > 0 ? (top - r.top) / span : (r.bottom < h ? 1 : 0);
        bar.style.setProperty('--read', Math.min(1, Math.max(0, p)).toFixed(4));
        return false;
    });
})();
