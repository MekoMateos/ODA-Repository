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
