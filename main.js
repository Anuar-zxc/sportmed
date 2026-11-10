/* AI Sports Precision Medicine — сайт: меню, анимации, форма заявки, согласие на cookie.
   Без сторонних библиотек. Аналитика загружается только после согласия пользователя. */
(function () {
  'use strict';

  var CONFIG = {
    email: 'ulasanuar@gmail.com',
    consentKey: 'asp_consent',
    consentVersion: 2,
    consentMaxAgeDays: 365,
    analyticsSrc: '/_vercel/insights/script.js'
  };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    remove: function (k) { try { window.localStorage.removeItem(k); } catch (e) { /* noop */ } }
  };
  function svg(name, cls) { return '<svg class="' + (cls || 'icon') + '" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + '</svg>'; }
  var ICONS = {
    cookie: '<path d="M21 12.5A9 9 0 1 1 11.5 3a3 3 0 0 0 4 3.5 3 3 0 0 0 5.5 6Z"/><circle cx="8.5" cy="10" r="1"/><circle cx="12" cy="15.5" r="1"/><circle cx="16" cy="12.5" r=".8"/>'
  };

  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  /* ---------- Header ---------- */
  var header = document.querySelector('.site-header');
  function onScroll() { if (header) header.classList.toggle('scrolled', window.scrollY > 6); }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  var burger = document.querySelector('.burger');
  var menu = document.getElementById('mobile-menu');
  function setMenu(open) {
    document.body.classList.toggle('menu-open', open);
    if (burger) { burger.setAttribute('aria-expanded', String(open)); burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню'); }
  }
  if (burger && menu) {
    burger.addEventListener('click', function () { setMenu(!document.body.classList.contains('menu-open')); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('menu-open')) { setMenu(false); burger.focus(); } });
    window.addEventListener('resize', function () { if (window.innerWidth > 1180) setMenu(false); });
  }

  /* ---------- Появление при прокрутке, счётчики, наклон, параллакс ----------
     Классы-«заготовки» получают только элементы ниже первого экрана: что видно сразу — не мигает.
     Без JS и при prefers-reduced-motion всё в финальном состоянии. */
  var vh0 = window.innerHeight || 800;
  function belowFold(el) { var r = el.getBoundingClientRect(); return r.top > vh0 * 0.92; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  var motion = !reduceMotion && 'IntersectionObserver' in window && !!document.body.classList.contains('landing');
  var sweepPassed = function () {};

  var fmtCache = {};
  function fmt(v, dec) {
    var k = 'd' + dec;
    if (!fmtCache[k]) { try { fmtCache[k] = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: dec, maximumFractionDigits: dec }); } catch (e) { fmtCache[k] = { format: function (x) { return x.toFixed(dec).replace('.', ','); } }; } }
    return fmtCache[k].format(v);
  }
  function countUp(el) {
    var to = parseFloat(el.getAttribute('data-count')), dec = +(el.getAttribute('data-dec') || 0);
    if (!(to >= 0)) return;
    var t0 = null, dur = to > 1000 ? 1800 : 1300;
    function step(t) {
      if (t0 == null) t0 = t;
      var p = clamp((t - t0) / dur, 0, 1), e = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt(to * e, dec);
      if (p < 1) requestAnimationFrame(step); else el.textContent = fmt(to, dec);
    }
    requestAnimationFrame(step);
  }

  if (motion) {
    var armed = [];
    function arm(el, d) { if (!belowFold(el)) return; el.classList.add('rv'); if (d) el.style.setProperty('--d', d); armed.push(el); }
    document.querySelectorAll('.center-head, .section-head, .how-head, [data-reveal], .shot-stage, .ab-phone, .roles, .pilot > div:first-child, .compare, .faq-list, .cta').forEach(function (el) { arm(el, 0); });
    document.querySelectorAll('[data-stagger]').forEach(function (g) {
      Array.prototype.forEach.call(g.children, function (c, i) { arm(c, Math.min(i, 7)); });
    });
    var proof = document.querySelector('.proof');
    if (proof && belowFold(proof)) { proof.classList.add('rv-armed'); armed.push(proof); }
    // числа: стартуют с нуля, только если их ещё не видно
    var counters = Array.prototype.filter.call(document.querySelectorAll('[data-count]'), belowFold);
    counters.forEach(function (el) { el.textContent = fmt(0, +(el.getAttribute('data-dec') || 0)); });

    var pending = armed.concat(counters);
    function reveal(el) {
      var i = pending.indexOf(el);
      if (i < 0) return;
      pending.splice(i, 1);
      io.unobserve(el);
      if (el.hasAttribute('data-count')) { countUp(el); return; }
      el.classList.add('in');
      // после появления убираем «заготовку», чтобы hover и другие переходы работали со своими скоростями
      var d = parseFloat(el.style.getPropertyValue('--d')) || 0;
      setTimeout(function () { el.classList.remove('rv'); el.style.removeProperty('--d'); }, 1500 + d * 80);
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) reveal(en.target); });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    pending.forEach(function (el) { io.observe(el); });
    // при резкой прокрутке элемент может проскочить экран за один кадр — наблюдатель такого не видит;
    // всё, что уже выше нижней кромки экрана, проявляем принудительно
    var lastSweep = 0;
    sweepPassed = function () {
      var now = Date.now();
      if (!pending.length || now - lastSweep < 120) return;
      lastSweep = now;
      var lim = window.innerHeight * 0.92, passed = [];
      for (var k = 0; k < pending.length; k++) if (pending[k].getBoundingClientRect().top < lim) passed.push(pending[k]);
      passed.forEach(reveal);
    };
  }

  /* ---------- Прокрутка: прогресс, наклон скриншота, поворот браслета, параллакс hero ---------- */
  var progressBar = document.querySelector('.read-progress i');
  var tiltEl = document.querySelector('[data-tilt]');
  var paraEl = document.querySelector('[data-parallax]');
  var heroStage = document.querySelector('.band-scene .bs-stage');
  var ticking = false;
  function frame() {
    ticking = false;
    var vh = window.innerHeight, st = window.scrollY || window.pageYOffset;
    var max = document.documentElement.scrollHeight - vh;
    if (progressBar) progressBar.style.transform = 'scaleX(' + (max > 0 ? clamp(st / max, 0, 1) : 0).toFixed(4) + ')';
    if (!motion) return;
    sweepPassed();
    var r, p;
    if (tiltEl) { r = tiltEl.getBoundingClientRect(); if (r.top < vh && r.bottom > 0) { p = clamp((vh - r.top) / (vh * 0.75), 0, 1); tiltEl.style.setProperty('--tp', p.toFixed(3)); } }
    if (paraEl) { r = paraEl.getBoundingClientRect(); if (r.top < vh && r.bottom > 0) { p = clamp((vh - r.top) / (vh + r.height), 0, 1); paraEl.style.setProperty('--sp', p.toFixed(3)); } }
    if (heroStage && st < vh * 1.2) heroStage.style.transform = 'translate3d(0,' + (st * 0.14).toFixed(1) + 'px,0)';
  }
  function requestFrame() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  if (progressBar || motion) {
    if (motion && tiltEl) tiltEl.style.setProperty('--tp', belowFold(tiltEl) ? '0' : '1');
    window.addEventListener('scroll', requestFrame, { passive: true });
    window.addEventListener('scrollend', function () { if (motion) { setTimeout(requestFrame, 130); } }, { passive: true });
    window.addEventListener('resize', requestFrame, { passive: true });
    frame();
  }

  /* ---------- Подсветка карточек под курсором ---------- */
  if (motion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    var spotSel = '.feat, .measures li, .pr, .stp, .proof-stats li', spotEl = null, spotX = 0, spotY = 0, spotQueued = false;
    document.addEventListener('pointermove', function (e) {
      var t = e.target.closest ? e.target.closest(spotSel) : null;
      if (!t) return;
      spotEl = t; spotX = e.clientX; spotY = e.clientY;
      if (spotQueued) return;
      spotQueued = true;
      requestAnimationFrame(function () {
        spotQueued = false;
        var r = spotEl.getBoundingClientRect();
        spotEl.style.setProperty('--mx', (spotX - r.left).toFixed(0) + 'px');
        spotEl.style.setProperty('--my', (spotY - r.top).toFixed(0) + 'px');
      });
    }, { passive: true });
  }

  /* ---------- Tabs (roles on landing) ---------- */
  document.querySelectorAll('[role="tablist"][data-tabs]').forEach(function (list) {
    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab); });
      tab.addEventListener('keydown', function (e) {
        var n = null;
        if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = tabs.length - 1;
        if (n !== null) { e.preventDefault(); select(tabs[n], true); }
      });
    });
  });

  /* ---------- Lead form (mailto — сайт не хранит введённые данные) ---------- */
  var form = document.getElementById('lead-form');
  if (form) {
    var status = document.getElementById('form-status');
    var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    var setErr = function (input, errId, msg) {
      var err = document.getElementById(errId);
      if (msg) { input.setAttribute('aria-invalid', 'true'); if (err) err.textContent = msg; }
      else { input.removeAttribute('aria-invalid'); if (err) err.textContent = ''; }
      return !msg;
    };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.className = 'form-status'; status.textContent = '';
      var f = form.elements;
      if (f.company && f.company.value) return;
      var ok = true;
      ok = setErr(f.name, 'e-name', f.name.value.trim().length < 2 ? 'Укажите имя и фамилию' : '') && ok;
      ok = setErr(f.org, 'e-org', f.org.value.trim().length < 2 ? 'Укажите организацию' : '') && ok;
      ok = setErr(f.email, 'e-email', !emailRe.test(f.email.value.trim()) ? 'Укажите корректный e-mail' : '') && ok;
      ok = setErr(f.consent, 'e-consent', !f.consent.checked ? 'Для отправки заявки нужно согласие на обработку персональных данных' : '') && ok;
      if (!ok) { var first = form.querySelector('[aria-invalid="true"]'); if (first) first.focus(); return; }
      var lines = ['Заявка на пилот AI Sports Precision Medicine', '', 'Имя: ' + f.name.value.trim(), 'Организация: ' + f.org.value.trim(), 'E-mail: ' + f.email.value.trim(), 'Роль: ' + (f.role.value || '—'), '', 'Сообщение:', f.message.value.trim() || '—', '', 'Согласие на обработку персональных данных: дано (' + new Date().toLocaleString('ru-RU') + ')'];
      window.location.href = 'mailto:' + CONFIG.email + '?subject=' + encodeURIComponent('Заявка на пилот — ' + f.org.value.trim()) + '&body=' + encodeURIComponent(lines.join('\n'));
      status.className = 'form-status ok';
      status.textContent = '';
      var s1 = document.createElement('span');
      s1.textContent = 'Открываем почтовое приложение с готовым письмом. Если оно не открылось — напишите на ';
      var a = document.createElement('a'); a.href = 'mailto:' + CONFIG.email; a.textContent = CONFIG.email;
      status.appendChild(s1); status.appendChild(a); status.appendChild(document.createTextNode('.'));
    });
    ['name', 'org', 'email'].forEach(function (n) { var el = form.elements[n]; if (el) el.addEventListener('input', function () { if (el.getAttribute('aria-invalid')) setErr(el, 'e-' + n, ''); }); });
    form.elements.consent.addEventListener('change', function () { if (this.checked) setErr(this, 'e-consent', ''); });
  }

  /* ---------- Legal: TOC + print ---------- */
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc ol a[href^="#"]'));
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var map = {};
    tocLinks.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var tio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting && map[en.target.id]) { tocLinks.forEach(function (l) { l.classList.remove('active'); }); map[en.target.id].classList.add('active'); } });
    }, { rootMargin: '-15% 0px -75% 0px' });
    Object.keys(map).forEach(function (id) { var h = document.getElementById(id); if (h) tio.observe(h); });
  }
  document.querySelectorAll('[data-print]').forEach(function (b) { b.addEventListener('click', function () { window.print(); }); });

  /* ---------- Cookie consent ---------- */
  function readConsent() {
    var raw = store.get(CONFIG.consentKey);
    if (!raw) return null;
    try {
      var c = JSON.parse(raw);
      if (!c || c.v !== CONFIG.consentVersion) return null;
      if ((Date.now() - (c.ts || 0)) / 86400000 > CONFIG.consentMaxAgeDays) return null;
      return c;
    } catch (e) { return null; }
  }
  function loadAnalytics() {
    if (document.querySelector('script[data-asp-analytics]')) return;
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    var s = document.createElement('script');
    s.defer = true; s.src = CONFIG.analyticsSrc; s.setAttribute('data-asp-analytics', '');
    document.head.appendChild(s);
  }
  function saveConsent(analytics) {
    var had = !!document.querySelector('script[data-asp-analytics]');
    store.set(CONFIG.consentKey, JSON.stringify({ v: CONFIG.consentVersion, necessary: true, analytics: !!analytics, ts: Date.now() }));
    if (analytics) loadAnalytics();
    else if (had) window.location.reload();
  }
  var banner = null;
  function buildBanner() {
    var el = document.createElement('section');
    el.className = 'cookie';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'false');
    el.setAttribute('aria-labelledby', 'cookie-title');
    el.setAttribute('aria-describedby', 'cookie-desc');
    el.innerHTML =
      '<h2 id="cookie-title">' + svg('cookie') + 'Мы бережём ваши данные</h2>' +
      '<p id="cookie-desc">Только необходимое хранилище браузера — для ваших настроек. С вашего согласия добавим обезличенную статистику посещений, без cookie и трекеров. <a href="/cookies">Подробнее</a>.</p>' +
      '<div class="cookie-prefs" id="cookie-prefs">' +
        '<div class="pref"><div><b>Необходимые</b><span>Работа сайта, ваш выбор и настройки кабинета. Всегда включены.</span></div><span class="switch"><input type="checkbox" checked disabled aria-label="Необходимые — всегда включены"><span class="track"></span></span></div>' +
        '<div class="pref"><div><b>Аналитика</b><span>Обезличенная статистика посещений (Vercel Web Analytics), без cookie.</span></div><span class="switch"><input type="checkbox" id="cookie-analytics" aria-label="Аналитика"><span class="track"></span></span></div>' +
      '</div>' +
      '<div class="cookie-actions">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="necessary">Только необходимые</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="customize" aria-expanded="false" aria-controls="cookie-prefs">Настроить</button>' +
        '<button type="button" class="btn btn-primary btn-sm" data-act="all">Принять все</button>' +
      '</div>';
    document.body.appendChild(el);
    var box = el.querySelector('#cookie-analytics');
    var cust = el.querySelector('[data-act="customize"]');
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]'); if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'customize') {
        var ex = el.classList.toggle('expanded');
        cust.setAttribute('aria-expanded', String(ex));
        cust.textContent = ex ? 'Сохранить выбор' : 'Настроить';
        if (!ex) { saveConsent(box.checked); hide(); } else box.focus();
        return;
      }
      saveConsent(act === 'all'); hide();
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') { saveConsent(false); hide(); } });
    return el;
  }
  function show(expand) {
    if (!banner) banner = buildBanner();
    var c = readConsent();
    var box = banner.querySelector('#cookie-analytics');
    box.checked = !!(c && c.analytics);
    banner.classList.toggle('expanded', !!expand);
    var cust = banner.querySelector('[data-act="customize"]');
    cust.setAttribute('aria-expanded', String(!!expand));
    cust.textContent = expand ? 'Сохранить выбор' : 'Настроить';
    window.requestAnimationFrame(function () { banner.classList.add('show'); });
    if (expand) setTimeout(function () { box.focus(); }, 60);
  }
  function hide() { if (banner) banner.classList.remove('show'); }
  var existing = readConsent();
  if (existing) { if (existing.analytics) loadAnalytics(); }
  else setTimeout(function () { show(false); }, 1100);
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-cookie-settings]')) show(true);
    if (e.target.closest('[data-cookie-reset]')) { store.remove(CONFIG.consentKey); show(true); }
  });
})();


/* Живые цифры у браслета на главной: лёгкое «дыхание» значений, чтобы сцена не выглядела картинкой */
(function () {
  'use strict';
  var els = document.querySelectorAll('[data-live]');
  if (!els.length || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  var base = { hr: 61, hrv: 64, spo2: 98, temp: 36.4 };
  function tick() {
    els.forEach(function (el) {
      var k = el.getAttribute('data-live');
      if (k === 'hr') el.textContent = String(base.hr + Math.round((Math.random() - 0.5) * 4));
      if (k === 'hrv') el.textContent = String(base.hrv + Math.round((Math.random() - 0.5) * 6));
      if (k === 'spo2') el.textContent = String(Math.random() < 0.8 ? 98 : 97);
      if (k === 'temp') el.textContent = (base.temp + (Math.random() - 0.5) * 0.2).toFixed(1).replace('.', ',');
    });
  }
  setInterval(tick, 1800);
})();
