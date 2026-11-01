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
