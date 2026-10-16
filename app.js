/* AI Sports Precision Medicine — демо-кабинет
   Одностраничное приложение без фреймворков. Данные вымышленные (data.js).
   Действия пользователя (добавленные спортсмены, чек-ины, решения по рекомендациям, настройки)
   хранятся только в localStorage этого браузера и никуда не отправляются. */
(function () {
  'use strict';

  var D = window.ASPData;
  var STORE = 'asp_app_v1';
  var EMAIL = 'ulasanuar@gmail.com';
  var view = document.getElementById('view');

  /* ======================= State ======================= */
  function defaults() {
    return {
      theme: 'dark', compact: false, role: 'doctor', offset: 0,
      custom: [], checkins: {}, decisions: {}, read: [],
      cols: { readiness: true, recovery: true, risk: true, sleep: true, hrv: false, status: true },
      sort: { key: 'risk', dir: 'desc' }, filter: 'all', range: 7,
      medSource: 'all', medAthlete: 'a03', twinAthlete: 'a03', recFilter: 'all', riskAthlete: 'a03'
    };
  }
  function load() {
    var s = defaults();
    try {
      var saved = JSON.parse(localStorage.getItem(STORE) || '{}');
      Object.keys(saved).forEach(function (k) { if (k in s) s[k] = saved[k]; });
      if (saved.cols) s.cols = Object.assign(defaults().cols, saved.cols);
    } catch (e) { /* ignore */ }
    return s;
  }
  var state = load();
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ } }

  var model = D.build({ custom: state.custom });
  function rebuild() { model = D.build({ custom: state.custom }); }
  var ui = { q: '', openId: null };

  var ROLES = {
    doctor: { name: 'Алия Касымова', initials: 'АК', title: 'Спортивный врач' },
    coach: { name: 'Серик Нуртаев', initials: 'СН', title: 'Главный тренер' },
    psych: { name: 'Мария Ли', initials: 'МЛ', title: 'Спортивный психолог' }
  };
  function can(what) {
    var r = state.role;
    if (what === 'labs') return r === 'doctor';
    if (what === 'psych') return r === 'psych';
    if (what === 'medical-decision') return r === 'doctor';
    return true;
  }

  /* ======================= Helpers ======================= */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function icon(n, cls) { return '<svg class="' + (cls || 'icon') + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
  var fmtDay = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
  var fmtFull = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  var fmtTime = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  function dDay(d) { return fmtDay.format(d).replace('.', ''); }
  function num(v, dec) { if (v == null || isNaN(v)) return '—'; return Number(v).toLocaleString('ru-RU', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }
  function hashCode(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function avClass(id) { return 'c' + ((hashCode(id) % 4) + 1); }
  function avatar(a, size) { return '<span class="avatar ' + (size || '') + ' ' + avClass(a.id) + '" aria-hidden="true">' + esc(a.initials) + '</span>'; }
  function scoreClass(v) { if (v == null) return 'muted'; return v >= 75 ? 'val-good' : v >= 60 ? 'val-mid' : v >= 45 ? 'val-warn' : 'val-bad'; }
  function riskClass(v) { if (v == null) return 'muted'; return v >= 40 ? 'val-bad' : v >= 25 ? 'val-warn' : 'val-good'; }
  function scoreColor(v) { return v == null ? 'var(--faint)' : v >= 75 ? 'var(--mint)' : v >= 60 ? 'var(--violet)' : v >= 45 ? 'var(--orange)' : 'var(--red)'; }
  var STATUS = {
    ready: ['ok', 'Готов к нагрузке'], attention: ['warn', 'Требует внимания'],
    recovery: ['info', 'Восстановление'], nodata: ['mute', 'Ожидает данных']
  };
  function statusBadge(st) { var s = STATUS[st] || STATUS.nodata; return '<span class="badge ' + s[0] + '">' + s[1] + '</span>'; }
  function byId(id) { return model.athletes.filter(function (a) { return a.id === id; })[0]; }
  function snapOf(a) { return D.snapshot(a, state.offset); }
  function allSnaps() { return model.athletes.map(function (a) { return { a: a, s: snapOf(a) }; }); }
  function asOfDate() { var d = new Date(model.today); d.setDate(d.getDate() - state.offset); return d; }
  function dateLabel() { return state.offset === 0 ? 'Сегодня, ' + dDay(asOfDate()) : state.offset === 1 ? 'Вчера, ' + dDay(asOfDate()) : dDay(asOfDate()) + ' ' + asOfDate().getFullYear(); }
  function plural(n, one, few, many) { var m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return one; if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few; return many; }

  function team() {
    var list = allSnaps();
    var valid = list.filter(function (x) { return x.s.status !== 'nodata'; });
    function avg(k) { return Math.round(D.mean(valid.map(function (x) { return x.s[k]; }))); }
    function avgPrev(k) { return Math.round(D.mean(valid.map(function (x) { return x.s[k]; }).filter(function (v) { return v != null; }))); }
    var series = function (k, days) {
      var out = [];
      for (var i = days - 1; i >= 0; i--) {
        var off = state.offset + i;
        var vals = model.athletes.map(function (a) { return D.snapshot(a, off)[k]; }).filter(function (v) { return v != null; });
        out.push(Math.round(D.mean(vals)));
      }
      return out;
    };
    var labels = function (days) { var out = []; for (var i = days - 1; i >= 0; i--) { var d = new Date(model.today); d.setDate(d.getDate() - state.offset - i); out.push(d); } return out; };
    return {
      list: list, total: list.length, valid: valid.length,
      readiness: avg('readiness'), recovery: avg('recovery'),
      prevReadiness: avgPrev('prevReadiness'), prevRecovery: avgPrev('prevRecovery'),
      attention: list.filter(function (x) { return x.s.status === 'attention'; }),
      ready: list.filter(function (x) { return x.s.status === 'ready'; }),
      recovering: list.filter(function (x) { return x.s.status === 'recovery'; }),
      nodata: list.filter(function (x) { return x.s.status === 'nodata'; }),
      signals: list.filter(function (x) { return x.s.signal; }).sort(function (p, q) { return (q.s.risk || 0) - (p.s.risk || 0); }),
      series: series, labels: labels
    };
  }

  /* ======================= Recommendations & notifications ======================= */
  function buildRecs() {
    var t = team(), recs = [];
    t.list.forEach(function (x) {
      var a = x.a, s = x.s, kinds = (s.flags || []).map(function (f) { return f.k; });
      var why = (s.flags || []).map(function (f) { return f.t; });
      if (kinds.indexOf('load') > -1 || kinds.indexOf('throws') > -1) {
        recs.push({ id: 'load-' + a.id, a: a, cat: 'Нагрузка', ic: 'load', tone: 'o', owner: 'coach', prio: 'Высокий', title: 'Скорректировать нагрузку', text: 'снизить интенсивность на 15% и исключить бросковую нагрузку на 48 часов.', why: why });
      }
      if (kinds.indexOf('sleep') > -1) {
        recs.push({ id: 'sleep-' + a.id, a: a, cat: 'Восстановление', ic: 'sleep', tone: '', owner: 'any', prio: 'Средний', title: 'Сфокусироваться на восстановлении', text: 'увеличить сон на 45 минут и добавить активное восстановление.', why: why });
      }
      if (kinds.indexOf('hrv') > -1 && kinds.indexOf('load') < 0 && kinds.indexOf('throws') < 0) {
        recs.push({ id: 'hrv-' + a.id, a: a, cat: 'Медицина', ic: 'stetho', tone: 'o', owner: 'doctor', prio: 'Высокий', title: 'Осмотр спортивного врача', text: 'HRV ниже личной нормы несколько дней подряд — оценка врача до следующей интенсивной тренировки.', why: why });
      }
      if (kinds.indexOf('crp') > -1) {
        recs.push({ id: 'crp-' + a.id, a: a, cat: 'Медицина', ic: 'stetho', tone: 'o', owner: 'doctor', prio: 'Высокий', title: 'Оценка воспалительного маркера', text: 'СРБ выше референса — осмотр; решение о допуске к тренировкам принимает врач.', why: why });
      }
      if (kinds.indexOf('vitd') > -1) {
        recs.push({ id: 'vitd-' + a.id, a: a, cat: 'Питание', ic: 'food', tone: 'm', owner: 'doctor', prio: 'Плановый', title: 'Витамин D и запасы железа', text: 'обсудить с нутрициологом коррекцию питания; повторный анализ через 6–8 недель.', why: why });
      }
    });
    var loadAvg = D.mean(t.list.filter(function (x) { return x.s.acwr; }).map(function (x) { return x.s.acwr; }));
    recs.push({ id: 'team-food', a: null, cat: 'Питание', ic: 'food', tone: 'm', owner: 'any', prio: 'Плановый', title: 'Обновить план питания', text: 'адаптировать питание к предстоящему тренировочному микроциклу' + (loadAvg > 1.02 ? ' (средняя нагрузка команды +' + Math.round((loadAvg - 1) * 100) + '%).' : '.'), why: ['Микроцикл', 'Средний ACWR ' + num(loadAvg, 2)] });
    recs.forEach(function (r) { var d = state.decisions[r.id]; r.status = d ? d.status : 'pending'; r.decision = d || null; });
    return recs;
  }
  function pendingCount() { return buildRecs().filter(function (r) { return r.status === 'pending'; }).length; }

  function buildNotes() {
    var t = team(), notes = [];
    t.attention.concat(t.recovering.filter(function (x) { return x.s.signal; })).forEach(function (x, i) {
      notes.push({ id: 'n-' + x.a.id + '-' + state.offset, kind: 'warn', title: x.a.short, text: (x.s.signal || 'Отклонения от личной нормы') + ' · требует внимания врача', time: '07:' + (10 + i * 7), go: function () { openAthlete(x.a.id); } });
    });
    t.nodata.forEach(function (x) { notes.push({ id: 'n-nd-' + x.a.id, kind: 'warn', title: 'Нет данных: ' + x.a.short, text: x.a.custom ? 'Новый профиль — подключите устройство' : 'Браслет не синхронизировался более 48 часов', time: '06:55', go: function () { openAthlete(x.a.id); } }); });
    notes.push({ id: 'n-labs', kind: 'info', title: 'Загружены результаты анализов', text: 'Лабораторная панель от ' + dDay(model.athletes[0].labDate) + ' · 23 спортсмена', time: 'вчера', go: function () { go('medical'); } });
    var noCheck = model.athletes.filter(function (a) { return !(state.checkins[a.id] || []).length; }).length;
    notes.push({ id: 'n-check', kind: 'info', title: 'Утренний чек-ин', text: 'Не заполнили ' + noCheck + ' ' + plural(noCheck, 'спортсмен', 'спортсмена', 'спортсменов'), time: '08:00', go: function () { go('twin'); } });
    notes.push({ id: 'n-report', kind: 'ok', title: 'Еженедельный отчёт готов', text: 'Состояние команды — CSV для Excel', time: 'пн', go: function () { go('reports'); } });
    notes.forEach(function (n) { n.unread = state.read.indexOf(n.id) < 0; });
    return notes;
  }

  /* ======================= Charts ======================= */
  var CHARTS = {};
  var chartSeq = 0;
  function lineChart(o) {
    var id = 'ch' + (++chartSeq);
    var W = 640, H = o.height || 220, pl = 34, pr = 12, pt = 12, pb = 26;
    var all = [];
    o.series.forEach(function (s) { s.values.forEach(function (v) { if (v != null) all.push(v); }); });
    var min = o.min != null ? o.min : Math.floor((Math.min.apply(null, all) - 5) / 5) * 5;
    var max = o.max != null ? o.max : Math.ceil((Math.max.apply(null, all) + 5) / 5) * 5;
    if (max === min) max = min + 10;
    var n = o.labels.length;
    var step = (W - pl - pr) / Math.max(1, n - 1);
    function x(i) { return pl + i * step; }
    function y(v) { return pt + (H - pt - pb) * (1 - (v - min) / (max - min)); }
    var g = '';
    for (var k = 0; k <= 4; k++) {
      var val = min + (max - min) * k / 4, yy = y(val);
      g += '<line class="grid-line" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy + '" y2="' + yy + '" stroke-dasharray="' + (k === 0 ? '0' : '3 4') + '"/>';
      g += '<text class="axis-text" x="' + (pl - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + ((max - min) >= 8 ? Math.round(val) : num(val, 1)) + '</text>';
    }
    var every = n > 20 ? 5 : n > 10 ? 2 : 1;
    o.labels.forEach(function (d, i) { if (i % every === 0 || i === n - 1) g += '<text class="axis-text" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + dDay(d) + '</text>'; });
    var paths = '';
    o.series.forEach(function (s, si) {
      var dpath = '', started = false;
      s.values.forEach(function (v, i) { if (v == null) { started = false; return; } dpath += (started ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); started = true; });
      if (s.area) {
        var first = s.values.findIndex(function (v) { return v != null; });
        var lastI = s.values.length - 1;
        paths += '<path d="' + dpath + 'L' + x(lastI) + ' ' + (H - pb) + 'L' + x(first) + ' ' + (H - pb) + 'Z" style="fill:' + s.color + ';opacity:.1"/>';
      }
      paths += '<path d="' + dpath + '" fill="none" style="stroke:' + s.color + '" stroke-width="' + (s.width || 2.2) + '" stroke-linecap="round" stroke-linejoin="round"' + (s.dash ? ' stroke-dasharray="5 5"' : '') + '/>';
      if (!s.dash) {
        var li = s.values.length - 1; while (li > 0 && s.values[li] == null) li--;
        if (s.values[li] != null) paths += '<circle cx="' + x(li) + '" cy="' + y(s.values[li]) + '" r="4" style="fill:' + s.color + '" stroke="var(--panel)" stroke-width="2"/>';
      }
    });
    CHARTS[id] = { o: o, x: x, y: y, W: W, H: H, pl: pl, pr: pr, step: step, n: n, pt: pt, pb: pb };
    var legend = '<div class="chart-legend">' + o.series.map(function (s) { return '<span><i class="' + (s.dash ? 'dash' : '') + '" style="background:' + s.color + ';color:' + s.color + '"></i>' + esc(s.name) + '</span>'; }).join('') + '</div>';
    return (o.legend === false ? '' : legend) + '<div class="chart-wrap" data-chart="' + id + '"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label || 'График') + '">' + g + paths +
      '<line class="guide" x1="0" x2="0" y1="' + pt + '" y2="' + (H - pb) + '" style="stroke:var(--line-strong)" visibility="hidden"/><g class="dots"></g>' +
      '<rect x="' + pl + '" y="0" width="' + (W - pl - pr) + '" height="' + H + '" fill="transparent" class="hit"/></svg><div class="chart-tip" hidden></div></div>';
  }
  function mountCharts(root) {
    (root || view).querySelectorAll('.chart-wrap[data-chart]').forEach(function (wrap) {
      var c = CHARTS[wrap.getAttribute('data-chart')];
      if (!c) return;
      var svg = wrap.querySelector('svg'), tip = wrap.querySelector('.chart-tip'), guide = svg.querySelector('.guide'), dots = svg.querySelector('.dots');
      function show(evt) {
        var r = svg.getBoundingClientRect();
        var px = (evt.clientX - r.left) / r.width * c.W;
        var i = Math.max(0, Math.min(c.n - 1, Math.round((px - c.pl) / c.step)));
        var gx = c.x(i);
        guide.setAttribute('x1', gx); guide.setAttribute('x2', gx); guide.setAttribute('visibility', 'visible');
        var html = '<b>' + fmtFull.format(c.o.labels[i]) + '</b>', dh = '';
        c.o.series.forEach(function (s) {
          var v = s.values[i];
          html += '<div><i style="background:' + s.color + '"></i>' + esc(s.name) + ': <strong>' + (v == null ? '—' : num(v, s.dec || 0)) + (s.unit || '') + '</strong></div>';
          if (v != null) dh += '<circle cx="' + gx + '" cy="' + c.y(v) + '" r="4.5" style="fill:' + s.color + '" stroke="var(--panel)" stroke-width="2"/>';
        });
        dots.innerHTML = dh;
        tip.innerHTML = html; tip.hidden = false;
        var left = (gx / c.W) * r.width;
        left = Math.max(70, Math.min(r.width - 70, left));
        tip.style.left = left + 'px';
        tip.style.top = (c.pt / c.H * r.height + 8) + 'px';
      }
      function hide() { tip.hidden = true; guide.setAttribute('visibility', 'hidden'); dots.innerHTML = ''; }
      svg.addEventListener('pointermove', show);
      svg.addEventListener('pointerdown', show);
      svg.addEventListener('pointerleave', hide);
    });
  }
  function sparkline(values, color) {
    var W = 96, H = 34, v = values.filter(function (x) { return x != null; });
    if (v.length < 2) return '';
    var min = Math.min.apply(null, v), max = Math.max.apply(null, v); if (max === min) { max += 1; min -= 1; }
    var pts = values.map(function (val, i) { return val == null ? null : [(i / (values.length - 1)) * (W - 4) + 2, 4 + (H - 8) * (1 - (val - min) / (max - min))]; }).filter(Boolean);
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('');
    var last = pts[pts.length - 1];
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><path d="' + d + 'L' + last[0] + ' ' + H + 'L2 ' + H + 'Z" style="fill:' + color + ';opacity:.12"/><path d="' + d + '" fill="none" style="stroke:' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="3" style="fill:' + color + '"/></svg>';
  }
  function radar(axes) {
    var S = 340, c = S / 2, R = 100, n = axes.length, g = '';
    function pt(i, r) { var ang = -Math.PI / 2 + (2 * Math.PI * i) / n; return [c + Math.cos(ang) * r, c + Math.sin(ang) * r]; }
    [0.25, 0.5, 0.75, 1].forEach(function (k) {
      g += '<polygon points="' + axes.map(function (_, i) { return pt(i, R * k).join(','); }).join(' ') + '" fill="none" style="stroke:var(--line)"/>';
    });
    axes.forEach(function (a, i) { var p = pt(i, R); g += '<line x1="' + c + '" y1="' + c + '" x2="' + p[0] + '" y2="' + p[1] + '" style="stroke:var(--line)"/>'; });
    var poly = axes.map(function (a, i) { return pt(i, R * Math.max(0.05, (a.v == null ? 0 : a.v) / 100)).join(','); }).join(' ');
    g += '<polygon points="' + poly + '" style="fill:var(--violet);fill-opacity:.18;stroke:var(--violet)" stroke-width="2" stroke-linejoin="round"/>';
    axes.forEach(function (a, i) {
      var p = pt(i, R * Math.max(0.05, (a.v == null ? 0 : a.v) / 100));
      g += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.5" style="fill:var(--orange)"/>';
      var lp = pt(i, R + 26);
      g += '<text x="' + lp[0] + '" y="' + (lp[1] - 4) + '" text-anchor="middle">' + esc(a.name) + '</text><text x="' + lp[0] + '" y="' + (lp[1] + 10) + '" text-anchor="middle" style="font-weight:700;fill:var(--text)">' + (a.v == null ? '—' : a.v) + '</text>';
    });
    return '<svg class="radar" viewBox="0 0 ' + S + ' ' + S + '" role="img" aria-label="Профиль спортсмена по шести измерениям">' + g + '</svg>';
  }

  /* ======================= Overlays: modal, popover, drawer, toast ======================= */
  var lastFocus = null;
  function trapKeys(container, onClose) {
    return function (e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;
      var f = container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
  }
  function openModal(html, opts) {
    closePopover(); closeModal();
    opts = opts || {};
    lastFocus = document.activeElement;
    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.id = 'modal-root';
    ov.innerHTML = '<div class="modal ' + (opts.cls || '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
      '<button class="icon-btn modal-close" type="button" data-close aria-label="Закрыть">' + icon('x') + '</button>' + html + '</div>';
    document.body.appendChild(ov);
    var m = ov.querySelector('.modal');
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) closeModal(); });
    m.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeModal(); });
    m.addEventListener('keydown', trapKeys(m, closeModal));
    if (opts.mount) opts.mount(m);
    var f = m.querySelector(opts.focus || 'input, select, textarea, button:not(.modal-close)');
    setTimeout(function () { (f || m.querySelector('button')).focus(); }, 20);
    return m;
  }
  function closeModal() {
    var ov = document.getElementById('modal-root');
    if (ov) { ov.remove(); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  }
  var pop = null, popAnchor = null;
  function openPopover(anchor, html, opts) {
    var same = popAnchor === anchor;
    closePopover();
    if (same) return null;
    opts = opts || {};
    pop = document.createElement('div');
    pop.className = 'popover ' + (opts.cls || '');
    pop.setAttribute('role', opts.role || 'menu');
    pop.innerHTML = html;
    document.body.appendChild(pop);
    popAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    var r = anchor.getBoundingClientRect(), pw = pop.offsetWidth;
    var left = Math.min(window.innerWidth - pw - 12, Math.max(12, opts.alignLeft ? r.left : r.right - pw));
    pop.style.left = left + 'px';
    pop.style.top = (r.bottom + 8) + 'px';
    pop.style.maxHeight = (window.innerHeight - r.bottom - 24) + 'px';
    pop.style.overflowY = 'auto';
    pop.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closePopover(); anchor.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        var items = Array.prototype.slice.call(pop.querySelectorAll('.menu-item:not([disabled]), .notif-item, input'));
        var i = items.indexOf(document.activeElement);
        e.preventDefault();
        var ni = e.key === 'ArrowDown' ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1);
        if (items[ni]) items[ni].focus();
      }
    });
    if (opts.mount) opts.mount(pop);
    var f = pop.querySelector('[aria-checked="true"], .menu-item, .notif-item, button, input');
    if (f) setTimeout(function () { f.focus(); }, 10);
    return pop;
  }
  function closePopover() {
    if (pop) { pop.remove(); pop = null; }
    if (popAnchor) { popAnchor.setAttribute('aria-expanded', 'false'); popAnchor = null; }
  }
  document.addEventListener('mousedown', function (e) {
    if (pop && !pop.contains(e.target) && popAnchor && !popAnchor.contains(e.target)) closePopover();
  });
  window.addEventListener('resize', closePopover);

  function toast(msg) {
    var box = document.getElementById('toasts');
    var t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = icon('check', 'icon-sm') + '<span>' + esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
  }

  /* ======================= Shell ======================= */
  var PAGES = {
    overview: ['Обзор команды', 'Полная картина здоровья команды. Точные решения каждый день.'],
    athletes: ['Спортсмены', 'Единый профиль здоровья и готовности каждого спортсмена.'],
    twin: ['Цифровой двойник', 'Связанные данные вместо разрозненных показателей.'],
    medical: ['Медицинские данные', 'Лабораторные показатели и данные носимых устройств в одном месте.'],
    analytics: ['AI-аналитика', 'Ранние сигналы относительно личной нормы спортсмена.'],
    recommendations: ['Рекомендации', 'Персональные действия на сегодня. Решение принимает специалист.'],
    reports: ['Отчёты', 'Выгрузка показателей команды в CSV для Excel.'],
    settings: ['Настройки', 'Рабочее пространство, роли доступа и источники данных.'],
    about: ['О платформе', 'От проверенных рыночных механик — к национальному клиническому контуру.'],
    help: ['Помощь и поддержка', 'Как пользоваться кабинетом, горячие клавиши и контакты.']
  };
  var current = { page: 'overview', arg: null };

  function applyTheme() {
    var t = state.theme;
    if (t === 'system') t = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#f5f3fa' : '#0b0814');
    var ti = document.getElementById('theme-icon');
    if (ti) ti.setAttribute('href', t === 'light' ? '#i-moon' : '#i-sun');
    if (state.compact) document.documentElement.setAttribute('data-density', 'compact'); else document.documentElement.removeAttribute('data-density');
  }
  function updateShell() {
    var r = ROLES[state.role];
    document.getElementById('me-initials').textContent = r.initials;
    document.getElementById('me-name').textContent = r.name;
    document.getElementById('me-role').textContent = r.title;
    document.getElementById('date-label').textContent = dateLabel();
    var pc = pendingCount(), rc = document.getElementById('rec-count');
    rc.textContent = pc; rc.hidden = pc === 0;
    document.getElementById('bell-dot').hidden = !buildNotes().some(function (n) { return n.unread; });
    document.querySelectorAll('.nav-item[data-route]').forEach(function (a) {
      if (a.getAttribute('data-route') === current.page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.getElementById('crumb').textContent = PAGES[current.page][0];
    document.title = PAGES[current.page][0] + ' — демо-кабинет AI Sports';
  }
  function go(page, arg) { location.hash = '#/' + page + (arg ? '/' + arg : ''); }

  function pageHead(page, extra) {
    var p = PAGES[page];
    return '<div class="page-head"><div><p class="kicker"><span class="dot"></span>Национальная платформа здоровья спортсменов</p><h1>' + p[0] + '</h1><p>' + p[1] + '</p></div>' +
      '<div class="page-actions">' + (extra || '') + '<button class="btn btn-primary" type="button" data-action="report">' + icon('download') + '<span class="lbl">Создать отчёт</span></button></div></div>';
  }
  function footerStrip() {
    return '<div class="footer-strip"><span>' + icon('shield', 'icon-sm') + 'Защищённая среда · демонстрационные данные</span><span>AI помогает. Решение принимает специалист.</span><a href="#/about">Стратегия платформы ' + icon('arrow', 'icon-sm') + '</a></div>';
  }

  function render() {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('/');
    var page = PAGES[parts[0]] ? parts[0] : 'overview';
    var arg = parts[1] ? decodeURIComponent(parts[1]) : null;
    current = { page: page, arg: arg };
    if (page === 'twin' && arg && byId(arg)) state.twinAthlete = arg;
    if (page === 'medical' && arg && byId(arg)) state.medAthlete = arg;
    CHARTS = {};
    var html = '';
    try {
      html = RENDER[page]();
    } catch (err) {
      html = '<div class="panel panel-body"><b>Не удалось отобразить раздел.</b><p class="muted">Попробуйте сбросить демо-данные в настройках.</p></div>';
      if (window.console) console.error(err);
    }
    view.innerHTML = html;
    mountCharts(view);
    if (MOUNT[page]) MOUNT[page]();
    updateShell();
    document.body.classList.remove('side-open');
    var st = document.querySelector('.side-toggle');
    if (st) st.setAttribute('aria-expanded', 'false');
  }

  /* ======================= Pages ======================= */
  var RENDER = {}, MOUNT = {};

  function athleteRow(x, opts) {
    var a = x.a, s = x.s;
    return '<button class="list-row" type="button" data-open="' + a.id + '">' + avatar(a) +
      '<span class="grow"><span class="person" style="display:block"><b>' + esc(a.short) + '</b><span>' + esc(s.signal || a.posName) + '</span></span>' +
      (opts && opts.flags && s.flags.length ? '<span class="flag-line">' + s.flags.slice(0, 3).map(function (f) { return '<span>' + esc(f.t) + '</span>'; }).join('<span aria-hidden="true">·</span>') + '</span>' : '') +
      '</span>' + (opts && opts.risk ? '<span class="' + riskClass(s.risk) + ' num" style="font-weight:700">' + (s.risk == null ? '—' : s.risk + '%') + '</span>' : '') + icon('right', 'icon-sm chev') + '</button>';
  }

  function teamTable(rows, cols, opts) {
    opts = opts || {};
    var colDefs = [
      { k: 'readiness', t: 'Готовность' }, { k: 'recovery', t: 'Восстановление' }, { k: 'risk', t: 'Риск травмы' },
      { k: 'sleep', t: 'Сон' }, { k: 'hrv', t: 'HRV' }, { k: 'status', t: 'Статус' }
    ].filter(function (c) { return cols[c.k]; });
    function th(k, t) {
      if (!opts.sortable) return '<th scope="col">' + t + '</th>';
      var on = state.sort.key === k;
      return '<th scope="col" aria-sort="' + (on ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') + '"><button type="button" data-sort="' + k + '">' + t + (on ? icon(state.sort.dir === 'asc' ? 'up' : 'dn', 'icon-sm') : '') + '</button></th>';
    }
    var head = '<tr>' + th('name', 'Спортсмен') + colDefs.map(function (c) { return th(c.k, c.t); }).join('') + '<th scope="col"><span class="sr-only">Открыть</span></th></tr>';
    var body = rows.map(function (x) {
      var a = x.a, s = x.s;
      var cells = colDefs.map(function (c) {
        if ((c.k === 'recovery' || c.k === 'readiness') && opts.lite) return '<td class="num ' + scoreClass(s[c.k]) + '" style="font-weight:650">' + (s[c.k] == null ? '—' : s[c.k]) + '<span class="muted" style="font-weight:400"> /100</span></td>';
        if (c.k === 'readiness' || c.k === 'recovery') {
          var v = s[c.k];
          return '<td><span class="bar"><b class="num ' + scoreClass(v) + '" style="min-width:24px">' + (v == null ? '—' : v) + '</b><span class="bar-track"><i style="width:' + (v || 0) + '%;background:' + scoreColor(v) + '"></i></span></span></td>';
        }
        if (c.k === 'risk') return '<td class="num ' + riskClass(s.risk) + '" style="font-weight:650">' + (s.risk == null ? '—' : s.risk + '%') + '</td>';
        if (c.k === 'sleep') return '<td class="num' + (s.sleep != null && s.sleep < 7 ? ' val-warn' : '') + '">' + D.fmtHours(s.sleep) + '</td>';
        if (c.k === 'hrv') return '<td class="num">' + (s.hrv == null ? '—' : num(s.hrv) + ' мс') + (s.hrvPct != null ? ' <span class="' + (s.hrvPct <= -15 ? 'val-warn' : 'muted') + '" style="font-size:12px">' + (s.hrvPct > 0 ? '+' : '') + s.hrvPct + '%</span>' : '') + '</td>';
        if (c.k === 'status') return '<td>' + statusBadge(s.status) + '</td>';
        return '<td></td>';
      }).join('');
      return '<tr data-open="' + a.id + '" tabindex="0" aria-label="Открыть профиль: ' + esc(a.short) + '"><td><span class="person">' + avatar(a) + '<span><b>' + esc(a.short) + '</b><span>' + esc(a.posName) + ' · № ' + esc(a.num) + (a.custom ? ' · добавлен вами' : '') + '</span></span></span></td>' + cells + '<td>' + icon('right', 'icon-sm') + '</td></tr>';
    }).join('');
    if (!rows.length) body = '<tr><td colspan="' + (colDefs.length + 2) + '"><div class="empty">' + icon('search') + 'Никого не нашли. Измените фильтр или запрос.</div></td></tr>';
    return '<div class="table-wrap"><table class="table"><caption class="sr-only">Спортсмены команды</caption><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }

  function filterRows(list, f) {
    return list.filter(function (x) {
      if (f === 'ready') return x.s.status === 'ready';
      if (f === 'attention') return x.s.status === 'attention';
      if (f === 'recovery') return x.s.status === 'recovery';
      if (f === 'nodata') return x.s.status === 'nodata';
      return true;
    });
  }
  function sortRows(list, by) {
    var srt = by || state.sort;
    var k = srt.key, dir = srt.dir === 'asc' ? 1 : -1;
    var order = { attention: 0, recovery: 1, ready: 2, nodata: 3 };
    return list.slice().sort(function (p, q) {
      var a, b;
      if (k === 'name') { return p.a.short.localeCompare(q.a.short, 'ru') * dir; }
      if (k === 'status') { a = order[p.s.status]; b = order[q.s.status]; }
      else { a = p.s[k]; b = q.s[k]; }
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return (a - b) * dir;
    });
  }
  function filterTabs(t, f) {
    var tabs = [['all', 'Все', t.total], ['ready', 'Готовы', t.ready.length], ['attention', 'Требуют внимания', t.attention.length], ['recovery', 'Восстановление', t.recovering.length], ['nodata', 'Нет данных', t.nodata.length]];
    return '<div class="seg" role="group" aria-label="Фильтр по статусу">' + tabs.map(function (x) { return '<button type="button" data-filter="' + x[0] + '" aria-pressed="' + (f === x[0]) + '">' + x[1] + ' <span class="muted num">' + x[2] + '</span></button>'; }).join('') + '</div>';
  }

  /* ---------- Overview ---------- */
  RENDER.overview = function () {
    var t = team();
    var rDays = state.range;
    var labels = t.labels(rDays), sr = t.series('readiness', rDays), sv = t.series('recovery', rDays);
    var dR = t.readiness - t.prevReadiness, dV = t.recovery - t.prevRecovery;
    function delta(d) { var c = d > 0 ? 'up' : d < 0 ? 'down' : 'flat'; return '<span class="delta ' + c + '">' + (d > 0 ? icon('up', 'icon-sm') : d < 0 ? icon('dn', 'icon-sm') : '') + (d > 0 ? '+' : '') + d + '</span>'; }
    var riskSeries = t.series('risk', 7);
    var readyShare = Math.round(t.ready.length / Math.max(1, t.total) * 100);
    var insight;
    var firstR = sr[0], lastR = sr[sr.length - 1], ch = lastR - firstR;
    if (ch >= 2) insight = 'Команда на верном пути: готовность выросла на <b>' + ch + ' ' + plural(ch, 'пункт', 'пункта', 'пунктов') + '</b> за период.';
    else if (ch <= -2) insight = 'Готовность снизилась на <b>' + Math.abs(ch) + ' ' + plural(Math.abs(ch), 'пункт', 'пункта', 'пунктов') + '</b> за период — проверьте спортсменов с ранними сигналами.';
    else insight = 'Готовность команды стабильна за период: <b>' + lastR + '/100</b>.';

    var recs = buildRecs().filter(function (r) { return r.status === 'pending'; }).slice(0, 3);
    var top5 = sortRows(t.list, { key: 'risk', dir: 'desc' }).slice(0, 5);

    return pageHead('overview') +
      '<section class="team-hero" aria-label="Команда">' +
        '<svg class="hero-waves" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="var(--violet)" stroke-width="1.2" opacity=".55"><path d="M0 60 C60 40 100 80 160 60 S260 40 320 60 400 70 400 70"/><path d="M0 90 C60 70 100 110 160 90 S260 70 320 90 400 100 400 100"/><path d="M0 120 C60 100 100 140 160 120 S260 100 320 120 400 130 400 130"/><path d="M0 150 C60 130 100 170 160 150 S260 130 320 150 400 160 400 160"/></g></svg>' +
        '<div style="position:relative"><div class="tags"><span class="badge info plain">' + icon('wave', 'icon-sm') + 'Водное поло</span><span class="badge plain">Мужская сборная</span><span class="badge ok">Пилот активен</span></div>' +
        '<h2>Сильная команда начинается со здоровья каждого.</h2><p>Цифровой двойник спортсмена — от данных к действию.</p>' +
        '<div class="meta-row"><span>' + icon('users', 'icon-sm') + t.total + ' ' + plural(t.total, 'спортсмен', 'спортсмена', 'спортсменов') + '</span><span>' + icon('pin', 'icon-sm') + 'Казахстан</span><span>' + icon('cal', 'icon-sm') + 'Срез: ' + fmtFull.format(asOfDate()) + '</span></div></div>' +
        '<span class="hero-twin">' + icon('shield', 'icon-sm') + 'Digital Athlete Twin</span>' +
      '</section>' +
      '<div class="grid g-4">' +
        '<article class="panel kpi"><div class="kpi-top"><span>Готовность команды</span><span class="kpi-ic v">' + icon('activity', 'icon-sm') + '</span></div><div class="kpi-mid"><span class="kpi-val">' + t.readiness + '<small>/ 100</small></span>' + sparkline(t.series('readiness', 7), 'var(--violet)') + '</div><div class="kpi-foot">' + delta(dR) + 'к прошлой неделе</div></article>' +
        '<article class="panel kpi"><div class="kpi-top"><span>Восстановление</span><span class="kpi-ic m">' + icon('heart', 'icon-sm') + '</span></div><div class="kpi-mid"><span class="kpi-val">' + t.recovery + '<small>/ 100</small></span>' + sparkline(t.series('recovery', 7), 'var(--mint)') + '</div><div class="kpi-foot">' + delta(dV) + 'к прошлой неделе</div></article>' +
        '<article class="panel kpi"><div class="kpi-top"><span>Риск травм</span><span class="kpi-ic o">' + icon('shield', 'icon-sm') + '</span></div><div class="kpi-mid"><span class="kpi-val">' + t.attention.length + '<small>' + plural(t.attention.length, 'спортсмен', 'спортсмена', 'спортсменов') + '</small></span>' + sparkline(riskSeries, 'var(--orange)') + '</div><div class="kpi-foot"><span class="delta down">' + t.signals.length + '</span>с ранними сигналами</div></article>' +
        '<article class="panel kpi"><div class="kpi-top"><span>Готовы к тренировкам</span><span class="kpi-ic v">' + icon('users', 'icon-sm') + '</span></div><div class="kpi-mid"><span class="kpi-val">' + t.ready.length + '<small>/ ' + t.total + '</small></span></div><div class="kpi-foot"><span class="delta flat">' + readyShare + '%</span>состава команды</div></article>' +
      '</div>' +
      '<div class="grid g-main">' +
        '<section class="panel" aria-labelledby="dyn-title"><div class="panel-head"><div><h2 id="dyn-title">Динамика состояния команды</h2><p>Средние показатели готовности и восстановления</p></div>' +
          '<div class="seg" role="group" aria-label="Период"><button type="button" data-range="7" aria-pressed="' + (rDays === 7) + '">7 дней</button><button type="button" data-range="30" aria-pressed="' + (rDays === 30) + '">30 дней</button></div></div>' +
          '<div class="panel-body" style="display:flex;flex-direction:column;gap:14px">' +
          lineChart({ labels: labels, label: 'Динамика готовности и восстановления команды', series: [{ name: 'Готовность', color: 'var(--violet)', values: sr, area: true }, { name: 'Восстановление', color: 'var(--mint)', values: sv, dash: true }], min: 40, max: 100 }) +
          '<div class="insight">' + icon('spark', 'icon-sm') + '<span>' + insight + '</span></div></div></section>' +
        '<section class="panel" aria-labelledby="att-title"><div class="panel-head"><div><h2 id="att-title">Требуют внимания <span class="count">' + t.signals.length + '</span></h2><p>Ранние сигналы · orange flags</p></div></div>' +
          '<div class="list" style="margin-top:8px">' + (t.signals.slice(0, 4).map(function (x) { return athleteRow(x, { flags: true }); }).join('') || '<div class="empty">' + icon('check') + 'Ранних сигналов нет</div>') + '</div>' +
          '<div class="panel-foot"><span>Сигнал — не диагноз</span><a class="btn btn-ghost btn-sm" href="#/analytics">Открыть анализ рисков ' + icon('arrow', 'icon-sm') + '</a></div></section>' +
      '</div>' +
      '<div class="grid g-main">' +
        '<section class="panel" aria-labelledby="tbl-title"><div class="panel-head"><div><h2 id="tbl-title">Спортсмены <span class="badge plain mute">' + t.total + '</span></h2><p>Сортировка по риску — сначала те, кому нужно внимание</p></div><a class="btn btn-ghost btn-sm" href="#/athletes">Все спортсмены ' + icon('arrow', 'icon-sm') + '</a></div>' +
          '<div style="margin-top:12px">' + teamTable(top5, { readiness: true, recovery: true, risk: true, status: true }, { lite: true }) + '</div>' +
          '<div class="panel-foot"><span>Показано 5 из ' + t.total + '</span><span>' + icon('refresh', 'icon-sm') + ' Данные синхронизированы</span></div></section>' +
        '<section class="panel" aria-labelledby="rec-title"><div class="panel-head"><div><h2 id="rec-title">Рекомендации AI</h2><p>Персональные действия на сегодня</p></div><span class="badge info plain">AI insights</span></div>' +
          '<div style="margin-top:8px">' + (recs.map(recCard).join('') || '<div class="empty">' + icon('check') + 'Все рекомендации рассмотрены</div>') + '</div>' +
          '<div class="panel-foot"><span>Решение принимает специалист</span><a class="btn btn-ghost btn-sm" href="#/recommendations">Все рекомендации ' + icon('arrow', 'icon-sm') + '</a></div></section>' +
      '</div>' + footerStrip();
  };

  /* ---------- Athletes ---------- */
  RENDER.athletes = function () {
    var t = team();
    var rows = filterRows(t.list, state.filter);
    if (ui.q) { var q = ui.q.toLowerCase(); rows = rows.filter(function (x) { return (x.a.short + ' ' + x.a.posName + ' ' + x.a.num).toLowerCase().indexOf(q) > -1; }); }
    rows = sortRows(rows);
    return pageHead('athletes', '<button class="btn btn-ghost" type="button" data-action="add-athlete">' + icon('plus') + '<span class="lbl">Добавить спортсмена</span></button>') +
      '<section class="panel" aria-labelledby="ath-title"><div class="panel-head"><div><h2 id="ath-title">Состав <span class="badge plain mute">' + t.total + '</span></h2><p>Нажмите на строку, чтобы открыть карточку спортсмена</p></div></div>' +
      '<div class="table-tools"><div class="left">' + filterTabs(t, state.filter) +
      '<label class="mini-search">' + icon('search', 'icon-sm') + '<span class="sr-only">Поиск по составу</span><input type="search" id="ath-q" placeholder="Имя, позиция или номер" value="' + esc(ui.q) + '" autocomplete="off"></label></div>' +
      '<button class="icon-btn" type="button" data-action="cols" aria-label="Настроить колонки" aria-haspopup="menu">' + icon('sliders') + '</button></div>' +
      '<div id="ath-table">' + teamTable(rows, state.cols, { sortable: true }) + '</div>' +
      '<div class="panel-foot"><span>Показано ' + rows.length + ' из ' + t.total + '</span><span>' + icon('refresh', 'icon-sm') + ' Срез на ' + fmtFull.format(asOfDate()) + '</span></div></section>' + footerStrip();
  };
  MOUNT.athletes = function () {
    var inp = document.getElementById('ath-q');
    if (!inp) return;
    inp.addEventListener('input', function () {
      ui.q = inp.value;
      var pos = inp.selectionStart;
      render();
      var ni = document.getElementById('ath-q');
      if (ni) { ni.focus(); try { ni.setSelectionRange(pos, pos); } catch (e) { /* noop */ } }
    });
  };

  /* ---------- Twin ---------- */
  function latestCheckin(id) { var c = state.checkins[id] || []; return c[0] || null; }
  function checkinStatus(c) { if (!c) return null; return (c.stress >= 4 || c.mood <= 2 || c.motivation <= 2) ? 'attention' : 'ok'; }
  function athleteSelect(idAttr, selected, label) {
    return '<label class="field" style="min-width:min(280px,100%)"><span class="label sr-only">' + label + '</span><select class="select" id="' + idAttr + '" aria-label="' + label + '">' +
      model.athletes.map(function (a) { return '<option value="' + a.id + '"' + (a.id === selected ? ' selected' : '') + '>' + esc(a.short) + ' · № ' + esc(a.num) + '</option>'; }).join('') + '</select></label>';
  }
  RENDER.twin = function () {
    var a = byId(state.twinAthlete) || model.athletes[0];
    var s = snapOf(a);
    var ci = latestCheckin(a.id);
    var mental = ci ? Math.round(((ci.mood + ci.motivation + (6 - ci.stress) + ci.sleepq + (6 - ci.soreness)) / 25) * 100) : null;
    var axes = [
      { name: 'Готовность', v: s.readiness }, { name: 'Восстановление', v: s.recovery },
      { name: 'Сон', v: s.sleep == null ? null : Math.round(D.clamp((s.sleep - 5) / 4, 0, 1) * 100) },
      { name: 'HRV', v: s.hrv == null ? null : Math.round(D.clamp((s.hrv / s.hrvBase - 0.6) / 0.6, 0, 1) * 100) },
      { name: 'Баланс нагрузки', v: s.acwr == null ? null : Math.round(D.clamp(1 - Math.abs(s.acwr - 1) * 1.6, 0, 1) * 100) },
      { name: 'Ментальное', v: mental }
    ];
    var idx = a.days.length - 1 - state.offset;
    var days = a.days.slice(Math.max(0, idx - 29), idx + 1);
    var checkins = state.checkins[a.id] || [];
    var obs = checkins.slice(0, 5).map(function (c) {
      var st = checkinStatus(c);
      var detail = can('psych') ?
        'Настроение ' + c.mood + '/5 · стресс ' + c.stress + '/5 · мотивация ' + c.motivation + '/5 · сон ' + c.sleepq + '/5 · болезненность ' + c.soreness + '/5' + (c.note ? '<br><span class="muted">«' + esc(c.note) + '»</span>' : '') :
        'Обобщённый статус: ' + (st === 'attention' ? '<span class="val-warn">требуется внимание психолога</span>' : '<span class="val-good">в норме</span>');
      return '<div class="journal-row"><span class="dot" style="background:' + (st === 'attention' ? 'var(--orange)' : 'var(--mint)') + '"></span><div><b>' + fmtTime.format(new Date(c.ts)) + '</b><span>' + detail + '</span></div></div>';
    }).join('');
    var labs = '';
    if (a.labs) {
      labs = can('labs') ?
        '<div class="kv">' + model.LABS.slice(0, 6).map(function (l) { var v = a.labs[l.key], out = v < l.lo || v > l.hi; return '<div><span>' + esc(l.name) + '</span><b class="' + (out ? 'val-warn' : '') + '">' + num(v, l.dec) + ' ' + l.unit + '</b></div>'; }).join('') + '</div>' :
        '<div class="lock">' + icon('lock') + '<span>Лабораторные показатели доступны спортивному врачу. Смените роль в меню профиля, чтобы посмотреть.</span></div>';
    }
    return pageHead('twin') +
      '<section class="panel" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px">' +
        '<div class="person"><span class="kpi-ic v">' + icon('twin', 'icon-sm') + '</span><span><b>Персональный профиль спортсмена</b><span>Данные устройства, анализы, нагрузка и самочувствие — в одной модели</span></span></div>' +
        athleteSelect('twin-select', a.id, 'Выбрать спортсмена') + '</section>' +
      '<div class="grid g-main-r">' +
        '<section class="panel twin-profile" aria-label="Профиль">' + avatar(a, 'xl') + '<h2>' + esc(a.short) + '</h2><p>' + esc(a.posName) + ' · № ' + esc(a.num) + (a.age ? ' · ' + a.age + ' лет' : '') + '</p>' + statusBadge(s.status) + radar(axes) +
          '<p style="font-size:12.5px">Шкалы 0–100 относительно личной нормы спортсмена</p></section>' +
        '<section class="panel" aria-labelledby="today-title"><div class="panel-head"><div><h2 id="today-title">Сегодняшнее состояние</h2><p>' + fmtFull.format(asOfDate()) + '</p></div>' + (s.signal ? '<span class="badge warn">' + esc(s.signal) + '</span>' : '') + '</div><div class="panel-body" style="display:flex;flex-direction:column;gap:16px">' +
          (s.status === 'nodata' ? '<div class="note warn">' + icon('alert', 'icon-sm') + '<span>Нет свежих данных с устройства. Показатели появятся после синхронизации; первые 14–28 дней формируется личная норма.</span></div>' : '') +
          '<div class="metric-tiles"><div class="tile"><span>' + icon('activity', 'icon-sm') + 'Готовность</span><b class="' + scoreClass(s.readiness) + '">' + num(s.readiness) + '<small> /100</small></b></div><div class="tile"><span>' + icon('heart', 'icon-sm') + 'Восстановление</span><b class="' + scoreClass(s.recovery) + '">' + num(s.recovery) + '<small> /100</small></b></div><div class="tile"><span>' + icon('shield', 'icon-sm') + 'Риск · демо</span><b class="' + riskClass(s.risk) + '">' + (s.risk == null ? '—' : s.risk) + '<small> %</small></b></div></div>' +
          '<div class="kv"><div><span>' + icon('sleep', 'icon-sm') + 'Сон</span><b>' + D.fmtHours(s.sleep) + '</b></div><div><span>' + icon('heart', 'icon-sm') + 'HRV</span><b>' + (s.hrv == null ? '—' : num(s.hrv) + ' мс') + '</b></div><div><span>' + icon('activity', 'icon-sm') + 'Пульс покоя</span><b>' + (s.rhr == null ? '—' : s.rhr + ' уд/мин') + '</b></div><div><span>' + icon('load', 'icon-sm') + 'ACWR</span><b>' + (s.acwr == null ? '—' : num(s.acwr, 2)) + '</b></div></div>' +
          '<div><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><b style="font-size:14.5px">Ежедневный психологический чек-ин</b><p class="muted" style="margin:2px 0 0;font-size:13px">Самооценка настроения, стресса и мотивации. Не является психологической диагностикой.</p></div><button class="btn btn-primary btn-sm" type="button" data-action="checkin" data-id="' + a.id + '">' + icon('brain', 'icon-sm') + 'Пройти чек-ин</button></div>' +
          '<div class="journal" style="margin-top:10px"><b style="font-size:13.5px;display:block;margin-bottom:4px">Последние наблюдения</b>' + (obs || '<p class="muted" style="margin:6px 0 0;font-size:13.5px">Чек-ин ещё не заполнен.</p>') + '</div></div>' +
        '</div></section>' +
      '</div>' +
      '<div class="grid g-2">' +
        '<section class="panel"><div class="panel-head"><div><h2>HRV и личная норма</h2><p>30 дней · ночной rMSSD, мс</p></div></div><div class="panel-body">' +
          lineChart({ labels: days.map(function (d) { return d.date; }), label: 'HRV и личная норма', series: [{ name: 'HRV', color: 'var(--violet)', values: days.map(function (d) { return d.hrv; }), area: true, unit: ' мс' }, { name: 'Личная норма', color: 'var(--orange)', values: days.map(function (d) { return d.hrvBase; }), dash: true, unit: ' мс' }], height: 200 }) + '</div></section>' +
        '<section class="panel"><div class="panel-head"><div><h2>Сон и нагрузка</h2><p>30 дней · часы сна и нагрузка (sRPE, у.е. ÷ 100)</p></div></div><div class="panel-body">' +
          lineChart({ labels: days.map(function (d) { return d.date; }), label: 'Сон и нагрузка', series: [{ name: 'Сон, ч', color: 'var(--mint)', values: days.map(function (d) { return d.sleep; }), dec: 1, unit: ' ч' }, { name: 'Нагрузка', color: 'var(--orange)', values: days.map(function (d) { return Math.round(d.load / 10) / 10; }), dash: true, dec: 1 }], height: 200, min: 0 }) + '</div></section>' +
      '</div>' +
      (a.labs ? '<section class="panel"><div class="panel-head"><div><h2>Лабораторный срез</h2><p>Панель от ' + fmtFull.format(a.labDate) + '</p></div><a class="btn btn-ghost btn-sm" href="#/medical/' + a.id + '">Все медицинские данные ' + icon('arrow', 'icon-sm') + '</a></div><div class="panel-body">' + labs + '</div></section>' : '') +
      footerStrip();
  };
  MOUNT.twin = function () {
    var sel = document.getElementById('twin-select');
    if (sel) sel.addEventListener('change', function () { state.twinAthlete = sel.value; save(); go('twin', sel.value); });
  };

  /* ---------- Medical ---------- */
  RENDER.medical = function () {
    var a = byId(state.medAthlete) || model.athletes[0];
    var s = snapOf(a);
    var src = state.medSource;
    var rows = [];
    if (src !== 'wear') {
      if (!a.labs) rows.push('<tr><td colspan="7"><div class="empty">' + icon('flask') + 'Для этого профиля ещё нет лабораторных данных.</div></td></tr>');
      else if (!can('labs')) rows.push('<tr><td colspan="7"><div class="lock" style="margin:6px 0">' + icon('lock') + '<span>Лабораторные показатели — медицинская тайна. Они доступны спортивному врачу; роль «' + ROLES[state.role].title + '» видит только данные носимых устройств.</span></div></td></tr>');
      else model.LABS.forEach(function (l) {
        var v = a.labs[l.key], p = a.prevLabs[l.key];
        var st = v < l.lo ? ['warn', 'Ниже референса'] : v > l.hi ? ['warn', 'Выше референса'] : ['ok', 'В пределах'];
        var tr = v > p ? 'up' : v < p ? 'dn' : null;
        rows.push('<tr tabindex="-1" style="cursor:default"><td><b>' + esc(l.name) + '</b></td><td class="num"><b>' + num(v, l.dec) + '</b> <span class="muted">' + l.unit + '</span></td><td class="num muted">' + num(l.lo, l.dec) + '–' + num(l.hi, l.dec) + '</td><td class="num muted">' + num(p, l.dec) + (tr ? ' ' + icon(tr, 'icon-sm') : '') + '</td><td><span class="badge ' + st[0] + '">' + st[1] + '</span></td><td><span class="chip">' + icon('flask', 'icon-sm') + 'Лаборатория</span></td><td class="muted">' + dDay(a.labDate) + '</td></tr>');
      });
    }
    if (src !== 'lab') {
      var idx = a.days.length - 1 - state.offset, d = a.days[idx];
      var prevDays = a.days.slice(Math.max(0, idx - 7), idx);
      model.WEAR.forEach(function (w) {
        var v = d[w.key];
        var p = D.mean(prevDays.map(function (x) { return x[w.key]; }).filter(function (x) { return x != null; }));
        var st = ['ok', 'В пределах'];
        if (v == null) st = ['mute', 'Нет данных'];
        else if (w.key === 'hrv') st = v < 0.85 * d.hrvBase ? ['warn', 'Ниже личной нормы'] : ['ok', 'В пределах нормы'];
        else if (w.lo != null && (v < w.lo || v > w.hi)) st = ['warn', v < w.lo ? 'Ниже ориентира' : 'Выше ориентира'];
        var ref = w.key === 'hrv' ? 'норма ' + num(d.hrvBase) : (w.lo != null ? num(w.lo, w.dec) + '–' + num(w.hi, w.dec) : '—');
        var shown = w.key === 'sleep' ? D.fmtHours(v) : num(v, w.dec) + ' <span class="muted">' + w.unit + '</span>';
        rows.push('<tr tabindex="-1" style="cursor:default"><td><b>' + esc(w.name) + '</b></td><td class="num"><b>' + (v == null ? '—' : shown) + '</b></td><td class="num muted">' + ref + '</td><td class="num muted">' + (isNaN(p) || !p ? '—' : (w.key === 'sleep' ? D.fmtHours(p) : num(p, w.dec))) + ' <span style="font-size:11px">ср. 7 дн.</span></td><td><span class="badge ' + st[0] + '">' + st[1] + '</span></td><td><span class="chip">' + icon('watch', 'icon-sm') + 'Носимое устройство</span></td><td class="muted">' + dDay(d.date) + '</td></tr>');
      });
    }
    var seg = '<div class="seg" role="group" aria-label="Источник данных">' + [['all', 'Все источники'], ['lab', 'Лаборатория'], ['wear', 'Носимые устройства']].map(function (x) { return '<button type="button" data-src="' + x[0] + '" aria-pressed="' + (src === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
    return pageHead('medical') +
      '<section class="panel"><div class="panel-head"><div><h2>Медицинский мониторинг</h2><p>' + esc(a.short) + ' · срез на ' + fmtFull.format(asOfDate()) + '</p></div>' + athleteSelect('med-select', a.id, 'Спортсмен') + '</div>' +
      '<div class="table-tools"><div class="left">' + seg + '</div>' + statusBadge(s.status) + '</div>' +
      '<div style="padding:0 20px 14px"><div class="note info">' + icon('info', 'icon-sm') + '<span>Референсные интервалы зависят от лаборатории и индивидуальных особенностей. Данные не предназначены для самостоятельной диагностики — интерпретацию проводит врач.</span></div></div>' +
      '<div class="table-wrap"><table class="table"><caption class="sr-only">Медицинские показатели</caption><thead><tr><th scope="col">Показатель</th><th scope="col">Значение</th><th scope="col">Референс</th><th scope="col">Предыдущее</th><th scope="col">Статус</th><th scope="col">Источник</th><th scope="col">Обновлено</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div></section>' +
      footerStrip();
  };
  MOUNT.medical = function () {
    var sel = document.getElementById('med-select');
    if (sel) sel.addEventListener('change', function () { state.medAthlete = sel.value; save(); go('medical', sel.value); });
  };

  /* ---------- Analytics ---------- */
  RENDER.analytics = function () {
    var t = team();
    var ra = byId(state.riskAthlete) || (t.signals[0] && t.signals[0].a) || model.athletes[0];
    var rs = snapOf(ra);
    var factors = D.factorBreakdown(ra, state.offset);
    var idx = ra.days.length - 1 - state.offset;
    var days = ra.days.slice(Math.max(0, idx - 13), idx + 1);
    var steps = [
      ['01 · Единый поток данных', 'Адаптеры устройств, лабораторий и опросов → очередь событий → нормализация единиц и времени → хранилище временных рядов. У каждого измерения: источник, спортсмен, согласие, качество, время получения. Пропуск не равен нулю.'],
      ['02 · Персональная базовая линия', 'Собрать 28–42 дня наблюдений; учитывать позицию, фазу сезона и историю травм. Использовать медиану и MAD, скользящие окна 3/7/28 дней. До накопления базы выводить «недостаточно данных», а не персональный прогноз.'],
      ['03 · Orange flags', 'Пример проверяемого правила: HRV ниже личной базы на 20% два дня + сон менее 7 часов + рост бросковой нагрузки. Это иллюстративные пороги, которые должен утвердить врач; они не являются клинически валидированным алгоритмом.'],
      ['04 · Risk Advisor', 'После накопления размеченных исходов — калиброванная модель риска на 7/14 дней (например, градиентный бустинг или survival-модель). Разделение train/test по спортсменам и времени; исключить утечку будущих диагнозов.'],
      ['05 · Клинический цикл', 'Сигнал → очередь врача → проверка симптомов → подтверждённое действие → повторная оценка. Острые симптомы идут по медицинскому протоколу независимо от AI-score; запрет автоматического допуска к соревнованиям.'],
      ['06 · Проверка эффективности', 'Сначала shadow-mode без влияния на решения. Измерять чувствительность, PPV, калибровку, ложные тревоги на спортсмено-неделю и нагрузку на врача. Затем проспективный пилот с сопоставимой группой.']
    ];
    return pageHead('analytics') +
      '<div class="grid g-main-r">' +
        '<section class="panel"><div class="panel-head"><div><h2>Требуют внимания <span class="count">' + t.signals.length + '</span></h2><p>Ранние сигналы · orange flags</p></div></div><div class="list" style="margin-top:8px">' +
          (t.signals.map(function (x) { return athleteRow(x, { flags: true, risk: true }); }).join('') || '<div class="empty">' + icon('check') + 'Ранних сигналов нет</div>') + '</div></section>' +
        '<section class="panel panel-body" style="display:flex;flex-direction:column;gap:14px;padding-top:20px"><span class="kpi-ic o" style="width:44px;height:44px">' + icon('alert') + '</span><h2 class="title-m">Ранний сигнал, а не диагноз</h2>' +
          '<p class="muted" style="margin:0">Orange flags объединяют отклонения сна, HRV и нагрузки относительно личной базовой линии. Отдельный показатель не определяет риск травмы.</p>' +
          '<div class="flow"><span class="chip">Личная база</span><span class="arr">' + icon('arrow', 'icon-sm') + '</span><span class="chip">Сочетание сигналов</span><span class="arr">' + icon('arrow', 'icon-sm') + '</span><span class="chip">Оценка врача</span></div>' +
          '<div class="note">' + icon('info', 'icon-sm') + '<span>Проценты в демоверсии — иллюстрации интерфейса, не выводы обученной модели. Пилот не подтверждает точность прогнозов.</span></div>' +
          '<a class="btn btn-ghost btn-sm" style="align-self:flex-start" href="#/about">Архитектура Predictive Injury ' + icon('arrow', 'icon-sm') + '</a></section>' +
      '</div>' +
      '<section class="panel"><div class="panel-head"><div><h2>Факторы риска</h2><p>Вклад факторов в сигнал · ' + esc(ra.short) + '</p></div>' + athleteSelect('risk-select', ra.id, 'Спортсмен для разбора факторов') + '</div>' +
        '<div class="panel-body grid g-2" style="align-items:start">' +
          (factors.length ? '<div class="factors">' + factors.map(function (f) { return '<div class="factor"><div class="factor-row"><span>' + esc(f.name) + '</span><span>' + f.share + '%</span></div><div class="factor-track"><i style="width:' + Math.max(2, f.share) + '%"></i></div></div>'; }).join('') +
            '<p class="muted" style="margin:4px 0 0;font-size:12.5px">Текущий риск (демо): <b class="' + riskClass(rs.risk) + '">' + (rs.risk == null ? '—' : rs.risk + '%') + '</b>. Доли показывают, какие отклонения дали сигнал — это помогает врачу проверить причину.</p></div>' :
            '<div class="empty">' + icon('info') + 'Недостаточно данных для разбора факторов.</div>') +
          '<div>' + lineChart({ labels: days.map(function (d) { return d.date; }), label: 'Риск и готовность за 14 дней', series: [{ name: 'Риск, %', color: 'var(--orange)', values: days.map(function (d) { return d.risk; }), area: true, unit: '%' }, { name: 'Готовность', color: 'var(--violet)', values: days.map(function (d) { return d.readiness; }), dash: true }], height: 200, min: 0, max: 100 }) + '</div>' +
        '</div></section>' +
      '<section class="panel"><div class="panel-head"><div><h2>Как работает раннее предупреждение</h2><p>Заимствуем общие продуктовые принципы, не проприетарные алгоритмы или обучающие данные</p></div></div><div class="panel-body"><div class="steps-app">' +
        steps.map(function (st) { return '<div class="step-card"><span class="n">' + st[0].split(' · ')[0] + '</span><b>' + st[0].split(' · ')[1] + '</b><p>' + st[1] + '</p></div>'; }).join('') + '</div></div></section>' +
      footerStrip();
  };
  MOUNT.analytics = function () {
    var sel = document.getElementById('risk-select');
    if (sel) sel.addEventListener('change', function () { state.riskAthlete = sel.value; save(); render(); });
  };

  /* ---------- Recommendations ---------- */
  function recCard(r) {
    var who = r.a ? esc(r.a.short) : 'Команда';
    var allowed = r.owner === 'any' || (r.owner === 'doctor' && can('medical-decision')) || (r.owner === 'coach' && (state.role === 'coach' || state.role === 'doctor'));
    var actions;
    if (r.status === 'pending') {
      actions = allowed ?
        '<button class="btn btn-primary btn-sm" type="button" data-decide="accepted" data-rec="' + r.id + '">' + icon('check', 'icon-sm') + 'Согласовать</button><button class="btn btn-ghost btn-sm" type="button" data-decide="declined" data-rec="' + r.id + '">Отклонить</button>' :
        '<span class="rec-state">' + icon('lock', 'icon-sm') + 'Решение принимает ' + (r.owner === 'doctor' ? 'спортивный врач' : 'тренерский штаб или врач') + '</span>';
    } else {
      var d = r.decision;
      actions = '<span class="badge ' + (r.status === 'accepted' ? 'ok' : 'mute') + '">' + (r.status === 'accepted' ? 'Согласовано' : 'Отклонено') + '</span><span class="rec-state">' + esc(d.by) + ' · ' + fmtTime.format(new Date(d.ts)) + '</span>' +
        (allowed ? '<button class="btn btn-quiet btn-sm" type="button" data-decide="undo" data-rec="' + r.id + '">Отменить</button>' : '');
    }
    return '<article class="rec"><span class="rec-ic ' + r.tone + '">' + icon(r.ic) + '</span><div><h3>' + esc(r.title) + ' <span class="badge plain ' + (r.prio === 'Высокий' ? 'warn' : 'mute') + '">' + r.cat + '</span></h3>' +
      '<p><b>' + who + '</b> · ' + esc(r.text) + '</p>' +
      (r.why && r.why.length ? '<div class="why">' + r.why.slice(0, 4).map(function (w) { return '<span class="chip">' + esc(w) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="rec-actions">' + actions + '</div></div></article>';
  }
  RENDER.recommendations = function () {
    var recs = buildRecs();
    var f = state.recFilter;
    var counts = { all: recs.length, pending: 0, accepted: 0, declined: 0 };
    recs.forEach(function (r) { counts[r.status]++; });
    var shown = recs.filter(function (r) { return f === 'all' || r.status === f; });
    var journal = Object.keys(state.decisions).map(function (id) { var d = state.decisions[id]; return { id: id, d: d, r: recs.filter(function (x) { return x.id === id; })[0] }; })
      .filter(function (x) { return x.r; }).sort(function (p, q) { return q.d.ts - p.d.ts; });
    var seg = '<div class="seg" role="group" aria-label="Фильтр рекомендаций">' + [['all', 'Все'], ['pending', 'Ожидают'], ['accepted', 'Согласованы'], ['declined', 'Отклонены']].map(function (x) { return '<button type="button" data-recf="' + x[0] + '" aria-pressed="' + (f === x[0]) + '">' + x[1] + ' <span class="muted num">' + counts[x[0]] + '</span></button>'; }).join('') + '</div>';
    return pageHead('recommendations') +
      '<div class="grid g-main">' +
        '<section class="panel"><div class="panel-head"><div><h2>' + icon('spark', 'icon-sm') + 'Рекомендации AI</h2><p>Сформированы по правилам, утверждённым врачом и тренерским штабом</p></div></div>' +
          '<div class="table-tools">' + seg + '</div>' +
          '<div>' + (shown.map(recCard).join('') || '<div class="empty">' + icon('check') + 'В этой категории пусто.</div>') + '</div>' +
          '<div class="panel-foot"><span>' + icon('shield', 'icon-sm') + ' Рекомендации демонстрационные. Медицинские назначения и допуск к тренировкам остаются за врачом.</span></div></section>' +
        '<section class="panel"><div class="panel-body" style="display:flex;flex-direction:column;gap:12px"><span class="kpi-ic m" style="width:44px;height:44px">' + icon('stetho') + '</span><h2 class="title-m">Врач принимает решение. AI помогает увидеть больше.</h2>' +
          '<p class="muted" style="margin:0;font-size:13.5px">Каждое решение сохраняется в журнале. Рекомендации не применяются автоматически и не заменяют очную оценку. Рекомендации по лечению и медикаментам система не формирует.</p>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px"><b>Журнал решений</b>' + (journal.length ? '<button class="btn btn-quiet btn-sm" type="button" data-action="clear-journal">Очистить</button>' : '') + '</div>' +
          '<div class="journal">' + (journal.map(function (x) { return '<div class="journal-row"><span class="dot" style="background:' + (x.d.status === 'accepted' ? 'var(--mint)' : 'var(--faint)') + '"></span><div><b>' + (x.d.status === 'accepted' ? 'Согласовано' : 'Отклонено') + ': ' + esc(x.r.title) + '</b><span>' + (x.r.a ? esc(x.r.a.short) : 'Команда') + ' · ' + esc(x.d.by) + ' · ' + fmtTime.format(new Date(x.d.ts)) + '</span></div></div>'; }).join('') || '<p class="muted" style="margin:0;font-size:13.5px">Пока нет решений по рекомендациям.</p>') + '</div>' +
        '</div></section>' +
      '</div>' + footerStrip();
  };

  /* ---------- Reports ---------- */
  var REPORTS = {
    team: { title: 'Состояние команды', ic: 'users', desc: 'Состав, готовность и ключевые показатели всех спортсменов на дату среза.' },
    risk: { title: 'Риски и восстановление', ic: 'shield', desc: 'Индивидуальная готовность, восстановление, сон, HRV относительно нормы и ранние сигналы.' },
    pilot: { title: 'Результаты пилота', ic: 'chart', desc: 'Средние показатели команды по дням за 30 дней — для отслеживания динамики пилота.' }
  };
  function reportRows(type) {
    var t = team();
    if (type === 'team') {
      return [['Спортсмен', 'Позиция', 'Номер', 'Готовность', 'Восстановление', 'Риск травмы, %', 'Сон, ч', 'HRV, мс', 'Статус']].concat(sortRows(t.list, { key: 'risk', dir: 'desc' }).map(function (x) {
        return [x.a.short, x.a.posName, x.a.num, x.s.readiness, x.s.recovery, x.s.risk, x.s.sleep == null ? '' : D.round(x.s.sleep, 1), x.s.hrv, STATUS[x.s.status][1]];
      }));
    }
    if (type === 'risk') {
      return [['Спортсмен', 'Риск травмы, %', 'Восстановление', 'Сон, ч', 'HRV к норме, %', 'ACWR', 'Сигнал', 'Факторы']].concat(sortRows(t.list, { key: 'risk', dir: 'desc' }).map(function (x) {
        return [x.a.short, x.s.risk, x.s.recovery, x.s.sleep == null ? '' : D.round(x.s.sleep, 1), x.s.hrvPct == null ? '' : x.s.hrvPct, x.s.acwr == null ? '' : x.s.acwr, x.s.signal || '', (x.s.flags || []).map(function (f) { return f.t; }).join('; ')];
      }));
    }
    var labels = t.labels(30), r = t.series('readiness', 30), v = t.series('recovery', 30), k = t.series('risk', 30);
    return [['Дата', 'Готовность (ср.)', 'Восстановление (ср.)', 'Риск (ср.), %']].concat(labels.map(function (d, i) { return [d.toISOString().slice(0, 10), r[i], v[i], k[i]]; }));
  }
  function downloadReport(type) {
    var rows = reportRows(type);
    var meta = [['AI Sports Precision Medicine — ' + REPORTS[type].title], ['Сборная Казахстана · водное поло · срез ' + asOfDate().toISOString().slice(0, 10)], ['Демонстрационные данные. Не являются медицинскими заключениями.'], []];
    function cell(c) {
      if (c == null) return '';
      var s = typeof c === 'number' ? String(c).replace('.', ',') : String(c);
      return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    var csv = meta.concat(rows).map(function (r) { return r.map(cell).join(';'); }).join('\r\n');
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ai-sports_' + type + '_' + asOfDate().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast('Отчёт «' + REPORTS[type].title + '» скачан');
  }
  RENDER.reports = function () {
    return pageHead('reports') + '<div class="grid g-3">' + Object.keys(REPORTS).map(function (k) {
      var R = REPORTS[k], rows = reportRows(k);
      var head = rows[0].slice(0, 3), body = rows.slice(1, 4).map(function (r) { return r.slice(0, 3); });
      return '<article class="panel report-card"><span class="ri">' + icon(R.ic) + '</span><span class="report-meta">CSV · ' + (rows.length - 1) + ' ' + plural(rows.length - 1, 'строка', 'строки', 'строк') + ' · ' + rows[0].length + ' ' + plural(rows[0].length, 'колонка', 'колонки', 'колонок') + '</span><h3>' + R.title + '</h3><p>' + R.desc + '</p>' +
        '<div class="report-preview" aria-label="Предпросмотр"><table><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + body.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' +
        '<button class="btn btn-ghost btn-block" type="button" data-download="' + k + '">' + icon('download', 'icon-sm') + 'Сформировать отчёт</button></article>';
    }).join('') + '</div>' +
      '<div class="note">' + icon('info', 'icon-sm') + '<span>Файлы формируются прямо в браузере и не отправляются на сервер. Кодировка UTF-8 с разделителем «;» — открываются в Excel без настройки.</span></div>' + footerStrip();
  };

  /* ---------- Settings ---------- */
  RENDER.settings = function () {
    var themeSeg = '<div class="seg" role="group" aria-label="Тема">' + [['dark', 'Тёмная'], ['light', 'Светлая'], ['system', 'Как в системе']].map(function (x) { return '<button type="button" data-theme-set="' + x[0] + '" aria-pressed="' + (state.theme === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
    var roleSeg = '<div class="seg" role="group" aria-label="Роль">' + Object.keys(ROLES).map(function (k) { return '<button type="button" data-role-set="' + k + '" aria-pressed="' + (state.role === k) + '">' + ROLES[k].title + '</button>'; }).join('') + '</div>';
    var sources = [['G', 'Garmin', 'Health API · сон, HRV, нагрузка'], ['AH', 'Apple Health', 'HealthKit через приложение спортсмена'], ['P', 'Polar', 'AccessLink · тренировки и пульс'], ['O', 'Oura Ring', 'Сон и восстановление'], ['W', 'Whoop', 'Восстановление и нагрузка'], ['Lab', 'Лабораторная система', 'Импорт результатов анализов'], ['AS', 'Браслет AI Sports', 'Собственное устройство платформы']];
    var M = [['Готовность и восстановление', 'y', 'y', 'y'], ['Данные носимых устройств', 'y', 'y', 'y'], ['Лабораторные анализы', 'y', 'n', 'n'], ['Журнал травм и болезней', 'y', 'p', 'n'], ['Ответы чек-ина (детально)', 'n', 'n', 'y'], ['Статус чек-ина (обобщённо)', 'y', 'p', 'y']];
    function cell(v) { return v === 'y' ? '<td class="y">' + icon('check', 'icon-sm') + '<span class="sr-only">Да</span></td>' : v === 'p' ? '<td class="p">с согласия</td>' : '<td class="n">—<span class="sr-only">Нет</span></td>'; }
    return pageHead('settings') +
      '<div class="grid g-2" style="align-items:start">' +
        '<section class="panel"><div class="panel-head"><div><h2>Рабочее пространство</h2><p>Демонстрационный кабинет спортивного врача</p></div></div><div class="panel-body">' +
          '<div class="setting"><div><b>Тема оформления</b><span class="d">Тёмная, светлая или как в системе</span></div>' + themeSeg + '</div>' +
          '<div class="setting"><div><b>Компактный режим</b><span class="d">Уменьшить расстояние между строками</span></div><span class="switch"><input type="checkbox" id="compact" ' + (state.compact ? 'checked' : '') + ' aria-label="Компактный режим"><span class="track"></span></span></div>' +
          '<div class="setting"><div><b>Роль в демо</b><span class="d">Меняет, какие данные видны — как в реальной матрице доступа</span></div>' + roleSeg + '</div>' +
          '<div class="setting"><div><b>Язык интерфейса</b><span class="d">Русский · казахский запланирован для пилота</span></div><div class="seg" role="group" aria-label="Язык"><button type="button" aria-pressed="true">Русский</button><button type="button" disabled aria-pressed="false" title="Скоро">Қазақша · скоро</button></div></div>' +
          '<div class="setting"><div><b>Режим данных</b><span class="d">Только демонстрационные данные, без реальных людей</span></div><span class="badge info">Демо</span></div>' +
          '<div class="setting"><div><b>Сбросить демо-данные</b><span class="d">Удалить добавленных спортсменов, чек-ины, решения и настройки в этом браузере</span></div><button class="btn btn-danger btn-sm" type="button" data-action="reset">' + icon('refresh', 'icon-sm') + 'Сбросить</button></div>' +
        '</div></section>' +
        '<div style="display:flex;flex-direction:column;gap:16px">' +
          '<section class="panel"><div class="panel-head"><div><h2>Источники данных</h2><p>Интеграции запланированы. В демо внешние устройства не подключены.</p></div></div><div class="panel-body">' +
            sources.map(function (s) { return '<div class="source"><span class="si">' + s[0] + '</span><span class="grow"><b>' + s[1] + '</b><span>' + s[2] + '</span></span><span class="badge mute">Не подключено</span></div>'; }).join('') +
            '<a class="btn btn-ghost btn-sm" style="margin-top:14px" href="mailto:' + EMAIL + '?subject=' + encodeURIComponent('Интеграция источника данных — AI Sports') + '">' + icon('mail', 'icon-sm') + 'Обсудить интеграцию</a></div></section>' +
          '<section class="panel"><div class="panel-head"><div><h2>Матрица доступа</h2><p>Каждая роль видит только нужную ей категорию данных</p></div></div><div class="panel-body table-wrap"><table class="access-table"><thead><tr><th scope="col">Данные</th><th scope="col">Врач</th><th scope="col">Тренер</th><th scope="col">Психолог</th></tr></thead><tbody>' +
            M.map(function (r) { return '<tr><td>' + r[0] + '</td>' + cell(r[1]) + cell(r[2]) + cell(r[3]) + '</tr>'; }).join('') + '</tbody></table></div></section>' +
        '</div>' +
      '</div>' + footerStrip();
  };
  MOUNT.settings = function () {
    var c = document.getElementById('compact');
    if (c) c.addEventListener('change', function () { state.compact = c.checked; save(); applyTheme(); toast(c.checked ? 'Компактный режим включён' : 'Компактный режим выключен'); });
  };

  /* ---------- About (strategy) ---------- */
  RENDER.about = function () {
    var cmp = [
      ['Kitman Labs', 'Медицина, травмы, нагрузка, развитие; 150+ интеграций', 'Risk Advisor, факторы риска, единый профиль', 'B2B enterprise; цена в референсе не раскрыта', 'Клубы, лиги, армия'],
      ['NFL / AWS', 'Видео, игровые и тренировочные данные, лиговые бенчмарки', 'Массовые симуляции сценариев и риска травм', 'Инфраструктура лиги; публичной цены нет', '32 клуба NFL'],
      ['InsideTracker', '54 биомаркера, ДНК, носимые устройства', 'Интерпретация анализов, AI-гид', '$149/год + лабораторные панели и тесты', 'B2C, люди, следящие за здоровьем'],
      ['FC Barcelona', 'Омика, состав тела, питание, сон, GPS-нагрузка', 'Мультимодальные связи, ранние orange flags', 'Партнёрский исследовательский кейс; цена не указана', 'Элитные спортсмены клуба'],
      ['Zone7', 'Данные разных устройств, нагрузка и восстановление', 'Риск травм, рекомендации нагрузки, планер', 'B2B для команд; цена в референсе не раскрыта', 'Профессиональные клубы'],
      ['AI Sports', 'Медицина, физиология, сон, нагрузка, психология; омика — позже', 'Риск, готовность, восстановление, питание, mental check-in; MVP — правила, не обученная модель', '$500–1 000 / спортсмен / месяц', 'Сборные Казахстана, затем федерации и клубы']
    ];
    var closed = [['Kitman Labs', 'Единая история спортсмена, разграничение ролей, объяснение факторов риска'], ['NFL / AWS', 'Командный портал и агрегированные бенчмарки; не копировать масштаб симуляций в MVP'], ['InsideTracker', 'Динамика биомаркеров и понятный план действий; клиническое сопровождение отдельно'], ['FC Barcelona', 'Личная базовая линия, сочетание сигналов, контроль качества измерений'], ['Zone7', 'Device-agnostic слой, недельный план, проверка сценария нагрузки']];
    var hyp = [
      ['Национальный клинический контур', 'Единый маршрут «сигнал → спортивный врач → план → контроль результата» для нескольких федераций; русский и казахский интерфейсы, локальное хранение, согласия и аудит доступа. Проверять требования юристами до внедрения.'],
      ['Специфическая модель водного поло', 'Объединить бросковую нагрузку, состояние плеча, время в воде, позицию и внебассейновую подготовку. В MVP — экспертные правила с подтверждением врача, затем проспективная валидация на нескольких командах.'],
      ['Закрытый цикл персонализации', 'Биомаркеры + сон + психологический чек-ин → совместная задача врачу, психологу и нутрициологу → подтверждение выполнения → измерение эффекта. Не автономные назначения ИИ.'],
      ['Пакет для федерации, а не только клуба', 'Переход спортсмена между клубом и сборной без потери истории с его согласием; федерация видит обезличенные показатели доступности, а не индивидуальные психологические ответы.'],
      ['Измеримая ценность и честная неопределённость', 'Контракт на пилот с заранее определёнными метриками доступности, стоимости пропущенного дня и времени врача. Показывать качество данных и диапазон неопределённости, а не псевдоточный процент риска.']
    ];
    return pageHead('about') +
      '<section class="panel"><div class="panel-head"><div><h2><span class="badge info plain">01</span> Сравнение с пятью референсами</h2><p>По предоставленным описаниям. Цены и результаты не проверены независимо.</p></div></div><div class="panel-body table-wrap"><table class="cmp-table"><thead><tr><th scope="col">Продукт</th><th scope="col">Охват данных</th><th scope="col">AI-функции</th><th scope="col">Бизнес-модель / аудитория</th></tr></thead><tbody>' +
        cmp.map(function (r) { return '<tr' + (r[0] === 'AI Sports' ? ' class="ours"' : '') + '><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td><td>' + r[3] + '<small>' + r[4] + '</small></td></tr>'; }).join('') + '</tbody></table></div></section>' +
      '<div class="grid g-main-r" style="align-items:start">' +
        '<section class="panel"><div class="panel-head"><div><h2><span class="badge info plain">02</span> Что уже закрыто рынком</h2></div></div><div class="panel-body"><div class="journal">' +
          closed.map(function (c) { return '<div class="journal-row"><span class="dot" style="background:var(--violet)"></span><div><b>' + c[0] + '</b><span>' + c[1] + '</span></div></div>'; }).join('') + '</div>' +
          '<div class="note" style="margin-top:12px">' + icon('info', 'icon-sm') + '<span>Агрегация данных, цифровой двойник, readiness/recovery score, прогноз травм, device-agnostic интеграции и AI-рекомендации сами по себе не уникальны. Наличие аналогов подтверждает категорию, но не эффективность новой модели и не спрос при заявленной цене.</span></div></div></section>' +
        '<section class="panel"><div class="panel-head"><div><h2><span class="badge info plain">03</span> Пять гипотез дифференциации</h2><p>Эти сочетания не описаны в пяти референсах. Это не доказательство отсутствия у конкурентов: нужны интервью и функциональный аудит.</p></div></div><div class="panel-body grid" style="gap:10px">' +
          hyp.map(function (h, i) { return '<div class="hyp"><span class="n">0' + (i + 1) + '</span><b>' + h[0] + '</b><p>' + h[1] + '</p></div>'; }).join('') + '</div></section>' +
      '</div>' +
      '<section class="panel"><div class="panel-head"><div><h2><span class="badge info plain">04</span> Архитектура Predictive Injury</h2><p>Подробно — в разделе <a href="#/analytics">AI-аналитика</a></p></div></div><div class="panel-body prose-app">' +
        '<p><b>Миллион измерений ≠ миллион независимых примеров.</b> 20–25 спортсменов за 6 месяцев недостаточно для надёжного обучения широкого прогноза травм: исходы редки, измерения коррелированы. Цель пилота — качество данных, workflow и feasibility. Для модели нужны межкомандные размеченные когорты, внешняя проверка и отдельная оценка подгрупп.</p></div></section>' +
      '<section class="panel"><div class="panel-head"><div><h2><span class="badge info plain">05</span> Экономика: оправданы ли $500–1 000 в месяц?</h2></div></div><div class="panel-body" style="display:flex;flex-direction:column;gap:14px">' +
        '<div class="money"><div><span>Лицензия на атлета</span><b>$6 000–12 000 / год</b></div><div><span>24 спортсмена · 6 месяцев</span><b>$72 000–144 000</b></div><div><span>24 спортсмена · год</span><b>$144 000–288 000</b></div></div>' +
        '<div class="grid g-3" style="gap:12px">' +
          '<div class="hyp"><b>Не сравнивать SaaS и клинический сервис</b><p>InsideTracker: $149/год за подписку, анализы отдельно. OneTwenty: $499/год по референсу, с панелями, добавками и доступом к врачам. Предложение AI Sports дороже примерно в 12–81 раз по годовой подписке, но B2C и B2B-пакеты различаются по объёму услуг.</p></div>' +
          '<div class="hyp"><b>Условно оправдано — как managed service</b><p>Цена возможна при включённых лабораторных панелях, выделенной клинической команде, согласованных сроках ответа, интеграциях, защите данных и отчётности федерации. Только dashboard и рекомендации вряд ли обоснуют эту цену для небольшой сборной.</p></div>' +
          '<div class="hyp"><b>Рекомендованная упаковка</b><p>Разделить платформу, внедрение/интеграции и медицинское сопровождение. Предложить платный шестимесячный пилот с фиксированным объёмом. Указать число анализов, консультаций и SLA; не продавать неограниченную медицинскую помощь по цене лицензии.</p></div>' +
        '</div>' +
        '<div class="note">' + icon('info', 'icon-sm') + '<span><b>Как доказать ценность:</b> ROI = предотвращённые пропущенные дни × согласованная стоимость дня + сэкономленное время специалистов − полная стоимость. Зафиксировать baseline, учесть сезонность и отсутствие гарантии снижения травм. $600/год и $500/месяц — разные сегменты: 10 000 × $600 = $6 млн/год; 10 000 × $500 × 12 = $60 млн/год. Это сценарии выручки, не прогноз продаж. Цели снижения травм 20–30% — гипотезы, а не обещание.</span></div>' +
      '</div></section>' +
      '<section class="pitch"><span class="kicker"><span class="dot"></span>06 · Elevator pitch · 100 слов</span><h3 style="margin-top:8px">Не ещё один трекер. Единая система заботы о спортсмене.</h3>' +
        '<p>AI Sports Precision Medicine — клиническая платформа сопровождения сборных, начинающая с водного поло Казахстана. Мы объединяем лабораторные показатели, сон, тренировочную нагрузку и психологические опросы в персональную модель спортсмена. Система замечает сочетания ранних отклонений, объясняет сигнал врачу и помогает согласовать индивидуальный план восстановления, питания и подготовки. Решения остаются за специалистами; качество данных и неопределённость видны пользователю. Отличие — непрерывный маршрут от сигнала до измеренного результата, локальный контур данных и преемственность между клубом и сборной. Шестимесячный пилот проверяет доступность спортсменов, полезность предупреждений и экономику сопровождения.</p></section>' +
      footerStrip();
  };

  /* ---------- Help ---------- */
  RENDER.help = function () {
    var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    var mod = mac ? '⌘' : 'Ctrl';
    var faq = [
      ['Откуда данные в кабинете?', 'Это демонстрационный состав из 24 вымышленных спортсменов. Показатели сгенерированы и рассчитываются прозрачными правилами относительно личной нормы. Реальные данные появятся после подключения устройств и лаборатории в рамках пилота.'],
      ['Что значит «Риск · демо»?', 'Это иллюстрация интерфейса: процент складывается из отклонений HRV, сна и нагрузки. Он не является выводом обученной модели и не заменяет оценку врача.'],
      ['Почему я не вижу анализы?', 'Лабораторные показатели — медицинская тайна и доступны роли «Спортивный врач». Смените роль в меню профиля справа вверху или в настройках.'],
      ['Где хранятся мои действия в демо?', 'Добавленные спортсмены, чек-ины, решения и настройки сохраняются только в вашем браузере (localStorage) и никуда не отправляются. Их можно удалить в настройках кнопкой «Сбросить».'],
      ['Как выгрузить отчёт?', 'Нажмите «Создать отчёт» в любом разделе или откройте раздел «Отчёты». Файл CSV формируется прямо в браузере и открывается в Excel.']
    ];
    return pageHead('help') +
      '<div class="grid g-main" style="align-items:start">' +
        '<section class="panel"><div class="panel-head"><div><h2>Частые вопросы</h2></div></div><div class="panel-body faq-app">' +
          faq.map(function (f) { return '<details><summary>' + f[0] + icon('plus', 'icon-sm') + '</summary><p>' + f[1] + '</p></details>'; }).join('') + '</div></section>' +
        '<div style="display:flex;flex-direction:column;gap:16px">' +
          '<section class="panel"><div class="panel-head"><div><h2>Быстрый старт</h2></div></div><div class="panel-body"><div class="journal">' +
            [['Обзор команды', 'Оцените готовность и ранние сигналы на сегодня'], ['Спортсмены', 'Отфильтруйте «Требуют внимания» и откройте карточку'], ['Цифровой двойник', 'Посмотрите тренды HRV и сна, пройдите чек-ин'], ['Рекомендации', 'Согласуйте или отклоните действия — решение попадёт в журнал']].map(function (s, i) { return '<div class="journal-row"><span class="dot" style="background:var(--violet)"></span><div><b>' + (i + 1) + '. ' + s[0] + '</b><span>' + s[1] + '</span></div></div>'; }).join('') + '</div></div></section>' +
          '<section class="panel"><div class="panel-head"><div><h2>Горячие клавиши</h2></div></div><div class="panel-body">' +
            [['Поиск спортсмена и разделов', [mod, 'K']], ['Поиск (альтернатива)', ['/']], ['Закрыть окно', ['Esc']], ['Помощь', ['?']]].map(function (k) { return '<div class="shortcut"><span>' + k[0] + '</span><span>' + k[1].map(function (x) { return '<span class="kbd">' + x + '</span>'; }).join('') + '</span></div>'; }).join('') + '</div></section>' +
          '<section class="panel"><div class="panel-head"><div><h2>Связаться с командой</h2><p>Пилот, интеграции, вопросы по данным</p></div></div><div class="panel-body" style="display:flex;flex-direction:column;gap:10px">' +
            '<a class="btn btn-primary" href="mailto:' + EMAIL + '?subject=' + encodeURIComponent('Вопрос по демо-кабинету AI Sports') + '">' + icon('mail', 'icon-sm') + EMAIL + '</a>' +
            '<div style="display:flex;flex-wrap:wrap;gap:8px"><a class="btn btn-ghost btn-sm" href="/privacy">Конфиденциальность</a><a class="btn btn-ghost btn-sm" href="/cookies">Cookie</a><a class="btn btn-ghost btn-sm" href="/terms">Соглашение</a></div></div></section>' +
        '</div>' +
      '</div>' + footerStrip();
  };

  /* ======================= Drawer (athlete card) ======================= */
  function openAthlete(id) {
    var a = byId(id);
    if (!a) return;
    closeDrawer(); closePopover();
    lastFocus = document.activeElement;
    ui.openId = id;
    var s = snapOf(a);
    var idx = a.days.length - 1 - state.offset;
    var days = a.days.slice(Math.max(0, idx - 13), idx + 1);
    var html = '<div class="drawer-overlay" data-close-drawer></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dr-title">' +
      '<div class="drawer-head">' + avatar(a, 'lg') + '<div class="grow"><span class="kicker" style="font-size:11.5px">Digital Athlete Twin</span><h2 id="dr-title">' + esc(a.short) + '</h2><p>' + esc(a.posName) + ' · № ' + esc(a.num) + '</p></div><button class="icon-btn" type="button" data-close-drawer aria-label="Закрыть">' + icon('x') + '</button></div>' +
      '<div class="drawer-body">' + statusBadge(s.status) +
        '<div class="metric-tiles"><div class="tile"><span>Готовность</span><b class="' + scoreClass(s.readiness) + '">' + num(s.readiness) + '<small> /100</small></b></div><div class="tile"><span>Восстановление</span><b class="' + scoreClass(s.recovery) + '">' + num(s.recovery) + '<small> /100</small></b></div><div class="tile"><span>Риск · демо</span><b class="' + riskClass(s.risk) + '">' + (s.risk == null ? '—' : s.risk) + '<small> %</small></b></div></div>' +
        '<div class="kv"><div><span>' + icon('sleep', 'icon-sm') + 'Сон</span><b>' + D.fmtHours(s.sleep) + '</b></div><div><span>' + icon('heart', 'icon-sm') + 'HRV</span><b>' + (s.hrv == null ? '—' : num(s.hrv) + ' мс') + '</b></div></div>' +
        (s.signal ? '<div class="note warn">' + icon('alert', 'icon-sm') + '<span><b>Ранний сигнал: ' + esc(s.signal) + '.</b><br>' + s.flags.map(function (f) { return esc(f.t); }).join(' · ') + '. Рекомендуется оценка спортивного врача. Не является диагнозом.</span></div>' :
          s.status === 'nodata' ? '<div class="note">' + icon('info', 'icon-sm') + '<span>Ожидаем данные с устройства. Первые 14–28 дней формируется личная норма — показатели выводятся без алертов.</span></div>' :
          '<div class="note">' + icon('check', 'icon-sm') + '<span>Отклонений от личной нормы не обнаружено.</span></div>') +
        (s.status !== 'nodata' ? lineChart({ labels: days.map(function (d) { return d.date; }), label: 'Готовность и восстановление за 14 дней', series: [{ name: 'Готовность', color: 'var(--violet)', values: days.map(function (d) { return d.readiness; }), area: true }, { name: 'Восстановление', color: 'var(--mint)', values: days.map(function (d) { return d.recovery; }), dash: true }], height: 190, min: 20, max: 100 }) : '') +
        '<div class="note">' + icon('shield', 'icon-sm') + '<span>Демонстрационный профиль. Показатели не относятся к реальному состоянию человека.</span></div>' +
      '</div>' +
      '<div class="drawer-foot">' + (a.custom ? '<button class="btn btn-danger" type="button" data-remove="' + a.id + '">' + icon('trash', 'icon-sm') + 'Удалить</button>' : '<a class="btn btn-ghost" href="#/medical/' + a.id + '">' + icon('flask', 'icon-sm') + 'Медданные</a>') +
        '<a class="btn btn-primary" href="#/twin/' + a.id + '">Цифровой двойник ' + icon('arrow', 'icon-sm') + '</a></div></aside>';
    var root = document.createElement('div');
    root.id = 'drawer-root';
    root.innerHTML = html;
    document.body.appendChild(root);
    mountCharts(root);
    var dr = root.querySelector('.drawer');
    dr.addEventListener('keydown', trapKeys(dr, closeDrawer));
    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-close-drawer]')) closeDrawer();
      if (e.target.closest('a[href^="#/"]')) closeDrawer(true);
      var rm = e.target.closest('[data-remove]');
      if (rm) {
        var rid = rm.getAttribute('data-remove');
        state.custom = state.custom.filter(function (c) { return c.id !== rid; });
        delete state.checkins[rid];
        save(); rebuild(); closeDrawer(); render(); toast('Профиль удалён из демо-состава');
      }
    });
    setTimeout(function () { var b = dr.querySelector('.drawer-head .icon-btn'); if (b) b.focus(); }, 30);
  }
  function closeDrawer(silent) {
    var r = document.getElementById('drawer-root');
    if (r) { r.remove(); ui.openId = null; if (!silent && lastFocus && lastFocus.focus) lastFocus.focus(); }
  }

  /* ======================= Modals ======================= */
  function reportModal() {
    var t = team();
    openModal('<div class="modal-head"><span class="mi">' + icon('file') + '</span><div><h2 id="modal-title">Создать отчёт</h2><p>Экспорт показателей команды в CSV для Excel</p></div></div>' +
      '<div class="modal-body"><div class="field"><label for="rep-type">Тип отчёта</label><select class="select" id="rep-type">' + Object.keys(REPORTS).map(function (k) { return '<option value="' + k + '">' + REPORTS[k].title + '</option>'; }).join('') + '</select></div>' +
      '<div class="note">' + icon('users', 'icon-sm') + '<span><b>Сборная Казахстана · водное поло</b><br>' + t.total + ' ' + plural(t.total, 'спортсмен', 'спортсмена', 'спортсменов') + ' · срез на ' + fmtFull.format(asOfDate()) + '</span></div>' +
      '<p class="muted" style="margin:0;font-size:12.5px">Экспорт содержит демонстрационный срез, а не исторические измерения или медицинские заключения.</p></div>' +
      '<div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Отмена</button><button class="btn btn-primary" type="button" id="rep-go">' + icon('download', 'icon-sm') + 'Скачать отчёт</button></div>', {
      mount: function (m) { m.querySelector('#rep-go').addEventListener('click', function () { downloadReport(m.querySelector('#rep-type').value); closeModal(); }); }
    });
  }

  function addAthleteModal() {
    var used = model.athletes.map(function (a) { return Number(a.num); });
    var next = 1; while (used.indexOf(next) > -1) next++;
    openModal('<div class="modal-head"><span class="mi">' + icon('users') + '</span><div><h2 id="modal-title">Новый спортсмен</h2><p>Добавьте спортсмена в демонстрационный состав</p></div></div>' +
      '<form class="modal-body" id="add-form" novalidate>' +
        '<div class="field"><label for="add-name">Имя и фамилия <span class="req" aria-hidden="true">*</span></label><input class="input" id="add-name" maxlength="60" placeholder="Например, Алексей Иванов" autocomplete="off" aria-describedby="add-err" required><span class="err" id="add-err"></span></div>' +
        '<div class="grid g-2" style="gap:12px"><div class="field"><label for="add-pos">Амплуа</label><select class="select" id="add-pos"><option value="fw">Нападающий</option><option value="cf">Центральный нападающий</option><option value="df">Защитник</option><option value="gk">Вратарь</option></select></div>' +
        '<div class="field"><label for="add-num">Игровой номер</label><input class="input" id="add-num" type="number" min="1" max="99" value="' + next + '" aria-describedby="num-err"><span class="err" id="num-err"></span></div></div>' +
        '<div class="note">' + icon('info', 'icon-sm') + '<span>Не вводите реальные персональные или медицинские данные. Новому профилю не присваиваются прогнозы без измерений. Профиль хранится только в вашем браузере.</span></div>' +
        '<div class="modal-foot" style="margin-top:4px"><button class="btn btn-ghost" type="button" data-close>Отмена</button><button class="btn btn-primary" type="submit">' + icon('plus', 'icon-sm') + 'Добавить спортсмена</button></div>' +
      '</form>', {
      mount: function (m) {
        var f = m.querySelector('#add-form');
        f.addEventListener('submit', function (e) {
          e.preventDefault();
          var name = m.querySelector('#add-name'), n = m.querySelector('#add-num');
          var val = name.value.replace(/\s+/g, ' ').trim();
          var ok = true;
          if (val.length < 3 || !/^[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі\-\s']+$/.test(val)) { name.setAttribute('aria-invalid', 'true'); m.querySelector('#add-err').textContent = 'Укажите имя буквами (минимум 3 символа)'; ok = false; } else { name.removeAttribute('aria-invalid'); m.querySelector('#add-err').textContent = ''; }
          var nv = Number(n.value);
          if (!(nv >= 1 && nv <= 99)) { n.setAttribute('aria-invalid', 'true'); m.querySelector('#num-err').textContent = 'Номер от 1 до 99'; ok = false; }
          else if (used.indexOf(nv) > -1) { n.setAttribute('aria-invalid', 'true'); m.querySelector('#num-err').textContent = 'Номер уже занят'; ok = false; }
          else { n.removeAttribute('aria-invalid'); m.querySelector('#num-err').textContent = ''; }
          if (!ok) { (m.querySelector('[aria-invalid="true"]') || name).focus(); return; }
          var id = 'c' + Date.now().toString(36);
          state.custom.push({ id: id, name: val, pos: m.querySelector('#add-pos').value, num: nv });
          save(); rebuild(); closeModal();
          if (current.page !== 'athletes') go('athletes'); else render();
          toast('Спортсмен добавлен: ' + val);
          setTimeout(function () { openAthlete(id); }, 60);
        });
      }
    });
  }

  function checkinModal(id) {
    var a = byId(id);
    if (!a) return;
    var fields = [['mood', 'Настроение', 'Плохое', 'Отличное', 4], ['stress', 'Уровень стресса', 'Низкий', 'Высокий', 2], ['motivation', 'Мотивация', 'Низкая', 'Высокая', 4], ['sleepq', 'Качество сна', 'Плохое', 'Отличное', 4], ['soreness', 'Мышечная болезненность', 'Нет', 'Сильная', 2]];
    openModal('<div class="modal-head"><span class="mi">' + icon('brain') + '</span><div><h2 id="modal-title">Как вы себя чувствуете?</h2><p>' + esc(a.short) + ' · ежедневный демо-чек-ин</p></div></div>' +
      '<form class="modal-body" id="ci-form">' + fields.map(function (f) {
        return '<div class="slider-row"><div class="top"><label for="ci-' + f[0] + '">' + f[1] + '</label><output id="ci-' + f[0] + '-o" for="ci-' + f[0] + '">' + f[4] + ' / 5</output></div><input class="range" type="range" id="ci-' + f[0] + '" min="1" max="5" step="1" value="' + f[4] + '" aria-valuetext="' + f[4] + ' из 5"><div class="ends" aria-hidden="true"><span>' + f[2] + '</span><span>' + f[3] + '</span></div></div>';
      }).join('') +
      '<div class="field"><label for="ci-note">Комментарий (по желанию)</label><textarea class="textarea" id="ci-note" maxlength="300" placeholder="Что важно знать специалисту сегодня?"></textarea></div>' +
      '<div class="note">' + icon('info', 'icon-sm') + '<span>Детальные ответы видит только психолог. Тренер — обобщённый статус. Это не психологическая диагностика; при выраженном дистрессе обратитесь к специалисту.</span></div>' +
      '<div class="modal-foot" style="margin-top:4px"><button class="btn btn-ghost" type="button" data-close>Отмена</button><button class="btn btn-primary" type="submit">' + icon('check', 'icon-sm') + 'Сохранить чек-ин</button></div></form>', {
      mount: function (m) {
        fields.forEach(function (f) {
          var r = m.querySelector('#ci-' + f[0]), o = m.querySelector('#ci-' + f[0] + '-o');
          r.addEventListener('input', function () { o.textContent = r.value + ' / 5'; r.setAttribute('aria-valuetext', r.value + ' из 5'); });
        });
        m.querySelector('#ci-form').addEventListener('submit', function (e) {
          e.preventDefault();
          var entry = { ts: Date.now(), note: m.querySelector('#ci-note').value.trim().slice(0, 300) };
          fields.forEach(function (f) { entry[f[0]] = Number(m.querySelector('#ci-' + f[0]).value); });
          state.checkins[a.id] = [entry].concat(state.checkins[a.id] || []).slice(0, 20);
          save(); closeModal(); render();
          toast('Чек-ин сохранён');
        });
      }
    });
  }

  function confirmReset() {
    openModal('<div class="modal-head"><span class="mi" style="background:var(--red-soft);color:var(--red)">' + icon('refresh') + '</span><div><h2 id="modal-title">Сбросить демо-данные?</h2><p>Добавленные спортсмены, чек-ины, решения по рекомендациям и настройки будут удалены из этого браузера.</p></div></div>' +
      '<div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Отмена</button><button class="btn btn-danger" type="button" id="do-reset">Сбросить</button></div>', {
      mount: function (m) {
        m.querySelector('#do-reset').addEventListener('click', function () {
          var keepTheme = state.theme;
          state = defaults(); state.theme = keepTheme;
          save(); rebuild(); applyTheme(); closeModal(); render(); toast('Демо-данные сброшены');
        });
      }
    });
  }

  /* ======================= Popovers ======================= */
  function datePopover(btn) {
    var items = '';
    for (var i = 0; i < 14; i++) {
      var d = new Date(model.today); d.setDate(d.getDate() - i);
      var lbl = i === 0 ? 'Сегодня' : i === 1 ? 'Вчера' : new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(d);
      items += '<button class="menu-item" type="button" role="menuitemradio" aria-checked="' + (state.offset === i) + '" data-offset="' + i + '"><span><b style="font-weight:600">' + fmtFull.format(d) + '</b><span class="sub">' + lbl + '</span></span>' + (state.offset === i ? icon('check', 'icon-sm tick') : '') + '</button>';
    }
    openPopover(btn, '<h3>Дата среза</h3>' + items, {
      mount: function (p) { p.addEventListener('click', function (e) { var b = e.target.closest('[data-offset]'); if (!b) return; state.offset = Number(b.getAttribute('data-offset')); save(); closePopover(); render(); toast('Срез: ' + fmtFull.format(asOfDate())); }); }
    });
  }
  function profilePopover(btn) {
    var html = '<h3>Роль в демо-кабинете</h3>' + Object.keys(ROLES).map(function (k) {
      var r = ROLES[k];
      return '<button class="menu-item" type="button" role="menuitemradio" aria-checked="' + (state.role === k) + '" data-role="' + k + '"><span class="avatar ' + avClass(k) + '" style="width:30px;height:30px;font-size:11px">' + r.initials + '</span><span><b style="font-weight:600">' + r.name + '</b><span class="sub">' + r.title + '</span></span>' + (state.role === k ? icon('check', 'icon-sm tick') : '') + '</button>';
    }).join('') + '<div class="menu-sep"></div>' +
      '<a class="menu-item" href="#/settings" role="menuitem">' + icon('settings', 'icon-sm') + 'Настройки</a>' +
      '<a class="menu-item" href="#/help" role="menuitem">' + icon('help', 'icon-sm') + 'Помощь и поддержка</a>' +
      '<a class="menu-item" href="/" role="menuitem">' + icon('logout', 'icon-sm') + 'Выйти на сайт</a>';
    openPopover(btn, html, {
      mount: function (p) {
        p.addEventListener('click', function (e) {
          var b = e.target.closest('[data-role]');
          if (b) { setRole(b.getAttribute('data-role')); closePopover(); }
          else if (e.target.closest('a')) closePopover();
        });
      }
    });
  }
  function setRole(r) { state.role = r; save(); render(); toast('Роль: ' + ROLES[r].title); }
  function notifPopover(btn) {
    var notes = buildNotes();
    var html = '<div class="notif-head"><b>Уведомления</b><span class="muted" style="font-size:12.5px">События команды · демо</span></div><div class="notif-list">' +
      notes.map(function (n, i) { return '<button class="notif-item' + (n.unread ? ' unread' : '') + '" type="button" data-note="' + i + '"><span class="ni ' + (n.kind === 'warn' ? '' : n.kind) + '">' + icon(n.kind === 'warn' ? 'alert' : n.kind === 'ok' ? 'file' : 'info', 'icon-sm') + '</span><span><b>' + esc(n.title) + '</b><span>' + esc(n.text) + '</span><time>' + esc(n.time) + '</time></span></button>'; }).join('') +
      '</div><div class="notif-foot"><button class="btn btn-ghost btn-sm btn-block" type="button" data-readall>' + icon('check', 'icon-sm') + 'Отметить всё прочитанным</button></div>';
    openPopover(btn, html, {
      cls: 'notif', role: 'dialog',
      mount: function (p) {
        p.setAttribute('aria-label', 'Уведомления');
        p.addEventListener('click', function (e) {
          var b = e.target.closest('[data-note]');
          if (b) { var n = notes[Number(b.getAttribute('data-note'))]; if (state.read.indexOf(n.id) < 0) state.read.push(n.id); save(); closePopover(); updateShell(); n.go(); return; }
          if (e.target.closest('[data-readall]')) { notes.forEach(function (n) { if (state.read.indexOf(n.id) < 0) state.read.push(n.id); }); state.read = state.read.slice(-200); save(); closePopover(); updateShell(); toast('Все уведомления прочитаны'); }
        });
      }
    });
  }
  function colsPopover(btn) {
    var defs = [['readiness', 'Готовность'], ['recovery', 'Восстановление'], ['risk', 'Риск травмы'], ['sleep', 'Сон'], ['hrv', 'HRV'], ['status', 'Статус']];
    openPopover(btn, '<h3>Колонки таблицы</h3>' + defs.map(function (d) { return '<label class="menu-item check" style="color:var(--text);font-size:14px"><input type="checkbox" data-col="' + d[0] + '" ' + (state.cols[d[0]] ? 'checked' : '') + '>' + d[1] + '</label>'; }).join(''), {
      mount: function (p) {
        p.addEventListener('change', function (e) {
          var c = e.target.getAttribute('data-col'); if (!c) return;
          state.cols[c] = e.target.checked; save();
          var tw = document.getElementById('ath-table');
          if (tw) { var t = team(); var rows = sortRows(filterRows(t.list, state.filter)); if (ui.q) { var q = ui.q.toLowerCase(); rows = rows.filter(function (x) { return (x.a.short + ' ' + x.a.posName + ' ' + x.a.num).toLowerCase().indexOf(q) > -1; }); } tw.innerHTML = teamTable(rows, state.cols, { sortable: true }); }
        });
      }
    });
  }

  /* ======================= Command palette ======================= */
  function cmdk() {
    var pages = Object.keys(PAGES).map(function (k) { return { type: 'page', label: PAGES[k][0], sub: 'Раздел', run: function () { go(k); } }; });
    var actions = [
      { type: 'act', label: 'Создать отчёт', sub: 'Действие', run: reportModal },
      { type: 'act', label: 'Добавить спортсмена', sub: 'Действие', run: addAthleteModal },
      { type: 'act', label: 'Переключить тему', sub: 'Действие', run: toggleTheme }
    ];
    var people = model.athletes.map(function (a) { var s = snapOf(a); return { type: 'person', a: a, label: a.short, sub: a.posName + ' · № ' + a.num + ' · ' + STATUS[s.status][1], run: function () { openAthlete(a.id); } }; });
    var sel = 0, items = [];
    var m = openModal('<div class="cmdk-input">' + icon('search') + '<label class="sr-only" for="cmdk-q">Поиск</label><input id="cmdk-q" type="search" placeholder="Найти спортсмена, раздел или действие…" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="cmdk-list"><span class="kbd">Esc</span></div><div class="cmdk-list" id="cmdk-list" role="listbox" aria-label="Результаты"></div><div class="cmdk-foot"><span><span class="kbd">↑</span><span class="kbd">↓</span> выбор</span><span><span class="kbd">Enter</span> открыть</span></div>', { cls: 'cmdk', focus: '#cmdk-q' });
    m.querySelector('.modal-close').remove();
    var input = m.querySelector('#cmdk-q'), list = m.querySelector('#cmdk-list');
    function draw() {
      var q = input.value.trim().toLowerCase();
      function match(x) { return !q || (x.label + ' ' + x.sub).toLowerCase().indexOf(q) > -1; }
      var p = people.filter(match), pg = pages.filter(match), ac = actions.filter(match);
      if (!q) p = p.filter(function (x) { var s = snapOf(x.a); return s.status === 'attention' || s.signal; }).slice(0, 5);
      items = p.concat(pg, ac);
      sel = Math.min(sel, Math.max(0, items.length - 1));
      var html = '', i = 0;
      function group(title, arr) {
        if (!arr.length) return;
        html += '<div class="cmdk-group">' + title + '</div>';
        arr.forEach(function (x) {
          var ic = x.type === 'person' ? '<span class="avatar ' + avClass(x.a.id) + '" style="width:30px;height:30px;font-size:11px">' + esc(x.a.initials) + '</span>' : '<span class="ci">' + icon(x.type === 'page' ? 'grid' : 'spark', 'icon-sm') + '</span>';
          html += '<button class="cmdk-item" type="button" role="option" id="cmdk-' + i + '" aria-selected="' + (i === sel) + '" data-i="' + i + '">' + ic + '<span>' + esc(x.label) + '</span><span class="sub">' + esc(x.sub) + '</span></button>';
          i++;
        });
      }
      group(q ? 'Спортсмены' : 'Требуют внимания', p); group('Разделы', pg); group('Действия', ac);
      list.innerHTML = html || '<div class="empty">' + icon('search') + 'Ничего не найдено</div>';
      input.setAttribute('aria-activedescendant', items.length ? 'cmdk-' + sel : '');
      var cur = list.querySelector('[aria-selected="true"]'); if (cur) cur.scrollIntoView({ block: 'nearest' });
    }
    function run(i) { var x = items[i]; if (!x) return; closeModal(); x.run(); }
    input.addEventListener('input', function () { sel = 0; draw(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
    });
    list.addEventListener('click', function (e) { var b = e.target.closest('[data-i]'); if (b) run(Number(b.getAttribute('data-i'))); });
    draw();
  }

  /* ======================= Global events ======================= */
  function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme');
    state.theme = cur === 'light' ? 'dark' : 'light';
    save(); applyTheme(); render();
  }
  function decide(id, status) {
    if (status === 'undo') delete state.decisions[id];
    else state.decisions[id] = { status: status, ts: Date.now(), by: ROLES[state.role].name + ' (' + ROLES[state.role].title.toLowerCase() + ')' };
    save(); render();
    toast(status === 'accepted' ? 'Рекомендация согласована и записана в журнал' : status === 'declined' ? 'Рекомендация отклонена' : 'Решение отменено');
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var act = t.closest('[data-action]');
    if (act) {
      var a = act.getAttribute('data-action');
      if (a === 'report') reportModal();
      else if (a === 'add-athlete') addAthleteModal();
      else if (a === 'checkin') checkinModal(act.getAttribute('data-id'));
      else if (a === 'cmdk') cmdk();
      else if (a === 'date') datePopover(act);
      else if (a === 'profile') profilePopover(act);
      else if (a === 'notifications') notifPopover(act);
      else if (a === 'theme') toggleTheme();
      else if (a === 'cols') colsPopover(act);
      else if (a === 'reset') confirmReset();
      else if (a === 'clear-journal') { state.decisions = {}; save(); render(); toast('Журнал очищен'); }
      else if (a === 'open-side') { document.body.classList.add('side-open'); act.setAttribute('aria-expanded', 'true'); var f = document.querySelector('.sidebar .nav-item'); if (f) f.focus(); }
      else if (a === 'close-side') { document.body.classList.remove('side-open'); }
      return;
    }
    if (!view.contains(t)) return;
    var open = t.closest('[data-open]');
    if (open) { openAthlete(open.getAttribute('data-open')); return; }
    var srt = t.closest('[data-sort]');
    if (srt) { var k = srt.getAttribute('data-sort'); if (state.sort.key === k) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc'; else { state.sort.key = k; state.sort.dir = k === 'name' ? 'asc' : 'desc'; } save(); render(); return; }
    var flt = t.closest('[data-filter]');
    if (flt) { state.filter = flt.getAttribute('data-filter'); save(); render(); return; }
    var rng = t.closest('[data-range]');
    if (rng) { state.range = Number(rng.getAttribute('data-range')); save(); render(); return; }
    var src = t.closest('[data-src]');
    if (src) { state.medSource = src.getAttribute('data-src'); save(); render(); return; }
    var dec = t.closest('[data-decide]');
    if (dec) { decide(dec.getAttribute('data-rec'), dec.getAttribute('data-decide')); return; }
    var rf = t.closest('[data-recf]');
    if (rf) { state.recFilter = rf.getAttribute('data-recf'); save(); render(); return; }
    var dl = t.closest('[data-download]');
    if (dl) { downloadReport(dl.getAttribute('data-download')); return; }
    var ts = t.closest('[data-theme-set]');
    if (ts) { state.theme = ts.getAttribute('data-theme-set'); save(); applyTheme(); render(); return; }
    var rs = t.closest('[data-role-set]');
    if (rs) { setRole(rs.getAttribute('data-role-set')); return; }
  });

  view.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-open]')) { e.preventDefault(); openAthlete(e.target.getAttribute('data-open')); }
  });

  document.addEventListener('keydown', function (e) {
    var typing = /input|textarea|select/i.test((e.target.tagName || '')) || e.target.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л')) { e.preventDefault(); if (!document.getElementById('modal-root')) cmdk(); return; }
    if (typing || document.getElementById('modal-root')) return;
    if (e.key === '/') { e.preventDefault(); cmdk(); }
    else if (e.key === '?') { go('help'); }
    else if (e.key === 'Escape') { if (document.getElementById('drawer-root')) closeDrawer(); else if (document.body.classList.contains('side-open')) document.body.classList.remove('side-open'); }
  });

  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: light)');
    var onChange = function () { if (state.theme === 'system') { applyTheme(); render(); } };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }

  var kh = document.getElementById('kbd-hint');
  if (kh && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) kh.textContent = '⌘ K';
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  window.addEventListener('hashchange', function () { closeDrawer(true); closePopover(); render(); view.focus({ preventScroll: true }); window.scrollTo(0, 0); });
  applyTheme();
  render();
})();
