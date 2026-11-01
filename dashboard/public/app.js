// Ask before irreversible actions (publish, reject). CSP-safe: no inline handlers needed.
document.querySelectorAll('form[data-confirm]').forEach(function (f) {
  f.addEventListener('submit', function (e) {
    if (!window.confirm(f.getAttribute('data-confirm'))) e.preventDefault();
  });
});
// Prevent double submits while Ghost is being updated.
document.querySelectorAll('form[method="post"]').forEach(function (f) {
  f.addEventListener('submit', function (e) {
    if (e.defaultPrevented) return;
    var b = f.querySelector('button');
    if (b) setTimeout(function () { b.disabled = true; if (b.textContent.trim()) b.textContent = 'Duke ruajtur...'; }, 0);
  });
});
document.querySelectorAll('[data-autosubmit]').forEach(function (el) {
  el.addEventListener('change', function () { el.form.submit(); });
});
