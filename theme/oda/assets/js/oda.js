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
