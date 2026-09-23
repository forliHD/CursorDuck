/* Cursor Duck website — applies the saved day/night choice before the first paint. */
(function () {
  try {
    var t = localStorage.getItem('cd-theme');
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* private mode: follow the system */ }
})();
