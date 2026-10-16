/* AI Sports Precision Medicine — interactions
   Без сторонних библиотек. Аналитика загружается только после согласия пользователя. */
(function () {
  'use strict';

  var CONFIG = {
    email: 'ulasanuar@gmail.com',
    consentKey: 'asp_consent',
    consentVersion: 1,
    consentMaxAgeDays: 365,
    analyticsSrc: '/_vercel/insights/script.js'
  };

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Safe storage ---------- */
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    remove: function (k) { try { window.localStorage.removeItem(k); } catch (e) { /* noop */ } }
  };

  /* ---------- Year ---------- */
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  /* ---------- Header ---------- */
  var header = document.getElementById('header');
  function onScroll() { if (header) header.classList.toggle('scrolled', window.scrollY > 8); }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Mobile menu ---------- */
  var toggle = document.querySelector('.menu-toggle');
  var mobileNav = document.getElementById('mobile-nav');
  function setMenu(open) {
    document.body.classList.toggle('menu-open', open);
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    }
  }
  if (toggle && mobileNav) {
    toggle.addEventListener('click', function () { setMenu(!document.body.classList.contains('menu-open')); });
    mobileNav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('menu-open')) { setMenu(false); toggle.focus(); }
    });
    window.addEventListener('resize', function () { if (window.innerWidth > 1200) setMenu(false); });
  }

  /* ---------- Reveal + animated values ---------- */
  function animateRing(svgCircle) {
    var v = parseFloat(svgCircle.getAttribute('data-value')) || 0;
    var len = 213.6;
    svgCircle.style.strokeDashoffset = String(len - (len * v) / 100);
  }
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var suffix = el.getAttribute('data-suffix') || '';
    if (isNaN(target) || reduceMotion) { return; }
    var start = null, dur = 1400;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }

  var revealEls = document.querySelectorAll('.reveal, .bars, .module-demo, .hero-visual');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.classList.add('is-visible');
        el.querySelectorAll('circle.bar[data-value]').forEach(animateRing);
        el.querySelectorAll('[data-count]').forEach(countUp);
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add('is-visible');
      el.querySelectorAll('circle.bar[data-value]').forEach(animateRing);
    });
  }

  /* ---------- Active nav link ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav a[href^="#"]'));
  if (navLinks.length && 'IntersectionObserver' in window) {
    var map = {};
    navLinks.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var navIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = map[entry.target.id];
        if (!link) return;
        if (entry.isIntersecting) {
          navLinks.forEach(function (l) { l.classList.remove('active'); l.removeAttribute('aria-current'); });
          link.classList.add('active');
          link.setAttribute('aria-current', 'true');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(map).forEach(function (id) { var s = document.getElementById(id); if (s) navIo.observe(s); });
  }

  /* ---------- Tabs (WAI-ARIA) ---------- */
  var tablist = document.querySelector('[role="tablist"]');
  if (tablist) {
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) {
          panel.hidden = !on;
          if (on) { panel.classList.add('reveal', 'is-visible'); }
        }
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab, false); });
      tab.addEventListener('keydown', function (e) {
        var idx = null;
        if (e.key === 'ArrowRight') idx = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') idx = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') idx = 0;
        else if (e.key === 'End') idx = tabs.length - 1;
        if (idx !== null) { e.preventDefault(); select(tabs[idx], true); }
      });
    });
  }

  /* ---------- Lead form (mailto, без хранения на сайте) ---------- */
  var form = document.getElementById('lead-form');
  if (form) {
    var status = document.getElementById('form-status');
    var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    function setErr(input, errId, msg) {
      var err = document.getElementById(errId);
      if (msg) { input.setAttribute('aria-invalid', 'true'); if (err) err.textContent = msg; }
      else { input.removeAttribute('aria-invalid'); if (err) err.textContent = ''; }
      return !msg;
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.className = 'form-status';
      status.textContent = '';
      var f = form.elements;
      if (f.company && f.company.value) { return; } // honeypot
      var ok = true;
      ok = setErr(f.name, 'e-name', f.name.value.trim().length < 2 ? 'Укажите имя и фамилию' : '') && ok;
      ok = setErr(f.org, 'e-org', f.org.value.trim().length < 2 ? 'Укажите организацию' : '') && ok;
      ok = setErr(f.email, 'e-email', !emailRe.test(f.email.value.trim()) ? 'Укажите корректный e-mail' : '') && ok;
      ok = setErr(f.consent, 'e-consent', !f.consent.checked ? 'Для отправки заявки необходимо согласие на обработку персональных данных' : '') && ok;
      if (!ok) {
        var first = form.querySelector('[aria-invalid="true"]');
        if (first) first.focus();
        return;
      }
      var lines = [
        'Заявка на пилот AI Sports Precision Medicine',
        '',
        'Имя: ' + f.name.value.trim(),
        'Организация: ' + f.org.value.trim(),
        'E-mail: ' + f.email.value.trim(),
        'Роль: ' + (f.role.value || '—'),
        '',
        'Сообщение:',
        f.message.value.trim() || '—',
        '',
        'Согласие на обработку персональных данных: дано (' + new Date().toLocaleString('ru-RU') + ')'
      ];
      var href = 'mailto:' + CONFIG.email +
        '?subject=' + encodeURIComponent('Заявка на пилот — ' + f.org.value.trim()) +
        '&body=' + encodeURIComponent(lines.join('\n'));
      window.location.href = href;
      status.className = 'form-status ok';
      status.innerHTML = '';
      var s1 = document.createElement('span');
      s1.textContent = 'Открываем ваше почтовое приложение с готовым письмом. Если оно не открылось — напишите нам на ';
      var a = document.createElement('a');
      a.href = 'mailto:' + CONFIG.email;
      a.textContent = CONFIG.email;
      status.appendChild(s1);
      status.appendChild(a);
      status.appendChild(document.createTextNode('.'));
    });
    ['name', 'org', 'email'].forEach(function (n) {
      var el = form.elements[n];
      if (el) el.addEventListener('input', function () { if (el.getAttribute('aria-invalid')) setErr(el, 'e-' + n, ''); });
    });
    form.elements.consent.addEventListener('change', function () { if (this.checked) setErr(this, 'e-consent', ''); });
  }

  /* ---------- Legal TOC active section ---------- */
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc ol a[href^="#"]'));
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var tmap = {};
    tocLinks.forEach(function (a) { tmap[a.getAttribute('href').slice(1)] = a; });
    var tio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && tmap[entry.target.id]) {
          tocLinks.forEach(function (l) { l.classList.remove('active'); });
          tmap[entry.target.id].classList.add('active');
        }
      });
    }, { rootMargin: '-15% 0px -75% 0px' });
    Object.keys(tmap).forEach(function (id) { var h = document.getElementById(id); if (h) tio.observe(h); });
  }

  /* ---------- Print ---------- */
  document.querySelectorAll('[data-print]').forEach(function (b) {
    b.addEventListener('click', function () { window.print(); });
  });

  /* ---------- Cookie consent ---------- */
  function readConsent() {
    var raw = store.get(CONFIG.consentKey);
    if (!raw) return null;
    try {
      var c = JSON.parse(raw);
      if (!c || c.v !== CONFIG.consentVersion) return null;
      var age = (Date.now() - (c.ts || 0)) / 86400000;
      if (age > CONFIG.consentMaxAgeDays) return null;
      return c;
    } catch (e) { return null; }
  }
  function loadAnalytics() {
    if (document.querySelector('script[data-asp-analytics]')) return;
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    var s = document.createElement('script');
    s.defer = true;
    s.src = CONFIG.analyticsSrc;
    s.setAttribute('data-asp-analytics', '');
    document.head.appendChild(s);
  }
  function applyConsent(c) {
    if (c && c.analytics) loadAnalytics();
  }
  function saveConsent(analytics) {
    var c = { v: CONFIG.consentVersion, necessary: true, analytics: !!analytics, ts: Date.now() };
    store.set(CONFIG.consentKey, JSON.stringify(c));
    applyConsent(c);
    var hadAnalytics = !!document.querySelector('script[data-asp-analytics]');
    if (!analytics && hadAnalytics) { window.location.reload(); }
    return c;
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
      '<div class="cookie-head"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.5A9 9 0 1 1 11.5 3a3 3 0 0 0 4 3.5 3 3 0 0 0 5.5 6Z"/><circle cx="8.5" cy="10" r="1"/><circle cx="12" cy="15.5" r="1"/><circle cx="16" cy="12.5" r=".8"/></svg><h2 id="cookie-title">Мы бережём ваши данные</h2></div>' +
      '<p id="cookie-desc">Сайт использует только необходимое хранилище браузера, чтобы запомнить ваш выбор. С вашего согласия мы включим обезличенную статистику посещений без cookie и без рекламных трекеров. Подробнее — в <a href="cookies">Политике cookie</a>.</p>' +
      '<div class="cookie-prefs" id="cookie-prefs">' +
        '<div class="pref"><div><b>Необходимые</b><span>Работа сайта и запоминание вашего выбора. Всегда включены.</span></div><span class="switch"><input type="checkbox" checked disabled aria-label="Необходимые — всегда включены"><span class="track"></span></span></div>' +
        '<div class="pref"><div><b>Аналитика</b><span>Обезличенная статистика посещений (Vercel Web Analytics), без cookie.</span></div><span class="switch"><input type="checkbox" id="cookie-analytics" aria-label="Аналитика"><span class="track"></span></span></div>' +
      '</div>' +
      '<div class="cookie-actions">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="necessary">Только необходимые</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="customize" aria-expanded="false" aria-controls="cookie-prefs">Настроить</button>' +
        '<button type="button" class="btn btn-primary btn-sm" data-act="all">Принять все</button>' +
      '</div>';
    document.body.appendChild(el);

    var analyticsBox = el.querySelector('#cookie-analytics');
    var customizeBtn = el.querySelector('[data-act="customize"]');
    el.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'customize') {
        var expanded = el.classList.toggle('expanded');
        customizeBtn.setAttribute('aria-expanded', String(expanded));
        customizeBtn.textContent = expanded ? 'Сохранить выбор' : 'Настроить';
        if (!expanded) { saveConsent(analyticsBox.checked); hideBanner(); }
        else { analyticsBox.focus(); }
        return;
      }
      saveConsent(act === 'all');
      hideBanner();
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') { saveConsent(false); hideBanner(); } });
    return el;
  }
  function showBanner(expand) {
    if (!banner) banner = buildBanner();
    var c = readConsent();
    var box = banner.querySelector('#cookie-analytics');
    if (box) box.checked = !!(c && c.analytics);
    var customizeBtn = banner.querySelector('[data-act="customize"]');
    banner.classList.toggle('expanded', !!expand);
    customizeBtn.setAttribute('aria-expanded', String(!!expand));
    customizeBtn.textContent = expand ? 'Сохранить выбор' : 'Настроить';
    window.requestAnimationFrame(function () { banner.classList.add('show'); });
    if (expand) setTimeout(function () { if (box) box.focus(); }, 50);
  }
  function hideBanner() { if (banner) banner.classList.remove('show'); }

  var existing = readConsent();
  if (existing) { applyConsent(existing); }
  else { setTimeout(function () { showBanner(false); }, 900); }

  document.querySelectorAll('[data-cookie-settings]').forEach(function (b) {
    b.addEventListener('click', function () { showBanner(true); });
  });
  document.querySelectorAll('[data-cookie-reset]').forEach(function (b) {
    b.addEventListener('click', function () { store.remove(CONFIG.consentKey); showBanner(true); });
  });
})();
