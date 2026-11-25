/* Cursor Duck website — (c) 2026 Lucas Reiser (forliHD). All rights reserved. See LICENSE. */
/* What has to be settled before the first paint: the saved day/night choice, and
 * whether this is a phone, where the page starts folded up (html.compact).
 * Everywhere else the folds (details[data-fold]) open while the page is still
 * being read, so nothing jumps afterwards. site.js takes over from there. */
(function () {
  var root = document.documentElement;
  try {
    var t = localStorage.getItem('cd-theme');
    if (t === 'dark' || t === 'light') root.setAttribute('data-theme', t);
  } catch (e) { /* private mode: follow the system */ }

  // a phone upright, or lying on its side
  var q = window.matchMedia ? window.matchMedia('(max-width: 760px), (max-height: 500px) and (hover: none)') : null;
  window.CD_COMPACT = q;
  function mark() { root.classList.toggle('compact', !!(q && q.matches)); }
  mark();
  if (q && q.addEventListener) q.addEventListener('change', mark);
  else if (q && q.addListener) q.addListener(mark);

  if (!window.MutationObserver || (q && q.matches)) return;
  var mo = new MutationObserver(function () {
    var closed = document.querySelectorAll('details[data-fold]:not([open])');
    for (var i = 0; i < closed.length; i++) closed[i].open = true;
  });
  mo.observe(root, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', function () { mo.disconnect(); });
})();
