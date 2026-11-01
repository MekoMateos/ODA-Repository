// Scroll reveal for sections below the fold (styles in kuqezi.css; skipped if reduced motion is on).
(function () {
    var targets = document.querySelectorAll('.takes, .topic, .writers, .join, .read-next, .author-box, .evidence');
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
            if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    targets.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight) return; // already visible on load: leave as is
        el.classList.add('reveal');
        io.observe(el);
    });
})();

// ODA theme script: turns the "Burimet" / "Sources" section of an article into the evidence box.
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
        tally.textContent = count + (document.documentElement.lang.indexOf('sq') === 0
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

// Share button: native share sheet on phones, copy link elsewhere.
(function () {
    var btn = document.querySelector('[data-share]');
    if (!btn) return;
    btn.addEventListener('click', function () {
        var data = { title: document.title, url: location.href };
        if (navigator.share) { navigator.share(data).catch(function () {}); return; }
        if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () {
            var old = btn.textContent; btn.textContent = document.documentElement.lang.indexOf('sq') === 0 ? 'Lidhja u kopjua' : 'Link copied';
            setTimeout(function () { btn.textContent = old; }, 1800);
        });
    });
})();

// ---------- Small storage helper (storage can be blocked; the page must still work) ----------
var odaStore = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
};
var DAY = 86400000;

// ---------- Newsletter pop-up ----------
// Shows after the reader has read half the page or spent 40 seconds, at most once every 14 days,
// never on the thank-you page, and never if they already subscribed from this browser.
(function () {
    var pop = document.getElementById('nl-pop');
    if (!pop || typeof pop.showModal !== 'function') return;
    if (document.body.classList.contains('page-faleminderit')) return;
    var last = Number(odaStore.get('oda-nl-seen') || 0);
    if (odaStore.get('oda-subscribed') || Date.now() - last < 14 * DAY) return;

    var small = window.matchMedia('(max-width: 640px)');
    var shown = false;
    function open() {
        if (shown) return; shown = true;
        odaStore.set('oda-nl-seen', String(Date.now()));
        document.documentElement.classList.add('nl-open');
        if (small.matches) pop.show(); else pop.showModal();   // phones: non-blocking bottom sheet
    }
    function close() { pop.close(); document.documentElement.classList.remove('nl-open'); }
    pop.addEventListener('close', function () { document.documentElement.classList.remove('nl-open'); });
    pop.querySelectorAll('[data-nl-close]').forEach(function (b) { b.addEventListener('click', close); });
    pop.addEventListener('click', function (e) { if (e.target === pop) close(); });

    var timer = setTimeout(open, 40000);
    window.addEventListener('scroll', function onScroll() {
        var h = document.documentElement;
        if ((h.scrollTop + window.innerHeight) / h.scrollHeight > 0.5) { clearTimeout(timer); window.removeEventListener('scroll', onScroll); open(); }
    }, { passive: true });
})();

// ---------- Sticky subscribe bar (phones) ----------
(function () {
    var bar = document.getElementById('sticky-cta');
    if (!bar || odaStore.get('oda-cta-closed') || odaStore.get('oda-subscribed')) return;
    var join = document.querySelector('.join');
    var joinVisible = false;
    function update() {
        var scrolled = window.scrollY > 600;
        var popOpen = document.documentElement.classList.contains('nl-open');
        bar.hidden = !scrolled || joinVisible || popOpen;
        document.documentElement.classList.toggle('cta-on', !bar.hidden);
    }
    if (join && 'IntersectionObserver' in window) {
        new IntersectionObserver(function (es) { joinVisible = es[0].isIntersecting; update(); }).observe(join);
    }
    window.addEventListener('scroll', update, { passive: true });
    bar.querySelector('[data-cta-close]').addEventListener('click', function () {
        odaStore.set('oda-cta-closed', '1'); bar.hidden = true; document.documentElement.classList.remove('cta-on');
    });
    setInterval(update, 1500);
})();

// ---------- Cookie notice (information only: necessary cookies, no tracking) ----------
(function () {
    var note = document.getElementById('cookie-note');
    if (!note || odaStore.get('oda-cookie-ok')) return;
    note.hidden = false;
    note.querySelector('[data-cookie-ok]').addEventListener('click', function () {
        odaStore.set('oda-cookie-ok', '1'); note.hidden = true;
    });
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
var odaSq = document.documentElement.lang.indexOf('sq') === 0;

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
            requestAnimationFrame(function () { requestAnimationFrame(function () { fill.style.width = o.pct + '%'; }); });
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
