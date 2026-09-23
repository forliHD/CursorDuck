/* Cursor Duck website — (c) 2026 Lucas Reiser (forliHD). All rights reserved. See LICENSE. */
/* The wishing pond: ideas float as lily pads, visitors toss breadcrumbs at the
 * ones they like (one per idea per device) and new ideas wait for a human before
 * they surface. Talks to /api/* (Cloudflare Pages Functions + D1). Turnstile is
 * loaded only when somebody votes or submits for the first time.
 * Admin mode (footer link or ?admin): log in with the admin token and moderate
 * right here on the board. */
(function () {
  'use strict';

  var doc = document;
  var section = doc.getElementById('pond');
  if (!section) return;
  var DATA = window.CD_DATA || {};
  var META = DATA.meta || {};
  var DE = (DATA.de && DATA.de.js) || {};
  var SITE_KEY = META.turnstileSiteKey || '';
  if (!SITE_KEY) { section.hidden = true; return; }   // pond not configured on this deployment

  // English strings used from JavaScript; the German ones live in site/de.json ("js")
  var STR_EN = {
    pondVote: 'Toss a crumb',
    pondVoted: 'You tossed a crumb at this one',
    pondPlanned: 'Planned',
    pondBuilt: 'Built in {v}',
    pondBuiltGroup: 'Already built',
    pondThanks: 'Thanks! Your idea is floating in the moderation queue and surfaces once a human has looked at it.',
    pondLoadFail: 'Couldn’t fish the ideas out of the pond right now.',
    err_turnstile: 'The bot check didn’t pass. Please try again.',
    err_voter: 'Your crumb pass expired. Please try again.',
    err_rate: 'Easy there, that’s a lot of crumbs. Try again later.',
    err_dup: 'You already tossed a crumb at this one.',
    err_links: 'Please no links.',
    err_title: 'The idea needs at least 4 characters.',
    err_missing: 'That idea has left the pond.',
    err_unconfigured: 'The pond isn’t open yet.',
    err_generic: 'The pond didn’t answer. Please try again.',
    adminMode: 'Admin mode',
    adminWaiting: '{n} waiting for approval',
    adminLogout: 'Log out',
    adminHello: 'Welcome back. Pending ideas are listed first.',
    adminWrong: 'That token didn’t open the pond.',
    adminDone: 'Saved.',
    adminPendingGroup: 'Waiting for approval',
    adminPending: 'Pending',
    adminApprove: 'Approve',
    adminDecline: 'Decline',
    adminDelete: 'Delete',
    adminEdit: 'Edit',
    adminPlan: 'Mark planned',
    adminBuilt: 'Built in…',
    adminReopen: 'Reopen',
    adminVersionPrompt: 'Built in which version? (e.g. 1.8.0)',
    adminEditTitle: 'Title',
    adminEditBody: 'Details',
    adminSure: 'Really delete?',
    pondIdeasGroup: 'Ideas',
    pondTranslated: 'automatically translated',
    pondOriginal: 'Original:',
    adminTranslate: 'Translate'
  };

  function lang() { return doc.documentElement.lang === 'de' ? 'de' : 'en'; }
  function T(key) {
    if (lang() === 'de' && DE[key]) return DE[key];
    return STR_EN[key] || key;
  }
  function $(sel) { return doc.querySelector(sel); }
  function el(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val);
    } catch (e) { /* storage blocked */ }
    return null;
  }
  function session(key, val) {
    try {
      if (val === undefined) return sessionStorage.getItem(key);
      if (val === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, val);
    } catch (e) { /* storage blocked */ }
    return null;
  }
  function E(code, data) { var e = new Error(code); e.code = code; e.data = data || {}; return e; }

  var ideas = [], sort = 'top', voted = {};
  try { JSON.parse(store('cd-voted') || '[]').forEach(function (id) { voted[id] = 1; }); } catch (e) { /* fresh */ }
  function saveVoted() { store('cd-voted', JSON.stringify(Object.keys(voted).slice(-500))); }

  function request(method, path, body, headers) {
    var opts = { method: method, headers: headers || {} };
    if (body) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
    if (method === 'GET' && adminToken) opts.cache = 'no-store';   // moderation wants fresh lists
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw E(j.error || 'generic', j);
        return j;
      });
    });
  }
  function api(method, path, body) { return request(method, path, body); }

  // ── Turnstile, loaded on demand ─────────────────────────────
  var tsLoading = null;
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    if (tsLoading) return tsLoading;
    tsLoading = new Promise(function (resolve, reject) {
      window.__cdTurnstileReady = resolve;
      var s = doc.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__cdTurnstileReady&render=explicit';
      s.async = true;
      s.onerror = function () { tsLoading = null; reject(E('turnstile')); };
      doc.head.appendChild(s);
    });
    return tsLoading;
  }
  function turnstileToken() {
    return loadTurnstile().then(function () {
      return new Promise(function (resolve, reject) {
        var box = $('#tsBox');
        box.hidden = false;
        box.innerHTML = '';
        var id = null;
        function done(fn, value) {
          box.hidden = true;
          try { if (id !== null) window.turnstile.remove(id); } catch (e) { /* already gone */ }
          fn(value);
        }
        try {
          id = window.turnstile.render(box, {
            sitekey: SITE_KEY, appearance: 'interaction-only', execution: 'execute', theme: 'auto',
            callback: function (token) { done(resolve, token); },
            'error-callback': function () { done(reject, E('turnstile')); },
            'timeout-callback': function () { done(reject, E('turnstile')); }
          });
          window.turnstile.execute(id);
        } catch (e) { done(reject, E('turnstile')); }
      });
    });
  }
  function getVoter() {
    var v = store('cd-voter');
    if (v) return Promise.resolve(v);
    return turnstileToken()
      .then(function (t) { return api('POST', '/api/voter', { turnstile: t }); })
      .then(function (j) { store('cd-voter', j.voter); return j.voter; });
  }
  // runs an action with a voter pass; a stale pass is replaced once
  function withVoter(action) {
    return getVoter().then(action).catch(function (e) {
      if (e.code !== 'voter') throw e;
      store('cd-voter', null);
      return getVoter().then(action);
    });
  }

  // ── Admin mode ──────────────────────────────────────────────
  var adminToken = session('cd-admin') || '';
  var pending = [], counts = {};
  function adminApi(method, path, body) {
    return request(method, path, body, { authorization: 'Bearer ' + adminToken });
  }
  function loadPending() {
    if (!adminToken) { pending = []; counts = {}; return Promise.resolve(false); }
    return adminApi('GET', '/api/admin/ideas?status=pending')
      .then(function (j) { pending = j.ideas || []; counts = j.counts || {}; return true; })
      .catch(function (e) {
        if (e.code === 'auth') { adminToken = ''; session('cd-admin', null); pending = []; counts = {}; }
        throw e;
      });
  }
  function renderAdminBar() {
    var bar = $('#adminBar');
    bar.hidden = !adminToken;
    if (!adminToken) return;
    bar.innerHTML = '';
    bar.appendChild(el('span', '', '🛠️ ' + T('adminMode') + ' · ' + T('adminWaiting').replace('{n}', String(pending.length))));
    bar.appendChild(el('span', 'spacer'));
    var out = el('button', 'btn btn-ghost btn-mini', T('adminLogout'));
    out.type = 'button';
    out.onclick = function () {
      adminToken = '';
      session('cd-admin', null);
      pending = []; counts = {};
      renderAdminBar();
      render();
    };
    bar.appendChild(out);
  }
  function openAdminBox() {
    var box = $('#adminBox');
    box.hidden = false;
    section.scrollIntoView();
    $('#adminTokenInput').focus();
  }
  function adminSet(idea, status, extra) {
    var body = { status: status };
    if (extra) for (var k in extra) body[k] = extra[k];
    return adminApi('POST', '/api/admin/ideas/' + idea.id, body)
      .then(refreshAll)
      .then(function () { msg('adminDone', true); })
      .catch(function (e) { msg(e.code === 'auth' ? 'adminWrong' : 'err_generic'); });
  }
  function adminRemove(idea) {
    adminApi('DELETE', '/api/admin/ideas/' + idea.id)
      .then(refreshAll)
      .then(function () { msg('adminDone', true); })
      .catch(function (e) { msg(e.code === 'auth' ? 'adminWrong' : 'err_generic'); });
  }
  function adminActions(idea) {
    var row = el('div', 'admin-actions');
    function add(label, fn, cls) {
      var b = el('button', 'btn btn-ghost btn-mini' + (cls ? ' ' + cls : ''), label);
      b.type = 'button';
      b.onclick = fn;
      row.appendChild(b);
    }
    if (idea.status === 'pending' || idea.status === 'declined' || idea.status === 'built') {
      add(T(idea.status === 'pending' ? 'adminApprove' : 'adminReopen'), function () { adminSet(idea, 'open'); });
    }
    if (idea.status === 'open') add(T('adminPlan'), function () { adminSet(idea, 'planned'); });
    if (idea.status === 'open' || idea.status === 'planned') {
      add(T('adminBuilt'), function () {
        var v = window.prompt(T('adminVersionPrompt'), '');
        if (v) adminSet(idea, 'built', { version: v.trim() });
      });
    }
    if (idea.status !== 'declined') add(T('adminDecline'), function () { adminSet(idea, 'declined'); });
    add(T('adminTranslate'), function () { adminSet(idea, idea.status, { translate: true, version: idea.version || '' }); });
    add(T('adminEdit'), function () {
      var t = window.prompt(T('adminEditTitle'), idea.title);
      if (t === null) return;
      var b = window.prompt(T('adminEditBody'), idea.body || '');
      if (b === null) return;
      adminSet(idea, idea.status, { title: t, body: b, version: idea.version || '' });
    });
    // two clicks to delete: the first arms the button for a few seconds
    var armed = 0;
    add(T('adminDelete'), function () {
      var b = this;
      if (armed) { adminRemove(idea); return; }
      armed = setTimeout(function () { armed = 0; b.textContent = T('adminDelete'); }, 4000);
      b.textContent = T('adminSure');
    }, 'danger');
    return row;
  }

  // ── Messages and rendering ──────────────────────────────────
  var msgEl = $('#pondMsg'), msgTimer = 0;
  function msg(key, ok) {
    msgEl.textContent = T(key);
    msgEl.className = 'pond-msg' + (ok ? '' : ' err');
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function () { msgEl.textContent = ''; }, ok ? 12000 : 7000);
  }
  function fmtDate(ms) {
    try {
      return new Intl.DateTimeFormat(lang() === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ms));
    } catch (e) { return ''; }
  }
  // the idea in the visitor's language: the stored translation when the
  // submitter wrote in the other one, the original otherwise
  function display(idea) {
    if (idea.lang !== lang() && idea.tr_title) return { title: idea.tr_title, body: idea.tr_body || '', translated: true };
    return { title: idea.title, body: idea.body || '', translated: false };
  }
  function pad(idea) {
    var art = el('article', 'pad ' + idea.status);
    var shown = display(idea);
    var btn = el('button', 'crumb' + (voted[idea.id] ? ' did' : ''));
    btn.type = 'button';
    btn.appendChild(doc.createTextNode('🍞 '));
    btn.appendChild(el('b', '', String(idea.votes)));
    var label = T(voted[idea.id] ? 'pondVoted' : 'pondVote');
    btn.setAttribute('aria-label', label);
    btn.title = label;
    if (idea.status === 'built' || idea.status === 'pending') btn.disabled = true;
    btn.onclick = function () { vote(idea, btn); };
    art.appendChild(btn);
    var body = el('div', 'pad-body');
    body.appendChild(el('h3', '', shown.title));
    if (shown.body) body.appendChild(el('p', '', shown.body));
    var meta = el('p', 'pad-meta');
    if (idea.status === 'planned') meta.appendChild(el('span', 'badge planned', T('pondPlanned')));
    if (idea.status === 'built') meta.appendChild(el('span', 'badge built', T('pondBuilt').replace('{v}', idea.version || '')));
    if (idea.status === 'pending') meta.appendChild(el('span', 'badge pending', T('adminPending')));
    meta.appendChild(doc.createTextNode((meta.childNodes.length ? ' · ' : '') + fmtDate(idea.created) +
      (shown.translated ? ' · ' + T('pondTranslated') : '') +
      (adminToken ? ' · ' + idea.lang.toUpperCase() : '')));
    body.appendChild(meta);
    if (adminToken && shown.translated) {
      body.appendChild(el('p', 'pad-orig', T('pondOriginal') + ' ' + idea.title + (idea.body ? ' — ' + idea.body : '')));
    }
    if (adminToken) body.appendChild(adminActions(idea));
    art.appendChild(body);
    return art;
  }
  function render() {
    var box = $('#pads');
    box.innerHTML = '';
    if (adminToken && pending.length) {
      box.appendChild(el('h3', 'pads-group', T('adminPendingGroup') + ' (' + pending.length + ')'));
      pending.slice().sort(function (a, b) { return b.created - a.created; }).forEach(function (i) { box.appendChild(pad(i)); });
    }
    var list = ideas.slice();
    if (sort === 'new') list.sort(function (a, b) { return b.created - a.created; });
    else list.sort(function (a, b) { return (b.votes - a.votes) || (b.created - a.created); });
    var active = list.filter(function (i) { return i.status !== 'built'; });
    var built = list.filter(function (i) { return i.status === 'built'; });
    if (adminToken && pending.length && active.length) box.appendChild(el('h3', 'pads-group', T('pondIdeasGroup')));
    active.forEach(function (i) { box.appendChild(pad(i)); });
    if (built.length) {
      box.appendChild(el('h3', 'pads-group', T('pondBuiltGroup')));
      built.forEach(function (i) { box.appendChild(pad(i)); });
    }
    $('#pondEmpty').hidden = list.length > 0 || pending.length > 0;
  }

  // ── Actions ─────────────────────────────────────────────────
  function vote(idea, btn) {
    if (voted[idea.id]) { msg('err_dup'); return; }
    btn.disabled = true;
    var rect = btn.getBoundingClientRect();
    withVoter(function (v) { return api('POST', '/api/ideas/' + idea.id + '/vote', { voter: v }); })
      .then(function (j) {
        idea.votes = j.votes;
        voted[idea.id] = 1;
        saveVoted();
        render();
        // the crumb is real: the duck comes over and eats it
        var duck = window.__duck;
        if (duck && duck.cfg.feed) {
          try { duck.throwCrumbs(rect.left + rect.width / 2, rect.top + rect.height / 2); } catch (e) { /* decoration */ }
        }
      })
      .catch(function (e) {
        if (e.code === 'dup') {
          voted[idea.id] = 1;
          saveVoted();
          if (typeof e.data.votes === 'number') idea.votes = e.data.votes;
          render();
        }
        msg(STR_EN['err_' + e.code] ? 'err_' + e.code : 'err_generic');
      })
      .then(function () { btn.disabled = false; });
  }

  var form = $('#pondForm'), addBtn = $('#pondAdd'), titleEl = $('#pondTitle'), bodyEl = $('#pondBody'), countEl = $('#pondCount');
  function openForm() { form.hidden = false; addBtn.hidden = true; titleEl.focus(); }
  function closeForm() { form.hidden = true; addBtn.hidden = false; }
  addBtn.onclick = openForm;
  $('#pondCancel').onclick = function () { form.reset(); updateCount(); closeForm(); };
  function updateCount() { countEl.textContent = bodyEl.value.length + '/500'; }
  bodyEl.oninput = updateCount;
  updateCount();
  form.onsubmit = function (ev) {
    ev.preventDefault();
    var title = titleEl.value.trim(), text = bodyEl.value.trim();
    if (title.length < 4) { msg('err_title'); titleEl.focus(); return; }
    var submit = $('#pondSubmit');
    submit.disabled = true;
    withVoter(function (v) { return api('POST', '/api/ideas', { voter: v, title: title, body: text, lang: lang() }); })
      .then(function () { form.reset(); updateCount(); closeForm(); msg('pondThanks', true); return adminToken ? refreshAll() : null; })
      .catch(function (e) { msg(STR_EN['err_' + e.code] ? 'err_' + e.code : 'err_generic'); })
      .then(function () { submit.disabled = false; });
  };

  Array.prototype.slice.call(doc.querySelectorAll('.seg button[data-sort]')).forEach(function (b) {
    b.onclick = function () {
      sort = b.getAttribute('data-sort');
      Array.prototype.slice.call(doc.querySelectorAll('.seg button[data-sort]')).forEach(function (o) { o.classList.toggle('on', o === b); });
      render();
    };
  });

  // admin login box (footer link or ?admin in the URL)
  var adminForm = $('#adminBox');
  adminForm.onsubmit = function (ev) {
    ev.preventDefault();
    var t = $('#adminTokenInput').value.trim();
    if (!t) return;
    adminToken = t;
    session('cd-admin', t);
    $('#adminTokenInput').value = '';
    loadPending()
      .then(function () { adminForm.hidden = true; renderAdminBar(); render(); msg('adminHello', true); })
      .catch(function (e) { msg(e.code === 'auth' ? 'adminWrong' : 'err_generic'); });
  };
  $('#adminCancel').onclick = function () { adminForm.hidden = true; };
  var adminLink = $('#adminLink');
  if (adminLink) adminLink.onclick = function (ev) { ev.preventDefault(); openAdminBox(); };
  if (/[?&]admin(?:=|&|$)/.test(location.search)) openAdminBox();

  function loadPublic() {
    return api('GET', '/api/ideas').then(function (j) { ideas = j.ideas || []; });
  }
  function refreshAll() {
    return Promise.all([loadPublic(), loadPending().catch(function () { /* logged out */ })])
      .then(function () { renderAdminBar(); render(); });
  }

  doc.addEventListener('cd:lang', function () { if (ideas.length || pending.length) { renderAdminBar(); render(); } });

  loadPublic()
    .then(function () { return loadPending().catch(function () { /* stale token: logged out */ }); })
    .then(function () { $('#pondLoading').hidden = true; renderAdminBar(); render(); })
    .catch(function (e) {
      $('#pondLoading').hidden = true;
      msg(e.code === 'unconfigured' ? 'err_unconfigured' : 'pondLoadFail');
    });
})();
