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
    window.addEventListener('resize', function () { if (window.innerWidth > 1000) setMenu(false); });
  }

  /* ---------- Reveal ---------- */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
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
      '<p id="cookie-desc">Сайт использует только необходимое хранилище браузера: чтобы запомнить ваш выбор и настройки кабинета. С вашего согласия включим обезличенную статистику посещений — без cookie и рекламных трекеров. Подробнее — в <a href="/cookies">Политике cookie</a>.</p>' +
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

/* Карусель шагов на главной: кнопки «назад/вперёд» листают по одной карточке */
(function () {
  'use strict';
  var car = document.querySelector('[data-carousel]');
  if (!car) return;
  var smooth = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  function stepW() { var c = car.querySelector('.step'); return c ? c.getBoundingClientRect().width + 16 : 300; }
  document.querySelectorAll('[data-car]').forEach(function (b) {
    b.addEventListener('click', function () { car.scrollBy({ left: (b.getAttribute('data-car') === 'next' ? 1 : -1) * stepW(), behavior: smooth }); });
  });
  car.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); car.scrollBy({ left: stepW(), behavior: smooth }); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); car.scrollBy({ left: -stepW(), behavior: smooth }); }
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
