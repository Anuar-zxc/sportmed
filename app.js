/* AI Sports Precision Medicine — демо-кабинет
   Одностраничное приложение без фреймворков. Данные вымышленные (data.js).
   Действия пользователя (добавленные спортсмены, чек-ины, решения по рекомендациям, настройки)
   хранятся только в localStorage этого браузера и никуда не отправляются. */
(function () {
  'use strict';

  var D = window.ASPData;
  var STORE = 'asp_app_v1';
  var PSTORE = 'asp_pilot_v1';
  var EMAIL = 'ulasanuar@gmail.com';
  var view = document.getElementById('view');

  /* ======================= State ======================= */
  function defaults() {
    return {
      theme: 'light', ui: 2, compact: false, role: 'doctor', offset: 0, profile: null,
      custom: [], checkins: {}, decisions: {}, read: [],
      staff: null, consents: {}, audit: [], auditFilter: 'all', consentAthlete: 'a03', ws: 'demo',
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
      if (saved.ui !== 2) { s.theme = 'light'; s.ui = 2; } // новое оформление: один раз переключаем на светлую тему
    } catch (e) { /* ignore */ }
    return s;
  }
  var state = load();
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  save();

  /* ----- Рабочее пространство «Моя команда» (режим пилота): данные только на этом устройстве ----- */
  function loadPilot() {
    try {
      var p = JSON.parse(localStorage.getItem(PSTORE) || 'null');
      if (p && p.team && Array.isArray(p.athletes) && p.records) return p;
    } catch (e) { /* ignore */ }
    return null;
  }
  var pilot = loadPilot();
  function savePilot() {
    if (!pilot) return;
    try { localStorage.setItem(PSTORE, JSON.stringify(pilot)); }
    catch (e) { toast('Хранилище браузера переполнено — сделайте резервную копию и очистите старые записи'); }
  }
  function isPilot() { return state.ws === 'pilot' && !!pilot; }
  function pilotRec(id, iso) {
    pilot.records[id] = pilot.records[id] || {};
    return (pilot.records[id][iso] = pilot.records[id][iso] || {});
  }
  function pilotRecordCount() {
    var n = 0;
    if (pilot) Object.keys(pilot.records).forEach(function (k) { n += Object.keys(pilot.records[k]).length; });
    return n;
  }

  var ML = window.ASPML;
  function buildModel() {
    return isPilot() ? D.build({ pilot: pilot }) : D.build({ custom: state.custom, checkins: state.checkins });
  }
  var model = buildModel();
  function rebuild() { model = buildModel(); }
  var ui = { q: '', openId: null };

  var ROLES = {
    doctor: { name: 'Алия Касымова', initials: 'АК', title: 'Спортивный врач' },
    coach: { name: 'Серик Нуртаев', initials: 'СН', title: 'Главный тренер' },
    psych: { name: 'Мария Ли', initials: 'МЛ', title: 'Спортивный психолог' },
    admin: { name: 'Айгерим Нурланова', initials: 'АН', title: 'Администратор' }
  };
  /* В режиме пилота — реальные имена сотрудников этого устройства; в демо — вымышленные персонажи */
  function initialsOf(name) {
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    return ((p[0] || '?').charAt(0) + (p[1] ? p[1].charAt(0) : '')).toUpperCase();
  }
  function who(k) {
    var base = ROLES[k] || ROLES.doctor;
    var pn = state.profile && state.profile.role === k ? String(state.profile.name || '').trim().slice(0, 60) : '';
    if (!isPilot()) return pn ? { name: pn, initials: initialsOf(pn), title: base.title } : base;
    var nm = String((pilot.staff || {})[k] || pn || '').trim().slice(0, 60);
    return { name: nm || base.title, initials: nm ? initialsOf(nm) : initialsOf(base.title), title: base.title, unnamed: !nm };
  }
  function can(what) {
    var r = state.role;
    if (what === 'labs') return r === 'doctor';
    if (what === 'psych') return r === 'psych';
    if (what === 'medical-decision') return r === 'doctor';
    if (what === 'admin') return r === 'admin';
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
  function riskClass(rr) { if (rr == null) return 'muted'; return rr >= D.RR_HIGH ? 'val-bad' : rr >= D.RR_MID ? 'val-warn' : ''; } // обычный риск — обычным текстом, цветом выделяем только повышенный
  function fmtRisk(s) { return s.risk == null ? '—' : num(s.risk, 1) + '%'; }
  function fmtRR(rr) { return rr == null ? '—' : '×' + num(rr, 1); }
  function riskTip(s) { return s.risk == null ? 'Недостаточно истории нагрузки для прогноза' : 'Оценка вероятности травмы на 7 дней: ' + num(s.risk, 1) + '% · ' + fmtRR(s.rr) + ' к среднему уровню'; }
  function scoreColor(v) { return v == null ? 'var(--faint)' : v >= 75 ? 'var(--mint)' : v >= 60 ? 'var(--text-2)' : v >= 45 ? 'var(--orange)' : 'var(--red)'; }
  var STATUS = {
    ready: ['ok', 'Готов к нагрузке'], attention: ['bad', 'Требует внимания'],
    recovery: ['warn', 'Восстановление'], nodata: ['mute', 'Ожидает данных'],
    nocheckin: ['mute', 'Нет чек-ина']
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
    function avg(k) { var vals = valid.map(function (x) { return x.s[k]; }).filter(function (v) { return v != null; }); return vals.length ? Math.round(D.mean(vals)) : null; }
    function avgPrev(k) { return Math.round(D.mean(valid.map(function (x) { return x.s[k]; }).filter(function (v) { return v != null; }))); }
    var series = function (k, days) {
      var out = [];
      for (var i = days - 1; i >= 0; i--) {
        var off = state.offset + i;
        var vals = model.athletes.map(function (a) { return D.snapshot(a, off)[k]; }).filter(function (v) { return v != null && v === v; });
        out.push(vals.length ? Math.round(D.mean(vals)) : null);
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
      nodata: list.filter(function (x) { return x.s.status === 'nodata' || x.s.status === 'nocheckin'; }),
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
      if (kinds.indexOf('load') > -1 || kinds.indexOf('hi') > -1) {
        recs.push({ id: 'load-' + a.id, a: a, cat: 'Нагрузка', ic: 'load', tone: 'o', owner: 'coach', prio: 'Высокий', title: 'Скорректировать нагрузку', text: 'снизить объём на 15% и убрать высокоинтенсивную работу на 48 часов; проверить сценарий в планировщике нагрузки.', why: why });
      } else if (kinds.indexOf('model') > -1) {
        recs.push({ id: 'model-' + a.id, a: a, cat: 'Нагрузка', ic: 'shield', tone: 'o', owner: 'coach', prio: 'Высокий', title: 'Пересмотреть план на 3 дня', text: 'модель отмечает повышенный риск травмы — сравнить варианты нагрузки в планировщике и согласовать с врачом.', why: why });
      }
      if (s.fc && s.fc.pLow >= 0.3) {
        recs.push({ id: 'low-' + a.id, a: a, cat: 'Готовность', ic: 'activity', tone: '', owner: 'coach', prio: 'Средний', title: 'Подготовить облегчённый вариант тренировки', text: 'вероятность дня низкой готовности завтра ' + Math.round(s.fc.pLow * 100) + '% — заложить альтернативу с меньшей интенсивностью.', why: ['Прогноз ' + num(s.fc.value, 1) + ' / 10', 'Модель готовности'] });
      }
      if (kinds.indexOf('sleep') > -1) {
        recs.push({ id: 'sleep-' + a.id, a: a, cat: 'Восстановление', ic: 'sleep', tone: '', owner: 'any', prio: 'Средний', title: 'Сфокусироваться на восстановлении', text: 'увеличить сон на 45 минут и добавить активное восстановление.', why: why });
      }
      if (kinds.indexOf('hrv') > -1 && kinds.indexOf('load') < 0 && kinds.indexOf('hi') < 0) {
        recs.push({ id: 'hrv-' + a.id, a: a, cat: 'Медицина', ic: 'stetho', tone: 'o', owner: 'doctor', prio: 'Высокий', title: 'Осмотр спортивного врача', text: 'HRV ниже личной нормы несколько дней подряд — оценка врача до следующей интенсивной тренировки.', why: why });
      }
      if (kinds.indexOf('crp') > -1) {
        recs.push({ id: 'crp-' + a.id, a: a, cat: 'Медицина', ic: 'stetho', tone: 'o', owner: 'doctor', prio: 'Высокий', title: 'Оценка воспалительного маркера', text: 'СРБ выше референса — осмотр; решение о допуске к тренировкам принимает врач.', why: why });
      }
      if (kinds.indexOf('self') > -1 || kinds.indexOf('sore') > -1) {
        recs.push({ id: 'self-' + a.id, a: a, cat: 'Самочувствие', ic: 'brain', tone: '', owner: 'any', prio: 'Средний', title: 'Поговорить со спортсменом', text: 'самооценка в чек-ине заметно ниже обычного — короткий разговор до тренировки и, при необходимости, облегчённый план.', why: why });
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
    t.nodata.forEach(function (x) { notes.push({ id: 'n-nd-' + x.a.id, kind: 'warn', title: (x.s.status === 'nocheckin' ? 'Нет чек-ина: ' : 'Нет данных: ') + x.a.short, text: x.a.pilot ? 'Сегодня нет записей — напомните заполнить чек-ин' : (x.a.custom ? 'Новый профиль — подключите устройство' : 'Браслет не синхронизировался более 48 часов'), time: '06:55', go: function () { openAthlete(x.a.id); } }); });
    if (model.athletes[0] && model.athletes[0].labDate) notes.push({ id: 'n-labs', kind: 'info', title: 'Загружены результаты анализов', text: 'Лабораторная панель от ' + dDay(model.athletes[0].labDate) + ' · 23 спортсмена', time: 'вчера', go: function () { go('medical'); } });
    var noCheck = isPilot()
      ? model.athletes.filter(function (a) { var dd = a.days[a.days.length - 1]; return !dd || !dd.well; }).length
      : model.athletes.filter(function (a) { return !(state.checkins[a.id] || []).length; }).length;
    notes.push({ id: 'n-check', kind: 'info', title: 'Утренний чек-ин', text: 'Не заполнили ' + noCheck + ' ' + plural(noCheck, 'спортсмен', 'спортсмена', 'спортсменов'), time: '08:00', go: function () { go('twin'); } });
    notes.push({ id: 'n-report', kind: 'ok', title: 'Еженедельный отчёт готов', text: 'Состояние команды — CSV для Excel', time: 'пн', go: function () { go('reports'); } });
    if (isPilot() && pilotRecordCount() > 0 && (!pilot.lastBackup || Date.now() - pilot.lastBackup > 7 * 864e5)) {
      notes.unshift({ id: 'n-backup-' + new Date().toISOString().slice(0, 10), kind: 'warn', title: 'Пора сделать резервную копию', text: pilot.lastBackup ? 'Последняя копия — больше недели назад' : 'Копии ещё не было: при очистке браузера данные пропадут', time: 'сейчас', go: function () { backupModal(); } });
    }
    notes.forEach(function (n) { n.unread = state.read.indexOf(n.id) < 0; });
    return notes;
  }

  /* ======================= Charts ======================= */
  var CHARTS = {};
  var chartSeq = 0;
  function lineChart(o) {
    var id = 'ch' + (++chartSeq);
    var W = 640, H = o.height || 220, pl = 34, pr = o.endLabels === false ? 12 : 46, pt = 12, pb = 26;
    var all = [];
    o.series.forEach(function (s) { s.values.forEach(function (v) { if (v != null && v === v) all.push(v); }); });
    if (!all.length) all = [0, 10];
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
      g += '<line class="' + (k === 0 ? 'base-line' : 'grid-line') + '" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy + '" y2="' + yy + '"/>';
      g += '<text class="axis-text" x="' + (pl - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + ((max - min) >= 8 ? Math.round(val) : num(val, 1)) + '</text>';
    }
    var every = n > 20 ? 5 : n > 10 ? 2 : 1;
    o.labels.forEach(function (d, i) { if (i % every === 0 || i === n - 1) g += '<text class="axis-text" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + dDay(d) + '</text>'; });
    var paths = '', ends = [];
    o.series.forEach(function (s, si) {
      var dpath = '', started = false;
      s.values.forEach(function (v, i) { if (v == null) { started = false; return; } dpath += (started ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); started = true; });
      if (s.area && dpath) {
        var first = s.values.findIndex(function (v) { return v != null; });
        var lastI2 = s.values.length - 1;
        while (lastI2 > 0 && s.values[lastI2] == null) lastI2--;
        paths += '<path d="' + dpath + 'L' + x(lastI2) + ' ' + (H - pb) + 'L' + x(first) + ' ' + (H - pb) + 'Z" style="fill:' + s.color + ';opacity:.07"/>';
      }
      paths += '<path d="' + dpath + '" fill="none" style="stroke:' + s.color + '" stroke-width="' + (s.width || 2.2) + '" stroke-linecap="round" stroke-linejoin="round"' + (s.dash ? ' stroke-dasharray="5 5"' : '') + '/>';
      if (!s.dash) {
        var li = s.values.length - 1; while (li > 0 && s.values[li] == null) li--;
        if (s.values[li] != null) {
          paths += '<circle cx="' + x(li) + '" cy="' + y(s.values[li]) + '" r="4" style="fill:' + s.color + '" stroke="var(--panel)" stroke-width="2"/>';
          ends.push({ x: x(li), y: y(s.values[li]), v: s.values[li], s: s });
        }
      }
    });
    // значение на конце линии — подпись текстовым цветом; при наложении подписываем только первую серию
    if (o.endLabels !== false) {
      ends.forEach(function (e, i) {
        if (ends.slice(0, i).some(function (p) { return Math.abs(p.y - e.y) < 15; })) return;
        paths += '<text class="end-label" x="' + (e.x + 9) + '" y="' + (e.y + 4) + '">' + num(e.v, e.s.dec || 0) + '</text>';
      });
    }
    CHARTS[id] = { o: o, x: x, y: y, W: W, H: H, pl: pl, pr: pr, step: step, n: n, pt: pt, pb: pb };
    var legend = o.series.length < 2 ? '' : '<div class="chart-legend">' + o.series.map(function (s) { return '<span><i class="' + (s.dash ? 'dash' : '') + '" style="background:' + s.color + ';color:' + s.color + '"></i>' + esc(s.name) + '</span>'; }).join('') + '</div>';
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
          html += '<div><i style="background:' + s.color + '"></i><strong>' + (v == null ? '—' : num(v, s.dec || 0)) + (s.unit || '') + '</strong><span>' + esc(s.name) + '</span></div>';
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
  /* Столбцы: тонкие (≤ 24 px), скругление 4 px только у вершины, подсказка на каждом столбце */
  function barChart(o) {
    var W = 640, H = o.height || 170, pl = 40, pr = 12, pt = 12, pb = 26;
    var vals = o.values.filter(function (v) { return v != null; });
    var rawMax = vals.length ? Math.max.apply(null, vals) : 1;
    var mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, rawMax))));
    var max = Math.ceil(rawMax / mag) * mag || 1;
    var n = o.values.length, band = (W - pl - pr) / n, bw = Math.min(24, band - 2);
    function y(v) { return pt + (H - pt - pb) * (1 - v / max); }
    var g = '';
    [0, 0.5, 1].forEach(function (k) {
      var yy = y(max * k);
      g += '<line class="' + (k === 0 ? 'base-line' : 'grid-line') + '" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy + '" y2="' + yy + '"/>';
      g += '<text class="axis-text" x="' + (pl - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + (max * k >= 1000 ? num(max * k / 1000, max * k % 1000 ? 1 : 0) + 'K' : Math.round(max * k)) + '</text>';
    });
    var every = n > 20 ? 5 : n > 10 ? 2 : 1, bars = '';
    o.labels.forEach(function (d, i) {
      var cx = pl + band * i + band / 2;
      if (i % every === 0 || i === n - 1) g += '<text class="axis-text" x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle">' + dDay(d) + '</text>';
      var v = o.values[i];
      var tip = fmtFull.format(d) + ': ' + (v == null ? 'нет данных' : v === 0 ? 'отдых' : num(v) + (o.unit || ''));
      if (v != null && v > 0) {
        var top = y(v), h = (H - pb) - top, r = Math.min(4, h, bw / 2), x0 = cx - bw / 2;
        bars += '<path class="bar" d="M' + x0 + ' ' + (H - pb) + 'V' + (top + r) + 'Q' + x0 + ' ' + top + ' ' + (x0 + r) + ' ' + top + 'H' + (x0 + bw - r) + 'Q' + (x0 + bw) + ' ' + top + ' ' + (x0 + bw) + ' ' + (top + r) + 'V' + (H - pb) + 'Z" style="fill:' + (i === n - 1 ? o.color : o.restColor || o.color) + '"><title>' + esc(tip) + '</title></path>';
      }
      bars += '<rect x="' + (pl + band * i) + '" y="' + pt + '" width="' + band + '" height="' + (H - pt - pb) + '" fill="transparent"><title>' + esc(tip) + '</title></rect>';
    });
    return '<div class="chart-wrap"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label || 'График') + '">' + g + bars + '</svg></div>';
  }
  function sparkline(values, color) {
    var W = 96, H = 34, v = values.filter(function (x) { return x != null; });
    if (v.length < 2) return '';
    var min = Math.min.apply(null, v), max = Math.max.apply(null, v); if (max === min) { max += 1; min -= 1; }
    var pts = values.map(function (val, i) { return val == null ? null : [(i / (values.length - 1)) * (W - 4) + 2, 4 + (H - 8) * (1 - (val - min) / (max - min))]; }).filter(Boolean);
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('');
    var last = pts[pts.length - 1];
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><path d="' + d + '" fill="none" style="stroke:var(--spark)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="3.5" style="fill:' + (color || 'var(--s1)') + '" stroke="var(--panel)" stroke-width="1.5"/></svg>';
  }
  function radar(axes) {
    var S = 340, c = S / 2, R = 100, n = axes.length, g = '';
    function pt(i, r) { var ang = -Math.PI / 2 + (2 * Math.PI * i) / n; return [c + Math.cos(ang) * r, c + Math.sin(ang) * r]; }
    [0.25, 0.5, 0.75, 1].forEach(function (k) {
      g += '<polygon points="' + axes.map(function (_, i) { return pt(i, R * k).join(','); }).join(' ') + '" fill="none" style="stroke:var(--line)"/>';
    });
    axes.forEach(function (a, i) { var p = pt(i, R); g += '<line x1="' + c + '" y1="' + c + '" x2="' + p[0] + '" y2="' + p[1] + '" style="stroke:var(--line)"/>'; });
    var poly = axes.map(function (a, i) { return pt(i, R * Math.max(0.05, (a.v == null ? 0 : a.v) / 100)).join(','); }).join(' ');
    g += '<polygon points="' + poly + '" style="fill:var(--s1);fill-opacity:.1;stroke:var(--s1)" stroke-width="2" stroke-linejoin="round"/>';
    axes.forEach(function (a, i) {
      var p = pt(i, R * Math.max(0.05, (a.v == null ? 0 : a.v) / 100));
      g += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4" style="fill:var(--s1)" stroke="var(--panel)" stroke-width="2"/>';
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
    // автофокус — только если пользователь ещё не начал работать в окне (не перехватываем фокус при быстром вводе)
    setTimeout(function () { if (m.contains(document.activeElement)) return; (f || m.querySelector('button')).focus(); }, 20);
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
    overview: ['Обзор команды', 'Состояние команды на выбранную дату.'],
    athletes: ['Спортсмены', 'Готовность, восстановление и риск каждого спортсмена.'],
    twin: ['Цифровой двойник', 'Все данные одного спортсмена: самочувствие, нагрузка, сон и анализы.'],
    medical: ['Медицинские данные', 'Анализы и показатели носимых устройств.'],
    analytics: ['AI-аналитика', 'Ранние сигналы, факторы риска и планировщик нагрузки.'],
    models: ['Модели ИИ', 'Как обучены модели, насколько они точны и где их пределы. Проверка на ваших данных.'],
    recommendations: ['Рекомендации', 'Персональные действия на сегодня. Решение принимает специалист.'],
    reports: ['Отчёты', 'Выгрузка показателей команды в CSV для Excel и в PDF.'],
    settings: ['Настройки', 'Рабочее пространство, роли доступа и источники данных.'],
    admin: ['Администрирование', 'Сотрудники, согласия спортсменов и журнал действий.'],
    about: ['О платформе', 'От проверенных рыночных механик — к клиническому контуру сопровождения команд.'],
    help: ['Помощь и поддержка', 'Как пользоваться кабинетом, горячие клавиши и контакты.']
  };
  var current = { page: 'overview', arg: null };

  function applyTheme() {
    var t = state.theme;
    if (t === 'system') t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#fbf8f3' : '#12100d');
    var ti = document.getElementById('theme-icon');
    if (ti) ti.setAttribute('href', t === 'light' ? '#i-moon' : '#i-sun');
    if (state.compact) document.documentElement.setAttribute('data-density', 'compact'); else document.documentElement.removeAttribute('data-density');
  }
  function updateShell() {
    var r = who(state.role);
    var tcN = document.getElementById('tc-name'), tcS = document.getElementById('tc-sub');
    if (tcN) {
      tcN.textContent = wsLabel();
      tcS.textContent = isPilot()
        ? pilot.athletes.length + ' ' + plural(pilot.athletes.length, 'спортсмен', 'спортсмена', 'спортсменов') + ' · ' + num(pilotRecordCount()) + ' ' + plural(pilotRecordCount(), 'запись', 'записи', 'записей')
        : '24 спортсмена · вымышленные данные';
    }
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
    document.title = PAGES[current.page][0] + (isPilot() ? ' — ' + (pilot.team.name || 'Моя команда') + ' · AI Sports' : ' — демо-кабинет AI Sports');
  }
  function go(page, arg) { location.hash = '#/' + page + (arg ? '/' + arg : ''); }

  function pageHead(page, extra) {
    var p = PAGES[page];
    return '<div class="page-head"><div><h1>' + p[0] + '</h1><p>' + p[1] + '</p></div>' +
      '<div class="page-actions">' + (extra || '') + '<button class="btn btn-primary" type="button" data-action="report">' + icon('download') + '<span class="lbl">Создать отчёт</span></button></div></div>';
  }
  function footerStrip() {
    return '<div class="footer-strip"><span>' + icon('shield', 'icon-sm') + (isPilot() ? 'Режим пилота · данные команды только на этом устройстве' : 'Защищённая среда · демонстрационные данные') + '</span><span>AI помогает. Решение принимает специалист.</span>' + (isPilot() ? '<button class="linklike" type="button" data-action="pilot-backup" style="color:var(--text-2)">Резервная копия ' + '</button>' : '<a href="#/about">Стратегия платформы ' + icon('arrow', 'icon-sm') + '</a>') + '</div>';
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
      if (window.console) console.error('render ' + page + ':', err);
      html = '<div class="panel panel-body"><b>Не удалось отобразить раздел.</b><p class="muted">' + (isPilot() ? 'Обновите страницу. Если не помогло — напишите нам: ' + EMAIL + '. Ваши данные не пострадали.' : 'Попробуйте сбросить демо-данные в настройках.') + '</p></div>';
      if (window.console) console.error(err);
    }
    view.innerHTML = html;
    mountCharts(view);
    if (MOUNT[page]) MOUNT[page]();
    animateNumbers(view);
    mountLive(view);
    view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter');
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
      '</span>' + (opts && opts.risk ? '<span class="' + riskClass(s.rr) + ' num" style="font-weight:700" title="' + esc(riskTip(s)) + '">' + fmtRisk(s) + '</span>' : '') + icon('right', 'icon-sm chev') + '</button>';
  }

  function teamTable(rows, cols, opts) {
    opts = opts || {};
    var colDefs = [
      { k: 'readiness', t: 'Готовность' }, { k: 'recovery', t: 'Восстановление' }, { k: 'risk', t: 'Риск травмы · 7 дн.' },
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
        if ((c.k === 'recovery' || c.k === 'readiness') && opts.lite) return '<td class="num" style="font-weight:600">' + (s[c.k] == null ? '—' : s[c.k]) + '<span class="muted" style="font-weight:400"> /100</span></td>';
        if (c.k === 'readiness' || c.k === 'recovery') {
          var v = s[c.k];
          return '<td><span class="bar"><b class="num" style="min-width:24px;font-weight:600">' + (v == null ? '—' : v) + '</b><span class="bar-track"><i style="width:' + (v || 0) + '%;background:' + (v != null && v < 45 ? 'var(--st-bad)' : v != null && v < 60 ? 'var(--st-warn)' : 'var(--bar-n)') + '"></i></span></span></td>';
        }
        if (c.k === 'risk') return '<td class="num ' + riskClass(s.rr) + '" style="font-weight:650" title="' + esc(riskTip(s)) + '">' + fmtRisk(s) + (s.rr != null ? ' <span class="muted" style="font-weight:400;font-size:12px">' + fmtRR(s.rr) + '</span>' : '') + '</td>';
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
      if (f === 'nocheckin') return x.s.status === 'nocheckin';
      if (f === 'attention') return x.s.status === 'attention';
      if (f === 'recovery') return x.s.status === 'recovery';
      if (f === 'nodata') return x.s.status === 'nodata' || x.s.status === 'nocheckin';
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

  /* ======================= Модели ИИ: общие блоки ======================= */
  var CARD_I = ML && ML.models ? ML.models.injury_card : null;
  var CARD_R = ML && ML.models ? ML.models.readiness_card : null;
  var R_LABELS = {
    readiness: 'Готовность сегодня', fatigue: 'Свежесть (1–5)', mood: 'Настроение', sleep_duration: 'Длительность сна', sleep_quality: 'Качество сна',
    soreness: 'Отсутствие болезненности', stress: 'Спокойствие (стресс)', readiness3: 'Готовность за 3 дня', fatigue3: 'Свежесть за 3 дня',
    soreness3: 'Болезненность за 3 дня', readiness_base: 'Личная норма готовности', srpe_today: 'Нагрузка сегодня (sRPE)',
    srpe7_rel: 'Нагрузка 7 дней к личной норме', acwr_srpe: 'ACWR по sRPE', monotony7_srpe: 'Монотонность нагрузки'
  };
  function signedBars(items, fmt, opts) {
    opts = opts || {};
    var max = Math.max.apply(null, items.map(function (x) { return Math.abs(x.v); }).concat([1e-9]));
    return '<div class="sbars">' + items.map(function (x) {
      var w = Math.max(2, Math.abs(x.v) / max * 50), pos = x.v >= 0;
      var good = opts.higherIsBad ? !pos : pos;
      return '<div class="sbar"><div class="sbar-top"><span>' + esc(x.name) + (x.sub ? ' <span class="muted">· ' + esc(x.sub) + '</span>' : '') + '</span><b class="' + (good ? 'val-good' : 'val-warn') + '">' + fmt(x.v) + '</b></div>' +
        '<div class="sbar-track" aria-hidden="true"><i style="' + (pos ? 'left:50%' : 'right:50%') + ';width:' + w.toFixed(1) + '%;background:' + (good ? 'var(--mint)' : 'var(--orange)') + '"></i></div></div>';
    }).join('') + '</div>';
  }
  function injuryFactorsHtml(a, n) {
    var f = D.factorBreakdown(a, state.offset);
    if (!f.length) return '<div class="empty">' + icon('info') + 'Недостаточно истории нагрузки (нужно ≥ 5 из 7 последних дней и ≥ 28 дней для личной нормы).</div>';
    return signedBars(f.slice(0, n || 6).map(function (x) { return { name: x.name, sub: x.value, v: x.odds }; }), function (v) { return (v >= 0 ? '+' : '−') + Math.abs(Math.round(v * 100)) + '%'; }, { higherIsBad: true }) +
      '<p class="muted" style="margin:6px 0 0;font-size:12.5px">Насколько каждый фактор меняет шансы травмы относительно среднего уровня в обучающих данных. Оранжевый — повышает риск, зелёный — снижает.</p>';
  }
  function forecastHtml(a, s, compact) {
    if (!s.fc) {
      return '<div class="note">' + icon('info', 'icon-sm') + '<span>Прогноз на завтра появится после утреннего чек-ина: нужна самооценка готовности сегодня и не менее 7 дней истории.</span></div>' +
        (state.offset === 0 && !compact ? '<button class="btn btn-primary btn-sm" type="button" data-action="checkin" data-id="' + a.id + '" style="align-self:flex-start">' + icon('brain', 'icon-sm') + 'Пройти чек-ин</button>' : '');
    }
    var fc = s.fc, low = Math.round(fc.pLow * 100), lowCls = fc.pLow >= 0.3 ? 'val-bad' : fc.pLow >= 0.2 ? 'val-warn' : 'val-good';
    var html = '<div class="metric-tiles fc-tiles"><div class="tile"><span>' + icon('activity', 'icon-sm') + 'Готовность завтра</span><b>' + num(fc.value, 1) + '<small> / 10</small></b><em>80%-интервал: ' + num(fc.lo, 1) + '–' + num(fc.hi, 1) + '</em></div>' +
      '<div class="tile"><span>' + icon('alert', 'icon-sm') + 'Риск «плохого дня»</span><b class="' + lowCls + '">' + low + '<small> %</small></b><em>в среднем ' + Math.round(fc.lowRate * 100) + '% дней</em></div></div>';
    if (!compact) {
      html += '<div><b style="font-size:13.5px;display:block;margin-bottom:8px">Что влияет на прогноз готовности</b>' +
        signedBars(fc.groups.slice().sort(function (p, q) { return Math.abs(q.v) - Math.abs(p.v); }), function (v) { return (v >= 0 ? '+' : '−') + num(Math.abs(v), 1); }) +
        '<p class="muted" style="margin:6px 0 0;font-size:12.5px">Вклад в баллах шкалы 0–10 относительно среднего игрока в обучающих данных.' + (s.userCheckin ? ' Учтён ваш чек-ин за этот день.' : '') + '</p></div>';
    }
    return html;
  }
  function modelBadge() { return '<span class="badge info plain" title="Модели обучены на открытых научных данных. Подробности — в разделе «Модели ИИ»">' + icon('spark', 'icon-sm') + 'Модель v1.0</span>'; }

  /* ---------- Планировщик нагрузки (что будет, если…) ---------- */
  function plannerHtml(a) {
    return '<div class="planner" id="planner" data-id="' + a.id + '">' +
      '<div class="slider-row"><div class="top"><label for="pl-load">Нагрузка в ближайшие 3 дня</label><output id="pl-load-o">100% обычного дня</output></div><input class="range" type="range" id="pl-load" min="0" max="200" step="10" value="100"><div class="ends" aria-hidden="true"><span>отдых</span><span>×2</span></div></div>' +
      '<div class="slider-row"><div class="top"><label for="pl-hi">Доля интенсивной работы</label><output id="pl-hi-o">100% обычной</output></div><input class="range" type="range" id="pl-hi" min="0" max="300" step="25" value="100"><div class="ends" aria-hidden="true"><span>без интенсива</span><span>×3</span></div></div>' +
      '<label class="menu-item check" style="padding:0;color:var(--text)"><input type="checkbox" id="pl-rest"> Один из трёх дней — полный отдых</label>' +
      '<div class="planner-out" id="pl-out" aria-live="polite"></div></div>';
  }
  function plannerRisk(a, loadPct, hiPct, restDay) {
    var idx = a.days.length - 1 - state.offset;
    var s = a.series, cut = {};
    Object.keys(s).forEach(function (k) { cut[k] = s[k].slice(0, idx + 1); });
    var p0 = ML.personalNorms(cut, idx + 1);
    if (!(p0.train_day_load > 0)) return null;
    var ex = cut.exertion.filter(function (v) { return v === v; }).slice(-7);
    var exM = ex.length ? D.mean(ex) : NaN, rec = NaN;
    for (var j = cut.recovery.length - 1; j >= 0; j--) if (cut.recovery[j] === cut.recovery[j]) { rec = cut.recovery[j]; break; }
    var share = (p0.hi_share > 0 ? p0.hi_share : 0.06) * hiPct / 100;
    for (var d = 0; d < 3; d++) {
      var rest = restDay && d === 1, L = rest ? 0 : p0.train_day_load * loadPct / 100;
      cut.load.push(L); cut.srpe.push(L); cut.hi.push(L * share);
      cut.sessions.push(L > 0 ? 1 : 0); cut.strength.push(0);
      cut.exertion.push(L > 0 ? exM : NaN); cut.recovery.push(rec);
      ['fatigue', 'mood', 'readiness', 'sleep_duration', 'sleep_quality', 'soreness', 'stress'].forEach(function (k) { cut[k].push(NaN); });
    }
    var t = idx + 4, x = ML.injuryFeaturesAt(cut, t, ML.personalNorms(cut, t));
    if (x[0] !== x[0]) return null;
    return ML.predictInjury(x);
  }
  function mountPlanner() {
    var root = document.getElementById('planner');
    if (!root || !ML) return;
    var a = byId(root.getAttribute('data-id'));
    var L = root.querySelector('#pl-load'), H = root.querySelector('#pl-hi'), R = root.querySelector('#pl-rest'), out = root.querySelector('#pl-out');
    var base = plannerRisk(a, 100, 100, false);
    function upd() {
      root.querySelector('#pl-load-o').textContent = L.value + '% обычного дня';
      root.querySelector('#pl-hi-o').textContent = H.value + '% обычной';
      L.setAttribute('aria-valuetext', L.value + '%'); H.setAttribute('aria-valuetext', H.value + '%');
      var r = plannerRisk(a, Number(L.value), Number(H.value), R.checked);
      if (!r || !base) { out.innerHTML = '<div class="note">' + icon('info', 'icon-sm') + '<span>Недостаточно истории нагрузки для сценария.</span></div>'; return; }
      var w = r.week * 100, b = base.week * 100, diff = w - b;
      out.innerHTML = '<div class="pl-res"><div><span>Риск травмы на неделю после плана</span><b class="' + riskClass(r.rr) + '">' + num(w, 1) + '%</b><em>' + fmtRR(r.rr) + ' к среднему</em></div>' +
        '<div><span>Если сохранить обычный режим</span><b>' + num(b, 1) + '%</b><em>' + fmtRR(base.rr) + ' к среднему</em></div>' +
        '<div><span>Разница</span><b class="' + (diff > 0.05 ? 'val-warn' : diff < -0.05 ? 'val-good' : '') + '">' + (diff > 0 ? '+' : diff < 0 ? '−' : '') + num(Math.abs(diff), 1) + ' п.п.</b><em>оценка модели, не гарантия</em></div></div>';
    }
    [L, H].forEach(function (el) { el.addEventListener('input', upd); });
    R.addEventListener('change', upd);
    upd();
  }

  /* ---------- Надёжность прогноза (калибровочная кривая) ---------- */
  function reliabilityChart(rel, label) {
    var W = 320, H = 220, pad = 34;
    var mx = Math.max.apply(null, rel.map(function (r) { return Math.max(r.pred, r.obs); })) * 1.1;
    function X(v) { return pad + (W - pad - 10) * v / mx; }
    function Y(v) { return H - pad + 6 - (H - pad - 4) * v / mx; }
    var g = '<line x1="' + X(0) + '" y1="' + Y(0) + '" x2="' + X(mx) + '" y2="' + Y(mx) + '" style="stroke:var(--line-strong)" stroke-dasharray="4 4"/>';
    for (var k = 0; k <= 4; k++) { var v = mx * k / 4; g += '<text class="axis-text" x="' + (pad - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + num(v * 100, v * 100 < 10 ? 1 : 0) + '</text><text class="axis-text" x="' + X(v) + '" y="' + (H - 6) + '" text-anchor="middle">' + num(v * 100, v * 100 < 10 ? 1 : 0) + '</text>'; }
    g += '<path d="' + rel.map(function (r, i) { return (i ? 'L' : 'M') + X(r.pred).toFixed(1) + ' ' + Y(r.obs).toFixed(1); }).join('') + '" fill="none" style="stroke:var(--violet)" stroke-width="2"/>';
    rel.forEach(function (r) { g += '<circle cx="' + X(r.pred).toFixed(1) + '" cy="' + Y(r.obs).toFixed(1) + '" r="4" style="fill:var(--violet)" stroke="var(--panel)" stroke-width="2"><title>Прогноз ' + num(r.pred * 100, 1) + '% · фактически ' + num(r.obs * 100, 1) + '% · ' + r.n + ' дн.</title></circle>'; });
    return '<svg class="rel-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '">' + g + '</svg><p class="muted" style="margin:4px 0 0;font-size:12px;text-align:center">По горизонтали — прогноз, по вертикали — фактическая частота, %. Пунктир — идеальная калибровка.</p>';
  }
  function importanceBars(obj, labels, scale, unit) {
    var items = Object.keys(obj).map(function (k) { return { k: k, v: obj[k] }; }).filter(function (x) { return x.v > 0; }).slice(0, 8);
    var max = Math.max.apply(null, items.map(function (x) { return x.v; }).concat([1e-9]));
    return '<div class="factors">' + items.map(function (x) { return '<div class="factor"><div class="factor-row"><span>' + esc(labels(x.k)) + '</span><span>' + num(x.v * scale, 3) + unit + '</span></div><div class="factor-track"><i style="width:' + Math.max(3, x.v / max * 100) + '%"></i></div></div>'; }).join('') + '</div>';
  }
  function metricRow(name, vals, best) { return '<tr' + (best ? ' class="ours"' : '') + '><td>' + name + '</td>' + vals.map(function (v) { return '<td class="num">' + v + '</td>'; }).join('') + '</tr>'; }

  /* ---------- Страница «Модели ИИ» ---------- */
  RENDER.models = function () {
    if (!CARD_I || !CARD_R) return pageHead('models') + '<div class="panel panel-body">Модели не загружены.</div>';
    var I = CARD_I, Rr = CARD_R, mi = I.metrics_oof, best = mi[I.chosen];
    var reg = Rr.regression, rb = reg[Rr.regression_chosen], cl = Rr.classification, cb = cl[Rr.classification_chosen];
    function ci(a) { return num(a[0], 2) + '–' + num(a[1], 2); }
    var injLabel = function (k) { return (ML.INJ_LABELS[k] || [k])[0]; };
    var rLabel = function (k) { return R_LABELS[k] || k; };
    return pageHead('models') +
      '<div class="grid g-4">' +
        '<article class="panel kpi"><div class="kpi-top"><span>Риск травмы · ROC-AUC</span><span class="kpi-ic o">' + icon('shield', 'icon-sm') + '</span></div><div class="kpi-mid"><span class="kpi-val">' + num(best.roc_auc, 2) + '</span></div><div class="kpi-foot">95% ДИ ' + ci(I.ci95_bootstrap_athletes.roc_auc) + ' · только нагрузка: ' + num(mi.logreg_load_ratio.roc_auc, 2) + '</div></article>' +
        '<article class="panel kpi"><div class="kpi-top"><span>Верхние 10% прогнозов</span><span class="kpi-ic v">' + icon('chart', 'icon-sm') + '</span></div><div class="kpi-mid"><span class="kpi-val">×' + num(I.lift_top_decile, 1) + '</span></div><div class="kpi-foot">травм чаще, чем в среднем</div></article>' +
        '<article class="panel kpi"><div class="kpi-top"><span>Готовность завтра · ошибка</span><span class="kpi-ic m">' + icon('activity', 'icon-sm') + '</span></div><div class="kpi-mid"><span class="kpi-val">' + num(rb.mae, 2) + '<small> балла</small></span></div><div class="kpi-foot">«как сегодня»: ' + num(reg.baseline_persistence.mae, 2) + ' · R² ' + num(rb.r2, 2) + ' vs ' + num(reg.baseline_persistence.r2, 2) + '</div></article>' +
        '<article class="panel kpi"><div class="kpi-top"><span>«Плохой день» · ROC-AUC</span><span class="kpi-ic v">' + icon('alert', 'icon-sm') + '</span></div><div class="kpi-mid"><span class="kpi-val">' + num(cb.roc_auc, 2) + '</span></div><div class="kpi-foot">95% ДИ ' + ci(Rr.auc_ci95) + ' · правило: ' + num(cl.baseline_today_deviation.roc_auc, 2) + '</div></article>' +
      '</div>' +
      '<div class="note info">' + icon('info', 'icon-sm') + '<span><b>Как читать метрики.</b> Все цифры получены на спортсменах, которых модель не видела при обучении (кросс-валидация по людям). ROC-AUC 0,5 — случайное угадывание, 1,0 — идеал. Травмы редки и зависят от множества факторов, поэтому даже лучшие опубликованные модели дают умеренную точность: прогноз — это повод для внимания специалиста, а не диагноз.</span></div>' +
      '<div class="grid g-2" style="align-items:start">' +
        '<section class="panel"><div class="panel-head"><div><h2>Модель риска травмы</h2><p>Градиентный бустинг · 12 относительных признаков · калибровка Платта</p></div>' + modelBadge() + '</div><div class="panel-body" style="display:flex;flex-direction:column;gap:16px">' +
          '<p class="muted" style="margin:0;font-size:13.5px">Оценивает вероятность травмы на следующий день по нагрузке и самочувствию за последние 7 дней <b>относительно личной нормы</b> спортсмена. В кабинете показывается оценка на 7 дней и кратность к среднему уровню.</p>' +
          '<div class="kv"><div><span>Данные</span><b>' + I.dataset.athletes + ' спортсменов</b></div><div><span>Дней наблюдений</span><b>' + num(I.dataset.days) + '</b></div><div><span>Случаев травм</span><b>' + I.dataset.events + '</b></div><div><span>Лицензия данных</span><b>' + esc(I.dataset.license) + '</b></div></div>' +
          '<div class="table-wrap"><table class="table metric-table"><thead><tr><th scope="col">Модель</th><th scope="col">ROC-AUC</th><th scope="col">PR-AUC</th><th scope="col">Brier</th></tr></thead><tbody>' +
            metricRow('Только нагрузка (логистическая регрессия)', [num(mi.logreg_load_ratio.roc_auc, 3), num(mi.logreg_load_ratio.pr_auc, 3), num(mi.logreg_load_ratio.brier, 4)]) +
            metricRow('Все признаки (логистическая регрессия)', [num(mi.logreg_all.roc_auc, 3), num(mi.logreg_all.pr_auc, 3), num(mi.logreg_all.brier, 4)]) +
            metricRow('Градиентный бустинг — в продукте', [num(best.roc_auc, 3), num(best.pr_auc, 3), num(I.brier_calibrated, 4)], true) +
          '</tbody></table></div>' +
          '<p class="muted" style="margin:0;font-size:12.5px">Доля травм в данных — ' + num(I.dataset.events / I.dataset.days * 100, 2) + '% дней. Brier для постоянного прогноза — ' + num(I.brier_constant, 4) + '.</p>' +
          (I.transfer ? '<div class="note warn">' + icon('alert', 'icon-sm') + '<span><b>Внешняя проверка на другом виде спорта.</b> Модель без дообучения проверена на ' + num(I.transfer.football_days) + ' днях 48 футболисток (SoccerMon): ' + I.transfer.football_events + ' начало эпизода травмы, ROC-AUC ' + num(I.transfer.runners_model_on_football_auc, 2) + ' (95% ДИ ' + num(I.transfer.runners_model_on_football_auc_ci95[0], 2) + '–' + num(I.transfer.runners_model_on_football_auc_ci95[1], 2) + ') — перенос <b>не подтверждён</b>: событий слишком мало, сигнал неотличим от случайного. Объединённое обучение качество на бегунах не улучшило (' + num(I.transfer.pooled_oof_auc_runners, 2) + '). Вывод: для нового вида спорта модели нужны собственные размеченные исходы — именно их собирает пилот.</span></div>' : '') +
          '<div class="grid g-2" style="gap:16px;align-items:start"><div><b style="font-size:13.5px">Калибровка</b>' + reliabilityChart(I.reliability, 'Калибровка модели риска травмы') + '</div>' +
          '<div><b style="font-size:13.5px;display:block;margin-bottom:10px">Важность признаков</b>' + importanceBars(I.permutation_importance_auc, injLabel, 1, '') + '<p class="muted" style="margin:6px 0 0;font-size:12px">Падение ROC-AUC при перемешивании признака.</p></div></div>' +
        '</div></section>' +
        '<section class="panel"><div class="panel-head"><div><h2>Модель готовности на завтра</h2><p>Робастная линейная регрессия (Huber) + бустинг для «плохого дня»</p></div>' + modelBadge() + '</div><div class="panel-body" style="display:flex;flex-direction:column;gap:16px">' +
          '<p class="muted" style="margin:0;font-size:13.5px">Прогнозирует самооценку готовности завтра (0–10) по утреннему чек-ину, сну и нагрузке, а также вероятность «плохого дня» — готовности ниже личной нормы на 1 СКО и более.</p>' +
          '<div class="kv"><div><span>Данные</span><b>' + Rr.dataset.players + ' игроков</b></div><div><span>Пар «сегодня → завтра»</span><b>' + num(Rr.dataset.pairs) + '</b></div><div><span>Сезоны</span><b>2020–2021</b></div><div><span>Лицензия данных</span><b>' + esc(Rr.dataset.license) + '</b></div></div>' +
          '<div class="table-wrap"><table class="table metric-table"><thead><tr><th scope="col">Прогноз готовности</th><th scope="col">MAE</th><th scope="col">RMSE</th><th scope="col">R²</th></tr></thead><tbody>' +
            metricRow('«Завтра как сегодня»', [num(reg.baseline_persistence.mae, 3), num(reg.baseline_persistence.rmse, 3), num(reg.baseline_persistence.r2, 3)]) +
            metricRow('Личная средняя', [num(reg.baseline_personal_mean.mae, 3), num(reg.baseline_personal_mean.rmse, 3), num(reg.baseline_personal_mean.r2, 3)]) +
            metricRow('Градиентный бустинг', [num(reg.hgb_0.mae, 3), num(reg.hgb_0.rmse, 3), num(reg.hgb_0.r2, 3)]) +
            metricRow('Huber-регрессия — в продукте', [num(rb.mae, 3), num(rb.rmse, 3), num(rb.r2, 3)], true) +
          '</tbody></table></div>' +
          '<div class="table-wrap"><table class="table metric-table"><thead><tr><th scope="col">«Плохой день» завтра</th><th scope="col">ROC-AUC</th><th scope="col">PR-AUC</th></tr></thead><tbody>' +
            metricRow('Правило: отклонение сегодня от нормы', [num(cl.baseline_today_deviation.roc_auc, 3), num(cl.baseline_today_deviation.pr_auc, 3)]) +
            metricRow('Логистическая регрессия', [num(cl.logreg.roc_auc, 3), num(cl.logreg.pr_auc, 3)]) +
            metricRow('Градиентный бустинг — в продукте', [num(cb.roc_auc, 3), num(cb.pr_auc, 3)], true) +
          '</tbody></table></div>' +
          '<div class="grid g-2" style="gap:16px;align-items:start"><div><b style="font-size:13.5px">Калибровка «плохого дня»</b>' + reliabilityChart(Rr.reliability, 'Калибровка вероятности дня низкой готовности') + '</div>' +
          '<div><b style="font-size:13.5px;display:block;margin-bottom:10px">Важность признаков</b>' + importanceBars(Rr.permutation_importance_mae, rLabel, 1, '') + '<p class="muted" style="margin:6px 0 0;font-size:12px">Рост MAE (баллы) при перемешивании признака.</p></div></div>' +
        '</div></section>' +
      '</div>' +
      '<section class="panel" id="import"><div class="panel-head"><div><h2>' + icon('upload', 'icon-sm') + 'Проверить на своих данных</h2><p>CSV-журнал нагрузки и чек-инов команды → прогноз для каждого спортсмена. Файл обрабатывается только в вашем браузере и никуда не отправляется.</p></div></div>' +
        '<div class="panel-body" style="display:flex;flex-direction:column;gap:14px">' +
          '<div class="import-row"><label class="btn btn-primary" for="csv-file">' + icon('upload', 'icon-sm') + 'Выбрать CSV-файл<input type="file" id="csv-file" accept=".csv,text/csv" class="sr-only"></label>' +
          '<button class="btn btn-ghost" type="button" data-action="csv-template">' + icon('download', 'icon-sm') + 'Скачать шаблон</button>' +
          '<button class="btn btn-ghost" type="button" data-action="csv-sample">' + icon('spark', 'icon-sm') + 'Запустить на примере</button></div>' +
          '<details class="csv-help"><summary>Формат файла' + icon('plus', 'icon-sm') + '</summary><div class="prose-app" style="font-size:13.5px">' +
            '<p>Одна строка — один спортсмен за один день. Разделитель «;» или «,», первая строка — заголовки. Дни без тренировки — <code>srpe = 0</code>; пропущенные значения оставьте пустыми.</p>' +
            '<div class="table-wrap"><table class="table metric-table"><thead><tr><th>Колонка</th><th>Что это</th><th>Обязательна</th></tr></thead><tbody>' +
            [['athlete', 'Имя или код спортсмена', 'да'], ['date', 'Дата: ГГГГ-ММ-ДД или ДД.ММ.ГГГГ', 'да'], ['srpe', 'Нагрузка дня: RPE × минуты (сумма за день)', 'да'], ['hi_load', 'Часть нагрузки высокой интенсивности, в тех же единицах', 'нет'],
             ['sessions', 'Число тренировок за день', 'нет'], ['strength', 'Число силовых тренировок', 'нет'], ['rpe', 'Субъективная тяжесть 0–10', 'нет'], ['readiness', 'Самооценка готовности 0–10', 'для прогноза готовности'],
             ['fatigue', 'Свежесть 1–5 (5 — совсем не устал)', 'нет'], ['soreness', 'Болезненность 1–5 (5 — нет боли)', 'нет'], ['sleep_quality', 'Качество сна 1–5', 'нет'], ['stress', 'Спокойствие 1–5 (5 — нет стресса)', 'нет'],
             ['mood', 'Настроение 1–5', 'нет'], ['sleep_hours', 'Сон, часов', 'нет']].map(function (r) { return '<tr><td><code>' + r[0] + '</code></td><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>'; }).join('') +
            '</tbody></table></div><p>Для прогноза риска нужно не меньше 35 дней истории на спортсмена (личная норма + последняя неделя), для прогноза готовности — 8 дней с чек-ином.</p></div></details>' +
          '<div id="csv-out" aria-live="polite"></div>' +
        '</div></section>' +
      '<div class="grid g-2" style="align-items:start">' +
        '<section class="panel"><div class="panel-head"><div><h2>Ограничения и безопасное применение</h2></div></div><div class="panel-body"><div class="journal">' +
          [['Перенос между видами спорта — измерен', 'Модель риска обучена на бегунах. Мы проверили её на 48 футболистках SoccerMon: перенос не подтвердился (AUC 0,44 при всего 21 событии), а дообучение на этой когорте не улучшило модель. Поэтому для своей команды прогноз нужно проверять в shadow-режиме и дообучать на собственных исходах.'],
           ['Умеренная точность', 'ROC-AUC около 0,6–0,7 — типичный уровень для прогноза травм по нагрузке и самочувствию. Прогноз помогает расставить приоритеты внимания, но пропускает часть травм и даёт ложные тревоги.'],
           ['Не медицинское изделие', 'Модели не ставят диагноз и не дают допуск к тренировкам. Острые симптомы оцениваются по медицинскому протоколу независимо от прогноза.'],
           ['Нужна история', 'Без 4–5 недель журнала нагрузки и регулярных чек-инов прогноз не строится: система честно показывает «недостаточно данных».'],
           ['Проверка перед внедрением', 'Сначала shadow-режим без влияния на решения: сравнение прогнозов с фактическими исходами команды, калибровка, оценка ложных тревог на спортсмено-неделю.']].map(function (r) { return '<div class="journal-row"><span class="dot" style="background:var(--orange)"></span><div><b>' + r[0] + '</b><span>' + r[1] + '</span></div></div>'; }).join('') +
        '</div></div></section>' +
        '<section class="panel"><div class="panel-head"><div><h2>Источники данных и лицензии</h2><p>Открытые научные датасеты</p></div></div><div class="panel-body" style="display:flex;flex-direction:column;gap:12px;font-size:13.5px">' +
          '<div class="source-cite"><b>' + esc(I.dataset.title) + '</b><span>DataverseNL · <a href="' + I.dataset.url + '" target="_blank" rel="noopener">doi:' + esc(I.dataset.doi) + '</a> · ' + esc(I.dataset.license) + '</span><span class="muted">Дневной журнал тренировок и самочувствия 74 бегунов, 2012–2019.</span></div>' +
          '<div class="source-cite"><b>SoccerMon: A large-scale multivariate soccer athlete health, performance, and position monitoring dataset</b><span>Midoglu C. et al., Scientific Data 11, 553 (2024) · <a href="' + Rr.dataset.url + '" target="_blank" rel="noopener">doi:' + esc(Rr.dataset.doi) + '</a> · ' + esc(Rr.dataset.license) + '</span><span class="muted">Использована обработанная выгрузка команды B из открытого репозитория ' + esc(Rr.dataset.processed_by) + '. Данные изменены: агрегированы по дням, построены признаки.</span></div>' +
          '<div class="source-cite"><b>SoccerMon · GPS и дни травм двух команд (внешняя проверка переноса)</b><span>Обработка: <a href="https://github.com/Julie-Landrevie/womens-football-load-monitoring" target="_blank" rel="noopener">github.com/Julie-Landrevie/womens-football-load-monitoring</a> · CC BY 4.0</span><span class="muted">50 игроков, 2020–2021; дни без записи считаются пропуском, цель — начало эпизода травмы.</span></div>' +
          '<div class="source-cite"><b>Код обучения и проверки</b><span><a href="https://github.com/Anuar-zxc/sportmed/tree/main/ml" target="_blank" rel="noopener">github.com/Anuar-zxc/sportmed/ml</a> · scikit-learn</span><span class="muted">Признаки в браузере совпадают с обучением до 1e-15 (автоматическая проверка verify_js.py).</span></div>' +
        '</div></section>' +
      '</div>' + footerStrip();
  };
  MOUNT.models = function () {
    var f = document.getElementById('csv-file');
    if (f) f.addEventListener('change', function () {
      var file = f.files && f.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { document.getElementById('csv-out').innerHTML = '<div class="note warn">' + icon('alert', 'icon-sm') + '<span>Файл больше 5 МБ. Разделите журнал по периодам.</span></div>'; return; }
      var rd = new FileReader();
      rd.onload = function () { runImport(String(rd.result || ''), file.name); };
      rd.readAsText(file, 'utf-8');
      f.value = '';
    });
  };

  /* ---------- Импорт CSV и пакетный прогноз ---------- */
  var COLS = ['athlete', 'date', 'srpe', 'hi_load', 'sessions', 'strength', 'rpe', 'readiness', 'fatigue', 'soreness', 'sleep_quality', 'stress', 'mood', 'sleep_hours'];
  var ALIASES = { 'спортсмен': 'athlete', 'имя': 'athlete', 'id': 'athlete', 'дата': 'date', 'нагрузка': 'srpe', 'srpe_total': 'srpe', 'load': 'srpe', 'сон': 'sleep_hours', 'sleep_duration': 'sleep_hours', 'готовность': 'readiness' };
  var lastImport = null;
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    var lines = text.split(/\r\n|\n|\r/).filter(function (l) { return l.trim() !== ''; });
    if (!lines.length) throw new Error('Файл пустой');
    var first = lines[0], delim = (first.split(';').length > first.split(',').length) ? ';' : (first.indexOf('\t') > -1 ? '\t' : ',');
    function split(line) {
      var out = [], cur = '', q = false;
      for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
        else if (ch === '"') q = true;
        else if (ch === delim) { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur);
      return out.map(function (c) { return c.trim(); });
    }
    var head = split(lines[0]).map(function (h) { h = h.toLowerCase().replace(/\s+/g, '_'); return ALIASES[h] || h; });
    if (head.indexOf('athlete') < 0 || head.indexOf('date') < 0 || head.indexOf('srpe') < 0) throw new Error('Нужны колонки athlete, date и srpe (см. «Формат файла»)');
    return { delim: delim, rows: lines.slice(1).map(function (l) { var c = split(l), o = {}; head.forEach(function (h, i) { o[h] = c[i]; }); return o; }) };
  }
  function toNum(v) { if (v == null) return NaN; v = String(v).trim().replace(',', '.'); if (v === '') return NaN; var x = Number(v); return isFinite(x) ? x : NaN; }
  function toDate(v) {
    v = String(v || '').trim(); var m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v))) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    if ((m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/.exec(v))) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
    return NaN;
  }
  function analyzeRows(rows) {
    var by = {}, skipped = 0;
    rows.forEach(function (r) { var d = toDate(r.date), a = String(r.athlete || '').trim(); if (!a || d !== d) { skipped++; return; } (by[a] = by[a] || []).push({ d: d, r: r }); });
    var DAY = 86400000, results = [];
    Object.keys(by).sort(function (p, q) { return p.localeCompare(q, 'ru'); }).forEach(function (name) {
      var list = by[name].sort(function (p, q) { return p.d - q.d; });
      var d0 = list[0].d, n = Math.round((list[list.length - 1].d - d0) / DAY) + 1;
      if (n > 3660) { results.push({ name: name, error: 'Слишком длинный период (> 10 лет)' }); return; }
      var s = {}; ['load', 'srpe', 'hi', 'sessions', 'strength', 'exertion', 'recovery', 'fatigue', 'mood', 'readiness', 'sleep_duration', 'sleep_quality', 'soreness', 'stress'].forEach(function (k) { s[k] = []; for (var i = 0; i < n; i++) s[k].push(NaN); });
      list.forEach(function (x) {
        var i = Math.round((x.d - d0) / DAY), r = x.r, L = toNum(r.srpe);
        s.load[i] = L; s.srpe[i] = L;
        s.hi[i] = toNum(r.hi_load);
        var ses = toNum(r.sessions); s.sessions[i] = ses === ses ? ses : (L === L ? (L > 0 ? 1 : 0) : NaN);
        var st = toNum(r.strength); s.strength[i] = st === st ? st : (L === L ? 0 : NaN);
        var rpe = toNum(r.rpe); s.exertion[i] = rpe === rpe && L > 0 ? D.clamp(rpe, 0, 10) / 10 : NaN;
        s.readiness[i] = toNum(r.readiness); s.fatigue[i] = toNum(r.fatigue); s.soreness[i] = toNum(r.soreness);
        s.sleep_quality[i] = toNum(r.sleep_quality); s.stress[i] = toNum(r.stress); s.mood[i] = toNum(r.mood); s.sleep_duration[i] = toNum(r.sleep_hours);
        s.recovery[i] = (s.fatigue[i] === s.fatigue[i] && s.soreness[i] === s.soreness[i]) ? ((5 - s.fatigue[i]) + (5 - s.soreness[i])) / 8 : NaN;
      });
      var res = { name: name, days: n, rows: list.length, last: new Date(list[list.length - 1].d) };
      var x = ML.injuryFeaturesAt(s, n, ML.personalNorms(s, n));
      if (x[0] === x[0]) {
        var p = ML.predictInjury(x); res.risk = p.week * 100; res.rr = p.rr;
        var top = ML.describeInjury(x, p.contrib).filter(function (f) { return f.c > 0; }).sort(function (a, b) { return b.c - a.c; })[0];
        res.top = top ? top.name + ' (' + top.value + ')' : '—';
      } else res.note = n < 35 ? 'Нужно ≥ 35 дней истории' : 'Мало данных о нагрузке за последнюю неделю';
      var t = n - 1;
      if (s.readiness[t] === s.readiness[t] && t >= 7) { var fc = ML.predictReadiness(ML.readinessFeaturesAt(s, t)); res.fc = fc; }
      results.push(res);
    });
    return { results: results, skipped: skipped };
  }
  function runImport(text, fname) {
    var out = document.getElementById('csv-out');
    try {
      var parsed = parseCSV(text);
      if (parsed.rows.length > 200000) throw new Error('Слишком много строк (> 200 000)');
      var an = analyzeRows(parsed.rows);
      lastImport = an;
      logEvent('data', 'Проверка CSV на моделях: ' + fname + ' · ' + an.results.length + ' спортсменов (обработано в браузере)');
      var rows = an.results.slice().sort(function (p, q) { return (q.rr || -1) - (p.rr || -1); });
      out.innerHTML = '<div class="note ok-note">' + icon('check', 'icon-sm') + '<span><b>' + esc(fname) + '</b>: ' + parsed.rows.length + ' ' + plural(parsed.rows.length, 'строка', 'строки', 'строк') + ', ' + rows.length + ' ' + plural(rows.length, 'спортсмен', 'спортсмена', 'спортсменов') + (an.skipped ? ' · пропущено строк без имени или даты: ' + an.skipped : '') + '. Прогноз — на день после последней даты в файле.</span></div>' +
        '<div class="table-wrap"><table class="table"><thead><tr><th scope="col">Спортсмен</th><th scope="col">Дней</th><th scope="col">Последняя дата</th><th scope="col">Риск травмы · 7 дн.</th><th scope="col">Главный фактор</th><th scope="col">Готовность завтра</th><th scope="col">«Плохой день»</th></tr></thead><tbody>' +
        rows.map(function (r) {
          if (r.error) return '<tr tabindex="-1" style="cursor:default"><td><b>' + esc(r.name) + '</b></td><td colspan="6" class="muted">' + esc(r.error) + '</td></tr>';
          return '<tr tabindex="-1" style="cursor:default"><td><b>' + esc(r.name) + '</b></td><td class="num">' + r.days + '</td><td class="num">' + fmtFull.format(r.last) + '</td>' +
            '<td class="num ' + riskClass(r.rr) + '" style="font-weight:650">' + (r.risk == null ? '<span class="muted" style="font-weight:400">' + esc(r.note) + '</span>' : num(r.risk, 1) + '% <span class="muted" style="font-weight:400;font-size:12px">' + fmtRR(r.rr) + '</span>') + '</td>' +
            '<td>' + esc(r.top || '—') + '</td><td class="num">' + (r.fc ? num(r.fc.value, 1) + ' <span class="muted">(' + num(r.fc.lo, 1) + '–' + num(r.fc.hi, 1) + ')</span>' : '<span class="muted">нет чек-ина в последний день</span>') + '</td>' +
            '<td class="num">' + (r.fc ? Math.round(r.fc.pLow * 100) + '%' : '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center"><button class="btn btn-ghost btn-sm" type="button" data-action="csv-results">' + icon('download', 'icon-sm') + 'Скачать результаты CSV</button><span class="muted" style="font-size:12.5px">Данные не сохраняются: после обновления страницы результат исчезнет.</span></div>';
    } catch (err) {
      out.innerHTML = '<div class="note warn">' + icon('alert', 'icon-sm') + '<span><b>Не удалось прочитать файл.</b> ' + esc(err.message || String(err)) + '</span></div>';
    }
  }
  function csvCell(c) {
    if (c == null || (typeof c === 'number' && c !== c)) return '';
    var s2 = typeof c === 'number' ? String(c).replace('.', ',') : String(c);
    return /[;"\r\n]/.test(s2) ? '"' + s2.replace(/"/g, '""') + '"' : s2;
  }
  function saveCSV(rows, name) {
    var csv = rows.map(function (r) { return r.map(csvCell).join(';'); }).join('\r\n');
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob), el = document.createElement('a');
    el.href = url; el.download = name; document.body.appendChild(el); el.click(); el.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function templateRows() {
    var dm = isPilot() ? D.build({}) : model;
    function demoById(id) { return dm.athletes.filter(function (a) { return a.id === id; })[0]; }
    var out = [COLS], pick = [['a03', 'Спортсмен A'], ['a07', 'Спортсмен B'], ['a06', 'Спортсмен C']];
    pick.forEach(function (p) {
      var a = demoById(p[0]); if (!a) return;
      a.days.forEach(function (d) {
        var w = d.well || {};
        out.push([p[1], d.date.getFullYear() + '-' + String(d.date.getMonth() + 1).padStart(2, '0') + '-' + String(d.date.getDate()).padStart(2, '0'),
          d.load, d.hi, d.sessions, d.strength, d.rpe, w.readiness, w.fatigue, w.soreness, w.sleep_quality, w.stress, w.mood, d.sleep]);
      });
    });
    return out;
  }

  /* «Сегодня»: одно главное число, состав по статусам и три вторичных показателя */
  function todayPanel(t, dR, dV, insight) {
    function signed(d) { return d > 0 ? '+' + d : d < 0 ? '−' + Math.abs(d) : '0'; }
    function deltaTxt(d, tail) { var c = d > 0 ? 'up' : d < 0 ? 'down' : 'flat'; return '<span class="dl ' + c + '">' + signed(d) + '</span> ' + tail; }
    var segs = [
      ['ok', t.ready.length, 'готовы к нагрузке'],
      ['warn', t.recovering.length, 'восстанавливаются'],
      ['bad', t.attention.length, 'требуют внимания'],
      ['mute', t.nodata.length, 'без свежих данных']
    ];
    var total = Math.max(1, t.total);
    var bar = segs.filter(function (x) { return x[1] > 0; }).map(function (x) { return '<span class="sb-' + x[0] + '" style="flex-grow:' + x[1] + '"></span>'; }).join('');
    var aria = segs.map(function (x) { return x[1] + ' ' + x[2]; }).join(', ');
    var risks = t.list.map(function (x) { return x.s.risk; }).filter(function (v) { return v != null && v === v; });
    var avgRisk = risks.length ? D.mean(risks) : null;
    var onBand = Math.max(0, t.total - t.nodata.length), avgHr = Math.round(D.mean(t.list.map(function (x) { return x.s.rhr; }).filter(function (v) { return v != null; })) || 56);
    return '<section class="today" aria-labelledby="today-title">' +
      '<div class="today-main">' +
        '<h2 id="today-title">Готовность команды</h2>' +
        '<div class="today-ring">' + ring({ value: t.readiness, label: 'из 100', size: 190, stroke: 14, color: 'url(#g-ring)' }) +
          '<div><p class="today-sub">' + deltaTxt(dR, 'за неделю') + '</p><p class="today-note">' + insight + '</p></div></div>' +
        liveStrip({ title: 'Браслеты на связи', sub: onBand + ' из ' + t.total + ' · данные за ночь получены', hr: avgHr }) +
      '</div>' +
      '<div class="today-split">' +
        '<div class="split-head"><h3>Состав на ' + fmtFull.format(asOfDate()) + '</h3><span>' + t.total + ' ' + plural(t.total, 'спортсмен', 'спортсмена', 'спортсменов') + '</span></div>' +
        '<div class="split-bar" role="img" aria-label="' + esc(aria) + '">' + bar + '</div>' +
        '<ul class="split-legend">' + segs.map(function (x) {
          return '<li><i class="sb-' + x[0] + '" aria-hidden="true"></i><b>' + x[1] + '</b><span>' + x[2] + '</span><em>' + Math.round(x[1] / total * 100) + '%</em></li>';
        }).join('') + '</ul>' +
      '</div>' +
      '<dl class="today-stats">' +
        '<div><dt>Восстановление</dt><dd>' + (t.recovery == null ? '—' : t.recovery) + '<small>/100</small></dd><p>' + deltaTxt(dV, 'за неделю') + '</p>' + sparkline(t.series('recovery', 14), 'var(--s2)') + '</div>' +
        '<div><dt>Ранние сигналы</dt><dd>' + t.signals.length + '</dd><p>' + plural(t.signals.length, 'спортсмен', 'спортсмена', 'спортсменов') + ' с отклонениями</p>' + sparkline(t.series('risk', 14), 'var(--s1)') + '</div>' +
        '<div><dt>Средний риск травмы</dt><dd>' + (avgRisk == null ? '—' : num(avgRisk, 1)) + '<small>%</small></dd><p>на 7 дней, по модели</p></div>' +
      '</dl>' +
    '</section>';
  }

  /* ======================= Живые элементы: кольца, лента браслета, набегающие числа ======================= */
  var ringSeq = 0;
  /* Кольцо показателя (как у WHOOP): дуга 270°, цвет по значению, число набегает при появлении */
  function ring(o) {
    var id = 'rg' + (++ringSeq), v = o.value, size = o.size || 150, sw = o.stroke || 11, r = (size - sw) / 2 - 2, c = 2 * Math.PI * r, arc = c * 0.75;
    var pct = v == null ? 0 : Math.max(0, Math.min(1, v / (o.max || 100)));
    var col = o.color || (v == null ? 'var(--st-none)' : pct >= 0.67 ? 'var(--st-ok)' : pct >= 0.34 ? 'var(--st-warn)' : 'var(--st-bad)');
    return '<div class="ring" data-ring style="--size:' + size + 'px"><svg viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' +
      '<circle class="ring-track" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + sw + '" stroke-dasharray="' + arc + ' ' + c + '" transform="rotate(135 ' + size / 2 + ' ' + size / 2 + ')"/>' +
      '<circle class="ring-fill" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + sw + '" style="stroke:' + col + '" stroke-dasharray="' + (arc * pct) + ' ' + c + '" data-target="' + (arc * pct) + ' ' + c + '" transform="rotate(135 ' + size / 2 + ' ' + size / 2 + ')"/>' +
      '</svg><div class="ring-in"><b data-count="' + (v == null ? '' : v) + '" data-dec="' + (o.dec || 0) + '">' + (v == null ? '—' : num(v, o.dec || 0)) + '</b>' + (o.unit ? '<small>' + o.unit + '</small>' : '') + '<span>' + esc(o.label) + '</span></div>' +
      (o.foot ? '<p class="ring-foot">' + o.foot + '</p>' : '') + '</div>';
  }
  /* Числа «набегают» и дуги колец заполняются один раз после отрисовки раздела */
  function animateNumbers(root) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var t0 = performance.now(), D0 = 900;
    var items = Array.prototype.slice.call(root.querySelectorAll('[data-count]')).map(function (el) {
      var v = parseFloat(el.getAttribute('data-count')); if (!(v === v)) return null;
      return { el: el, v: v, dec: +el.getAttribute('data-dec') || 0, suffix: '' };
    }).filter(Boolean);
    root.querySelectorAll('.ring-fill').forEach(function (c) { var t = c.getAttribute('data-target'); c.setAttribute('stroke-dasharray', '0 99999'); requestAnimationFrame(function () { c.style.transition = 'stroke-dasharray 1.1s cubic-bezier(.2,.7,.2,1)'; c.setAttribute('stroke-dasharray', t); }); });
    if (!items.length) return;
    function frame(now) {
      var k = Math.min(1, (now - t0) / D0), e = 1 - Math.pow(1 - k, 3);
      items.forEach(function (it) { it.el.textContent = num(it.v * e, it.dec); });
      if (k < 1) requestAnimationFrame(frame); else items.forEach(function (it) { it.el.textContent = num(it.v, it.dec); });
    }
    requestAnimationFrame(frame);
  }
  /* Лента браслета: пульс идёт в реальном времени (симуляция вокруг пульса покоя спортсмена или команды) */
  var LIVE = { timer: null };
  function liveStrip(o) {
    return '<div class="live" data-live-strip data-hr="' + (o.hr || 58) + '"><div class="live-head"><span class="live-dot"></span><b>' + esc(o.title || 'Браслет на связи') + '</b><span class="live-sub">' + esc(o.sub || '') + '</span><span class="live-val"><b data-live-hr>' + (o.hr || 58) + '</b> уд/мин</span></div>' +
      '<canvas class="live-canvas" height="64" aria-label="Лента пульса с браслета в реальном времени"></canvas></div>';
  }
  function mountLive(root) {
    if (LIVE.timer) { cancelAnimationFrame(LIVE.timer); LIVE.timer = null; }
    var strip = root.querySelector('[data-live-strip]'); if (!strip) return;
    var cv = strip.querySelector('canvas'), ctx = cv.getContext('2d'), hrEl = strip.querySelector('[data-live-hr]');
    var baseHr = +strip.getAttribute('data-hr') || 58, hr = baseHr, phase = 0, buf = [], W = 0, H = 64, dpr = Math.min(2, window.devicePixelRatio || 1);
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function size() { W = strip.clientWidth; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    size();
    var col = getComputedStyle(document.documentElement).getPropertyValue('--s1').trim() || '#d9661f';
    function ecg(t) { // форма QRS на периоде 1
      var x = t % 1;
      if (x < 0.08) return Math.sin(x / 0.08 * Math.PI) * 0.12;        // P
      if (x < 0.14) return 0;
      if (x < 0.17) return -0.18 * ((x - 0.14) / 0.03);                 // Q
      if (x < 0.21) return -0.18 + 1.18 * ((x - 0.17) / 0.04);          // R up
      if (x < 0.26) return 1 - 1.35 * ((x - 0.21) / 0.05);              // R down to S
      if (x < 0.30) return -0.35 + 0.35 * ((x - 0.26) / 0.04);
      if (x < 0.48) return 0;
      if (x < 0.62) return Math.sin((x - 0.48) / 0.14 * Math.PI) * 0.26; // T
      return 0;
    }
    var last = performance.now();
    function tick(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!reduced) { phase += dt * hr / 60; }
      if (Math.random() < 0.02) { hr = Math.max(44, Math.min(110, hr + (Math.random() - 0.5) * 3)); hrEl.textContent = Math.round(hr); }
      var samples = Math.max(1, Math.round(dt * 180));
      for (var i = 0; i < samples; i++) buf.push(ecg(phase - (samples - i) * dt / samples * hr / 60) + (Math.random() - 0.5) * 0.03);
      var maxPts = Math.floor(W / 1.6); if (buf.length > maxPts) buf.splice(0, buf.length - maxPts);
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      for (var j = 0; j < buf.length; j++) { var x = j * 1.6, y = H * 0.62 - buf[j] * H * 0.48; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      // левый край плавно уходит: рисуем через globalCompositeOperation, чтобы не зависеть от цвета фона
      ctx.save(); ctx.globalCompositeOperation = 'destination-out';
      var fade = ctx.createLinearGradient(0, 0, 70, 0); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fade; ctx.fillRect(0, 0, 70, H); ctx.restore();
      if (buf.length) { var lx = (buf.length - 1) * 1.6, ly = H * 0.62 - buf[buf.length - 1] * H * 0.48; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(lx, ly, 3, 0, 7); ctx.fill(); }
      if (!reduced) LIVE.timer = requestAnimationFrame(tick); else LIVE.timer = null;
    }
    LIVE.timer = requestAnimationFrame(tick);
    window.addEventListener('resize', size, { passive: true });
  }

  /* ======================= Вход: профиль специалиста на этом устройстве ======================= */
  function hasProfile() { return !!(state.profile && state.profile.name); }
  function welcomeScreen() {
    var root = document.getElementById('welcome');
    if (!root) { root = document.createElement('div'); root.id = 'welcome'; root.className = 'welcome'; document.body.appendChild(root); }
    document.body.classList.add('has-welcome');
    var roles = Object.keys(ROLES).map(function (k) { return '<label class="wc-role"><input type="radio" name="wc-role" value="' + k + '"' + (k === 'doctor' ? ' checked' : '') + '><span>' + ROLES[k].title + '</span></label>'; }).join('');
    root.innerHTML =
      '<div class="wc-left" aria-hidden="true">' +
        '<div class="wc-brand"><svg viewBox="0 0 34 34"><rect width="34" height="34" rx="10" fill="url(#g-brand)"/><path d="M6 18h5l2.5-6 4 11 3-8 1.5 3H28" fill="none" stroke="#2a1606" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>AI Sports</div>' +
        '<div class="wc-stage">' +
          '<svg class="wc-orbit" viewBox="0 0 520 520"><circle cx="260" cy="260" r="236" class="o1"/><circle cx="260" cy="260" r="176" class="o2"/></svg>' +
          '<div class="wc-band"><img src="band-v500-s.webp" width="520" height="520" alt=""><span class="wc-dot"></span></div>' +
          '<div class="wc-ring">' +
            [['-62deg','61','уд/мин','heart','hr'],['18deg','64','HRV, мс','activity',''],['104deg','98','SpO₂, %','sleep',''],['196deg','36,4','°C кожи','flask',''],['278deg','7:42','сон','sleep','']].map(function (c) {
              return '<div class="wc-chip" style="--a:' + c[0] + '"><i class="' + c[4] + '">' + icon(c[3], 'icon-sm') + '</i><b>' + c[1] + '</b><span>' + c[2] + '</span></div>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<p class="wc-tag">Браслет измеряет ночью. Утром решение принимаете вы.</p>' +
      '</div>' +
      '<form class="wc-form" id="wc-form" novalidate>' +
        '<h1>Добро пожаловать в кабинет</h1>' +
        '<p class="wc-sub">Представьтесь — имя появится в шапке, журнале действий и отчётах. Всё хранится только на этом устройстве.</p>' +
        '<div class="field"><label for="wc-name">Имя и фамилия</label><input class="input" id="wc-name" maxlength="60" autocomplete="name" placeholder="Например, Ербол Сапаров" required aria-describedby="wc-err"><span class="err" id="wc-err"></span></div>' +
        '<div class="field"><span class="label">Ваша роль</span><div class="wc-roles" role="radiogroup" aria-label="Роль">' + roles + '</div></div>' +
        '<div class="wc-ways">' +
          '<button class="wc-way" type="submit" data-way="pilot"><b>' + icon('users', 'icon-sm') + 'Создать команду</b><span>Реальный состав, чек-ины с телефона, браслет и отчёты. Для пилота.</span></button>' +
          '<button class="wc-way" type="submit" data-way="demo"><b>' + icon('spark', 'icon-sm') + 'Сначала посмотреть на демо</b><span>24 вымышленных спортсмена и 84 дня данных. Команду можно создать позже.</span></button>' +
        '</div>' +
        '<p class="wc-foot">Нажимая кнопку, вы принимаете <a href="/terms">условия использования</a>. Платформа не является медицинским изделием.</p>' +
      '</form>';
    var way = 'pilot';
    root.querySelectorAll('.wc-way').forEach(function (b) { b.addEventListener('click', function () { way = b.getAttribute('data-way'); }); });
    root.querySelector('#wc-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var nm = root.querySelector('#wc-name'), name = nm.value.replace(/\s+/g, ' ').trim();
      if (name.length < 2) { nm.setAttribute('aria-invalid', 'true'); root.querySelector('#wc-err').textContent = 'Укажите имя — оно нужно для журнала действий'; nm.focus(); return; }
      var role = (root.querySelector('input[name="wc-role"]:checked') || {}).value || 'doctor';
      state.profile = { name: name, role: role, ts: Date.now() };
      state.role = role;
      if (way === 'demo') state.ws = 'demo';
      save();
      if (pilot && !pilot.staff) pilot.staff = {};
      if (pilot) { pilot.staff[role] = pilot.staff[role] || name; savePilot(); }
      root.classList.add('wc-out');
      setTimeout(function () { root.remove(); document.body.classList.remove('has-welcome'); }, 420);
      logEvent('role', 'Вход в кабинет: ' + name);
      if (way === 'pilot' && !pilot) { go('overview'); render(); setTimeout(setupPilotModal, 450); }
      else { if (way === 'pilot' && pilot) { state.ws = 'pilot'; save(); rebuild(); } go('overview'); render(); toast('Здравствуйте, ' + name.split(' ')[0] + '!'); }
    });
    setTimeout(function () { var n = root.querySelector('#wc-name'); if (n) n.focus(); }, 80);
  }
  function signOut() {
    state.profile = null; save();
    location.hash = '#/overview';
    welcomeScreen();
  }

  /* ---------- Overview ---------- */
  RENDER.overview = function () {
    var t = team();
    var rDays = state.range;
    var labels = t.labels(rDays), sr = t.series('readiness', rDays), sv = t.series('recovery', rDays);
    var dR = (t.readiness != null && t.prevReadiness != null) ? t.readiness - t.prevReadiness : 0;
    var dV = (t.recovery != null && t.prevRecovery != null) ? t.recovery - t.prevRecovery : 0;
    function delta(d) { var c = d > 0 ? 'up' : d < 0 ? 'down' : 'flat'; return '<span class="delta ' + c + '">' + (d > 0 ? icon('up', 'icon-sm') : d < 0 ? icon('dn', 'icon-sm') : '') + (d > 0 ? '+' : '') + d + '</span>'; }
    var insight;
    var firstR = sr[0], lastR = sr[sr.length - 1], ch = (lastR != null && firstR != null) ? lastR - firstR : 0;
    if (ch >= 2) insight = 'Команда на верном пути: готовность выросла на <b>' + ch + ' ' + plural(ch, 'пункт', 'пункта', 'пунктов') + '</b> за период.';
    else if (ch <= -2) insight = 'Готовность снизилась на <b>' + Math.abs(ch) + ' ' + plural(Math.abs(ch), 'пункт', 'пункта', 'пунктов') + '</b> за период — проверьте спортсменов с ранними сигналами.';
    else insight = lastR == null ? 'Пока мало данных для динамики — заполните чек-ины или импортируйте историю.' : 'Готовность команды стабильна за период: <b>' + lastR + '/100</b>.';

    var recs = buildRecs().filter(function (r) { return r.status === 'pending'; }).slice(0, 3);
    var top5 = sortRows(t.list, { key: 'risk', dir: 'desc' }).slice(0, 5);
    var recCount = isPilot() ? pilotRecordCount() : 0;
    var pilotStart = '';
    if (isPilot() && recCount === 0) {
      pilotStart = '<section class="panel panel-body" style="display:flex;flex-direction:column;gap:14px;padding:26px">' +
        '<h2 class="title-m" style="margin:0">С чего начать пилот</h2>' +
        '<div class="steps-app">' +
        '<div class="step-card"><span class="n">01</span><b>Импортируйте историю</b><p>Если нагрузка велась в таблице — загрузите CSV, и модели сразу получат контекст (для риска нужно ≥ 35 дней).</p><button class="btn btn-primary btn-sm" type="button" data-action="pilot-import" style="align-self:flex-start">' + icon('upload', 'icon-sm') + 'Импорт истории</button></div>' +
        '<div class="step-card"><span class="n">02</span><b>Раздайте ссылки на чек-ин</b><p>Каждый спортсмен отвечает с телефона за минуту, ответы приходят вам зашифрованными ссылками. После тренировки — «Нагрузка дня» для всей команды.</p><button class="btn btn-ghost btn-sm" type="button" data-action="team-links" style="align-self:flex-start">' + icon('link', 'icon-sm') + 'Ссылки для команды</button></div>' +
        '<div class="step-card"><span class="n">03</span><b>Настройте резервную копию</b><p>Данные живут только на этом устройстве — скачивайте зашифрованную копию хотя бы раз в неделю.</p><button class="btn btn-ghost btn-sm" type="button" data-action="pilot-backup" style="align-self:flex-start">' + icon('download', 'icon-sm') + 'Резервная копия</button></div>' +
        '</div></section>';
    }

    return pageHead('overview', isPilot() ? '<button class="btn btn-ghost" type="button" data-action="inbox">' + icon('brain') + '<span class="lbl">Входящие чек-ины</span></button><button class="btn btn-ghost" type="button" data-action="team-load">' + icon('load') + '<span class="lbl">Нагрузка дня</span></button>' : '') +
      todayPanel(t, dR, dV, insight) + pilotStart +
      '<div class="grid g-main">' +
        '<section class="panel" aria-labelledby="dyn-title"><div class="panel-head"><div><h2 id="dyn-title">Готовность и восстановление</h2><p>Среднее по команде, из 100</p></div>' +
          '<div class="seg" role="group" aria-label="Период"><button type="button" data-range="7" aria-pressed="' + (rDays === 7) + '">7 дней</button><button type="button" data-range="30" aria-pressed="' + (rDays === 30) + '">30 дней</button></div></div>' +
          '<div class="panel-body" style="display:flex;flex-direction:column;gap:14px">' +
          lineChart({ labels: labels, label: 'Динамика готовности и восстановления команды', series: [{ name: 'Готовность', color: 'var(--s1)', values: sr }, { name: 'Восстановление', color: 'var(--s2)', values: sv }], min: 40, max: 100, height: 290 }) +
          '</div></section>' +
        '<section class="panel" aria-labelledby="att-title"><div class="panel-head"><div><h2 id="att-title">Ранние сигналы <span class="count">' + t.signals.length + '</span></h2><p>Отклонения от личной нормы, по убыванию риска</p></div></div>' +
          '<div class="list" style="margin-top:8px">' + (t.signals.slice(0, 3).map(function (x) { return athleteRow(x, { flags: true }); }).join('') || '<div class="empty">' + icon('check') + 'Ранних сигналов нет</div>') + '</div>' +
          '<div class="panel-foot"><span>Сигнал — не диагноз</span><a class="btn btn-ghost btn-sm" href="#/analytics">Открыть анализ рисков ' + icon('arrow', 'icon-sm') + '</a></div></section>' +
      '</div>' +
      '<div class="grid g-main">' +
        '<section class="panel" aria-labelledby="tbl-title"><div class="panel-head"><div><h2 id="tbl-title">Спортсмены <span class="badge plain mute">' + t.total + '</span></h2><p>Сначала — с наибольшим риском травмы по модели</p></div><a class="btn btn-ghost btn-sm" href="#/athletes">Все спортсмены ' + icon('arrow', 'icon-sm') + '</a></div>' +
          '<div style="margin-top:12px">' + teamTable(top5, { readiness: true, risk: true, status: true }, { lite: true }) + '</div>' +
          '<div class="panel-foot"><span>Показано ' + Math.min(5, t.total) + ' из ' + t.total + '</span><span>' + icon('refresh', 'icon-sm') + (isPilot() ? ' Данные на этом устройстве' : ' Данные синхронизированы') + '</span></div></section>' +
        '<section class="panel" aria-labelledby="rec-title"><div class="panel-head"><div><h2 id="rec-title">Рекомендации</h2><p>Ждут решения специалиста</p></div></div>' +
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
    return pageHead('athletes', (isPilot() ? '<button class="btn btn-ghost" type="button" data-action="team-load">' + icon('load') + '<span class="lbl">Нагрузка дня</span></button>' : '') + '<button class="btn btn-ghost" type="button" data-action="add-athlete">' + icon('plus') + '<span class="lbl">Добавить спортсмена</span></button>') +
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
  function checkinStatus(c) {
    if (!c) return null;
    function bad(v, op, th) { return v != null && (op === '>=' ? v >= th : v <= th); }
    return (bad(c.stress, '>=', 4) || bad(c.mood, '<=', 2) || bad(c.motivation, '<=', 2) || bad(c.readiness, '<=', 4) || bad(c.fatigue, '>=', 4)) ? 'attention' : 'ok';
  }
  function athleteSelect(idAttr, selected, label) {
    return '<label class="field" style="min-width:min(280px,100%)"><span class="label sr-only">' + label + '</span><select class="select" id="' + idAttr + '" aria-label="' + label + '">' +
      model.athletes.map(function (a) { return '<option value="' + a.id + '"' + (a.id === selected ? ' selected' : '') + '>' + esc(a.short) + ' · № ' + esc(a.num) + '</option>'; }).join('') + '</select></label>';
  }
  RENDER.twin = function () {
    var a = byId(state.twinAthlete) || model.athletes[0];
    var s = snapOf(a);
    var ci = latestCheckin(a.id);
    var mental = ci ? Math.round(((ci.mood + ci.motivation + (6 - ci.stress) + ci.sleepq + (6 - ci.soreness)) / 25) * 100) : null;
    if (isPilot() && s.well) {
      var wParts = [s.well.mood, s.well.stress, s.well.sleep_quality].filter(function (v) { return v != null; });
      mental = wParts.length ? Math.round(D.mean(wParts) / 5 * 100) : null;
    }
    var axes = [
      { name: 'Готовность', v: s.readiness }, { name: 'Восстановление', v: s.recovery },
      { name: 'Сон', v: s.sleep == null ? null : Math.round(D.clamp((s.sleep - 5) / 4, 0, 1) * 100) },
      { name: 'HRV', v: s.hrv == null ? null : Math.round(D.clamp((s.hrv / s.hrvBase - 0.6) / 0.6, 0, 1) * 100) },
      { name: 'Баланс нагрузки', v: s.acwr == null ? null : Math.round(D.clamp(1 - Math.abs(s.acwr - 1) * 1.6, 0, 1) * 100) },
      { name: 'Ментальное', v: mental }
    ];
    var idx = a.days.length - 1 - state.offset;
    var days = a.days.slice(Math.max(0, idx - 29), idx + 1);
    var checkins = isPilot()
      ? a.days.slice().reverse().filter(function (d2) { return d2.well; }).slice(0, 5).map(function (d2) {
          var w2 = d2.well;
          return { ts: d2.date.getTime(), dateOnly: true, readiness: w2.readiness, mood: w2.mood, stress: w2.stress != null ? 6 - w2.stress : null, motivation: null, sleepq: w2.sleep_quality, soreness: w2.soreness != null ? 6 - w2.soreness : null, fatigue: w2.fatigue != null ? 6 - w2.fatigue : null, note: d2.noteTxt || '' };
        })
      : (state.checkins[a.id] || []);
    var obs = checkins.slice(0, 5).map(function (c) {
      var st = checkinStatus(c);
      var detail = can('psych') ?
        [['Настроение', c.mood], ['стресс', c.stress], ['мотивация', c.motivation], ['сон', c.sleepq], ['болезненность', c.soreness], ['усталость', c.fatigue]].filter(function (x) { return x[1] != null; }).map(function (x) { return x[0] + ' ' + x[1] + '/5'; }).join(' · ') + (c.note ? '<br><span class="muted">«' + esc(c.note) + '»</span>' : '') :
        'Обобщённый статус: ' + (st === 'attention' ? '<span class="val-warn">требуется внимание психолога</span>' : '<span class="val-good">в норме</span>');
      return '<div class="journal-row"><span class="dot" style="background:' + (st === 'attention' ? 'var(--orange)' : 'var(--mint)') + '"></span><div><b>' + (c.dateOnly ? fmtFull.format(new Date(c.ts)) : fmtTime.format(new Date(c.ts))) + (c.readiness != null ? ' · готовность ' + c.readiness + '/10' : '') + '</b><span>' + detail + '</span></div></div>';
    }).join('');
    var labs = '';
    if (a.labs) {
      labs = can('labs') ?
        '<div class="kv">' + model.LABS.slice(0, 6).map(function (l) { var v = a.labs[l.key], out = v < l.lo || v > l.hi; return '<div><span>' + esc(l.name) + '</span><b class="' + (out ? 'val-warn' : '') + '">' + num(v, l.dec) + ' ' + l.unit + '</b></div>'; }).join('') + '</div>' :
        '<div class="lock">' + icon('lock') + '<span>Лабораторные показатели доступны спортивному врачу. Смените роль в меню профиля, чтобы посмотреть.</span></div>';
    }
    return pageHead('twin', '<button class="btn btn-ghost" type="button" data-action="print">' + icon('print') + '<span class="lbl">PDF-отчёт</span></button>') +
      '<div class="print-only print-head"><b>AI Sports · отчёт по спортсмену</b><span>' + esc(a.short) + ' · срез на ' + fmtFull.format(asOfDate()) + ' · сформирован ' + fmtTime.format(new Date()) + '</span><span>Прогнозы моделей носят вероятностный характер и не являются медицинским заключением.</span></div>' +
      '<section class="panel" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px">' +
        '<div class="person"><span class="kpi-ic v">' + icon('twin', 'icon-sm') + '</span><span><b>Персональный профиль спортсмена</b><span>Данные устройства, анализы, нагрузка и самочувствие — в одной модели</span></span></div>' +
        athleteSelect('twin-select', a.id, 'Выбрать спортсмена') + '</section>' +
      '<section class="panel rings-panel"><div class="rings">' +
        ring({ value: s.recovery, label: 'Восстановление', foot: s.hrv != null ? 'HRV ' + num(s.hrv) + ' мс' + (s.hrvPct != null ? ' · ' + (s.hrvPct > 0 ? '+' : '') + s.hrvPct + '% к норме' : '') : 'Нет данных браслета' }) +
        ring({ value: s.readiness, label: 'Готовность', foot: s.fc ? 'Завтра ' + num(s.fc.value, 1) + ' / 10 по модели' : 'Нужен утренний чек-ин' }) +
        ring({ value: s.sleep == null ? null : Math.round(D.clamp(s.sleep / 8.5, 0, 1) * 100), label: 'Сон', foot: s.sleep == null ? 'Нет данных' : D.fmtHours(s.sleep) + ' · цель 8 ч 30' }) +
        ring({ value: s.risk == null ? null : Math.round(100 - D.clamp(s.risk / 20, 0, 1) * 100), label: 'Запас по травме', foot: s.risk == null ? 'Мало истории нагрузки' : 'Риск ' + num(s.risk, 1) + '% на 7 дней' }) +
      '</div>' + liveStrip({ title: 'Браслет ' + esc(a.short), sub: s.status === 'nodata' ? 'нет связи больше суток' : 'синхронизация ночью · пульс покоя ' + (s.rhr != null ? num(s.rhr) : '—'), hr: s.rhr || 56 }) + '</section>' +
      '<div class="grid g-main-r">' +
        '<section class="panel twin-profile" aria-label="Профиль">' + avatar(a, 'xl') + '<h2>' + esc(a.short) + '</h2><p>' + esc(a.posName) + ' · № ' + esc(a.num) + (a.age ? ' · ' + a.age + ' лет' : '') + '</p>' + statusBadge(s.status) + radar(axes) +
          '<p style="font-size:12.5px">Шкалы 0–100 относительно личной нормы спортсмена</p></section>' +
        '<section class="panel" aria-labelledby="today-title"><div class="panel-head"><div><h2 id="today-title">Сегодняшнее состояние</h2><p>' + fmtFull.format(asOfDate()) + '</p></div>' + (s.signal ? '<span class="badge warn">' + esc(s.signal) + '</span>' : '') + '</div><div class="panel-body" style="display:flex;flex-direction:column;gap:16px">' +
          (s.status === 'nodata' ? '<div class="note warn">' + icon('alert', 'icon-sm') + '<span>Нет свежих данных с устройства. Показатели появятся после синхронизации; первые 14–28 дней формируется личная норма.</span></div>' : '') +
          '<div class="metric-tiles"><div class="tile"><span>' + icon('activity', 'icon-sm') + 'Готовность</span><b class="' + scoreClass(s.readiness) + '">' + num(s.readiness) + '<small> /100</small></b></div><div class="tile"><span>' + icon('heart', 'icon-sm') + 'Восстановление</span><b class="' + scoreClass(s.recovery) + '">' + num(s.recovery) + '<small> /100</small></b></div><div class="tile"><span>' + icon('shield', 'icon-sm') + 'Риск травмы · 7 дн.</span><b class="' + riskClass(s.rr) + '">' + fmtRisk(s) + '</b><em>' + fmtRR(s.rr) + ' к среднему · модель</em></div></div>' +
          (isPilot()
            ? '<div class="kv"><div><span>' + icon('sleep', 'icon-sm') + 'Сон</span><b>' + D.fmtHours(s.sleep) + '</b></div><div><span>' + icon('load', 'icon-sm') + 'Нагрузка вчера</span><b>' + (a.days[idx - 1] && a.days[idx - 1].load != null ? num(a.days[idx - 1].load) + ' у.е.' : '—') + '</b></div><div><span>' + icon('activity', 'icon-sm') + 'Самооценка</span><b>' + (s.well && s.well.readiness != null ? s.well.readiness + ' / 10' : '—') + '</b></div><div><span>' + icon('chart', 'icon-sm') + 'ACWR</span><b>' + (s.acwr == null ? '—' : num(s.acwr, 2)) + '</b></div></div>'
            : '<div class="kv"><div><span>' + icon('sleep', 'icon-sm') + 'Сон</span><b>' + D.fmtHours(s.sleep) + '</b></div><div><span>' + icon('heart', 'icon-sm') + 'HRV</span><b>' + (s.hrv == null ? '—' : num(s.hrv) + ' мс') + '</b></div><div><span>' + icon('activity', 'icon-sm') + 'Пульс покоя</span><b>' + (s.rhr == null ? '—' : s.rhr + ' уд/мин') + '</b></div><div><span>' + icon('load', 'icon-sm') + 'ACWR</span><b>' + (s.acwr == null ? '—' : num(s.acwr, 2)) + '</b></div></div>') +
          '<div><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><b style="font-size:14.5px">Утренний чек-ин</b><p class="muted" style="margin:2px 0 0;font-size:13px">Самочувствие, сон и вчерашняя тренировка — обновляет прогноз модели. Не является психологической диагностикой.</p></div><span style="display:flex;gap:8px;flex-wrap:wrap">' + (isPilot() && cryptoReady() ? '<button class="btn btn-ghost btn-sm" type="button" data-action="athlete-link" data-id="' + a.id + '">' + icon('link', 'icon-sm') + 'Ссылка для телефона</button>' : '') + '<button class="btn btn-primary btn-sm" type="button" data-action="checkin" data-id="' + a.id + '">' + icon('brain', 'icon-sm') + (isPilot() ? 'Внести за спортсмена' : 'Пройти чек-ин') + '</button></span></div>' +
          '<div class="journal" style="margin-top:10px"><b style="font-size:13.5px;display:block;margin-bottom:4px">Последние наблюдения</b>' + (obs || '<p class="muted" style="margin:6px 0 0;font-size:13.5px">Чек-ин ещё не заполнен.</p>') + '</div></div>' +
        '</div></section>' +
      '</div>' +
      '<div class="grid g-2" style="align-items:start">' +
        '<section class="panel"><div class="panel-head"><div><h2>Прогноз на завтра</h2><p>Модель готовности · обучена на открытых данных SoccerMon</p></div>' + modelBadge() + '</div><div class="panel-body" style="display:flex;flex-direction:column;gap:14px">' + forecastHtml(a, s) + '</div></section>' +
        '<section class="panel"><div class="panel-head"><div><h2>Почему такой риск травмы</h2><p>Вклад факторов за последние 7 дней</p></div><a class="btn btn-ghost btn-sm" href="#/analytics">Планировщик ' + icon('arrow', 'icon-sm') + '</a></div><div class="panel-body">' + injuryFactorsHtml(a, 6) + '</div></section>' +
      '</div>' +
      '<div class="grid g-2">' +
        (isPilot()
          ? '<section class="panel"><div class="panel-head"><div><h2>Самооценка готовности</h2><p>30 дней · утренний чек-ин, 0–10</p></div></div><div class="panel-body">' +
            lineChart({ labels: days.map(function (d) { return d.date; }), label: 'Самооценка готовности за 30 дней', series: [{ name: 'Готовность, 0–10', color: 'var(--s1)', values: days.map(function (d) { return d.well && d.well.readiness != null ? d.well.readiness : null; }), area: true }], height: 200, min: 0, max: 10 }) + '</div></section>'
          : '<section class="panel"><div class="panel-head"><div><h2>HRV и личная норма</h2><p>30 дней · ночной rMSSD, мс</p></div></div><div class="panel-body">' +
            lineChart({ labels: days.map(function (d) { return d.date; }), label: 'HRV и личная норма', series: [{ name: 'HRV', color: 'var(--s1)', values: days.map(function (d) { return d.hrv; }), area: true, unit: ' мс' }, { name: 'Личная норма', color: 'var(--muted)', values: days.map(function (d) { return d.hrvBase; }), dash: true, unit: ' мс' }], height: 200 }) + '</div></section>') +
        '<section class="panel"><div class="panel-head"><div><h2>Сон и нагрузка</h2><p>30 дней. Пустой столбец — день отдыха</p></div></div><div class="panel-body stack-charts">' +
          '<div><h3 class="chart-title">Сон, часов</h3>' + lineChart({ labels: days.map(function (d) { return d.date; }), label: 'Сон за 30 дней, часов', series: [{ name: 'Сон', color: 'var(--s2)', values: days.map(function (d) { return d.sleep; }), dec: 1, unit: ' ч' }], height: 130, legend: false, min: Math.max(0, Math.floor(Math.min.apply(null, days.map(function (d) { return d.sleep == null ? 99 : d.sleep; }).concat([6])) - 1)), max: Math.ceil(Math.max.apply(null, days.map(function (d) { return d.sleep == null ? 0 : d.sleep; }).concat([9])) + 0.5) }) + '</div>' +
          '<div><h3 class="chart-title">Нагрузка, у.е. (sRPE)</h3>' + barChart({ labels: days.map(function (d) { return d.date; }), label: 'Тренировочная нагрузка за 30 дней', values: days.map(function (d) { return d.load == null ? null : Math.round(d.load); }), color: 'var(--s1)', restColor: 'color-mix(in srgb, var(--s1) 55%, var(--panel))', unit: ' у.е.', height: 130 }) + '</div>' +
        '</div></section>' +
      '</div>' +
      (isPilot() ? journalHtml(a) : '') +
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
    var baseWeek = ML && ML.ready ? D.round((1 - Math.pow(1 - ML.models.injury.base_rate_daily, 7)) * 100, 1) : null;
    var idx = ra.days.length - 1 - state.offset;
    var days = ra.days.slice(Math.max(0, idx - 13), idx + 1);
    var steps = [
      ['01 · Единый поток данных', 'Адаптеры устройств, лабораторий и опросов → очередь событий → нормализация единиц и времени → хранилище временных рядов. У каждого измерения: источник, спортсмен, согласие, качество, время получения. Пропуск не равен нулю.'],
      ['02 · Персональная базовая линия', 'Собрать 28–42 дня наблюдений; учитывать позицию, фазу сезона и историю травм. Использовать медиану и MAD, скользящие окна 3/7/28 дней. До накопления базы выводить «недостаточно данных», а не персональный прогноз.'],
      ['03 · Ранние сигналы', 'Пример проверяемого правила: HRV ниже личной базы на 20% два дня + сон менее 7 часов + рост интенсивной нагрузки. Это иллюстративные пороги, которые должен утвердить врач; они не являются клинически валидированным алгоритмом.'],
      ['04 · Модель риска', 'Калиброванная модель риска (градиентный бустинг) обучена на открытых данных и проверена на спортсменах, которых не видела; признаки — только прошлые дни, без утечки будущего. Следующий шаг — дообучение на размеченных исходах своей команды.'],
      ['05 · Клинический цикл', 'Сигнал → очередь врача → проверка симптомов → подтверждённое действие → повторная оценка. Острые симптомы идут по медицинскому протоколу независимо от AI-score; запрет автоматического допуска к соревнованиям.'],
      ['06 · Проверка эффективности', 'Сначала shadow-mode без влияния на решения. Измерять чувствительность, PPV, калибровку, ложные тревоги на спортсмено-неделю и нагрузку на врача. Затем проспективный пилот с сопоставимой группой.']
    ];
    return pageHead('analytics') +
      '<div class="grid g-main-r">' +
        '<section class="panel"><div class="panel-head"><div><h2>Ранние сигналы <span class="count">' + t.signals.length + '</span></h2><p>Отклонения от личной нормы, по убыванию риска</p></div></div><div class="list" style="margin-top:8px">' +
          (t.signals.map(function (x) { return athleteRow(x, { flags: true, risk: true }); }).join('') || '<div class="empty">' + icon('check') + 'Ранних сигналов нет</div>') + '</div></section>' +
        '<section class="panel panel-body" style="display:flex;flex-direction:column;gap:14px;padding-top:20px"><h2 class="panel-title">Как читать сигналы</h2>' +
          '<p class="muted" style="margin:0">Ранние сигналы объединяют отклонения сна, HRV и нагрузки относительно личной нормы, а модель риска оценивает сочетание нагрузки и самочувствия за 7 дней. Отдельный показатель не определяет риск травмы.</p>' +
          '<div class="flow"><span class="chip">Личная база</span><span class="arr">' + icon('arrow', 'icon-sm') + '</span><span class="chip">Сочетание сигналов</span><span class="arr">' + icon('arrow', 'icon-sm') + '</span><span class="chip">Оценка врача</span></div>' +
          '<div class="note">' + icon('info', 'icon-sm') + '<span>Риск считает модель, обученная на открытых данных (ROC-AUC ' + (CARD_I ? num(CARD_I.metrics_oof[CARD_I.chosen].roc_auc, 2) : '—') + ' на новых спортсменах). Спортсмены и измерения в демо вымышленные.</span></div>' +
          '<a class="btn btn-ghost btn-sm" style="align-self:flex-start" href="#/models">Как обучены модели ' + icon('arrow', 'icon-sm') + '</a></section>' +
      '</div>' +
      '<section class="panel"><div class="panel-head"><div><h2>Факторы риска</h2><p>Объяснение прогноза модели · ' + esc(ra.short) + '</p></div>' + athleteSelect('risk-select', ra.id, 'Спортсмен для разбора факторов') + '</div>' +
        '<div class="panel-body grid g-2" style="align-items:start">' +
          '<div style="display:flex;flex-direction:column;gap:12px"><div class="metric-tiles fc-tiles"><div class="tile"><span>' + icon('shield', 'icon-sm') + 'Риск травмы · 7 дн.</span><b class="' + riskClass(rs.rr) + '">' + fmtRisk(rs) + '</b><em>' + fmtRR(rs.rr) + ' к среднему уровню</em></div><div class="tile"><span>' + icon('activity', 'icon-sm') + 'Готовность завтра</span><b>' + (rs.fc ? num(rs.fc.value, 1) + '<small> / 10</small>' : '—') + '</b><em>' + (rs.fc ? '«плохой день»: ' + Math.round(rs.fc.pLow * 100) + '%' : 'нужен чек-ин') + '</em></div></div>' + injuryFactorsHtml(ra, 7) + '</div>' +
          '<div style="display:flex;flex-direction:column;gap:14px"><div><b style="font-size:14px">Риск травмы за 14 дней</b>' + lineChart({ labels: days.map(function (d) { return d.date; }), label: 'Риск травмы за 14 дней', series: [{ name: 'Риск травмы · 7 дн., %', color: 'var(--s1)', values: days.map(function (d) { return d.risk; }), area: true, unit: '%', dec: 1 }, { name: 'Средний уровень', color: 'var(--muted)', values: days.map(function () { return baseWeek; }), dash: true, unit: '%', dec: 1 }], height: 190, min: 0 }) + '</div>' +
            '<div class="planner-box"><b style="font-size:14px">' + icon('sliders', 'icon-sm') + ' Планировщик нагрузки</b><p class="muted" style="margin:4px 0 12px;font-size:13px">Что будет с риском, если изменить план на ближайшие 3 дня. Расчёт той же моделью, прямо в браузере.</p>' + plannerHtml(ra) + '</div></div>' +
        '</div></section>' +
      '<section class="panel"><div class="panel-head"><div><h2>Как работает раннее предупреждение</h2><p>Заимствуем общие продуктовые принципы, не проприетарные алгоритмы или обучающие данные</p></div></div><div class="panel-body"><div class="steps-app">' +
        steps.map(function (st) { return '<div class="step-card"><span class="n">' + st[0].split(' · ')[0] + '</span><b>' + st[0].split(' · ')[1] + '</b><p>' + st[1] + '</p></div>'; }).join('') + '</div></div></section>' +
      footerStrip();
  };
  MOUNT.analytics = function () {
    var sel = document.getElementById('risk-select');
    if (sel) sel.addEventListener('change', function () { state.riskAthlete = sel.value; save(); render(); });
    mountPlanner();
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
        '<section class="panel"><div class="panel-head"><div><h2>Рекомендации</h2><p>Сформированы по правилам, утверждённым врачом и тренерским штабом</p></div></div>' +
          '<div class="table-tools">' + seg + '</div>' +
          '<div>' + (shown.map(recCard).join('') || '<div class="empty">' + icon('check') + 'В этой категории пусто.</div>') + '</div>' +
          '<div class="panel-foot"><span>' + icon('shield', 'icon-sm') + (isPilot() ? ' Рекомендации формируются по данным команды и прогнозам моделей.' : ' Рекомендации демонстрационные.') + ' Медицинские назначения и допуск к тренировкам остаются за врачом.</span></div></section>' +
        '<section class="panel"><div class="panel-body" style="display:flex;flex-direction:column;gap:12px"><h2 class="panel-title">Решение принимает специалист</h2>' +
          '<p class="muted" style="margin:0;font-size:13.5px">Каждое решение сохраняется в журнале. Рекомендации не применяются автоматически и не заменяют очную оценку. Рекомендации по лечению и медикаментам система не формирует.</p>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px"><b>Журнал решений</b>' + (journal.length ? '<button class="btn btn-quiet btn-sm" type="button" data-action="clear-journal">Очистить</button>' : '') + '</div>' +
          '<div class="journal">' + (journal.map(function (x) { return '<div class="journal-row"><span class="dot" style="background:' + (x.d.status === 'accepted' ? 'var(--mint)' : 'var(--faint)') + '"></span><div><b>' + (x.d.status === 'accepted' ? 'Согласовано' : 'Отклонено') + ': ' + esc(x.r.title) + '</b><span>' + (x.r.a ? esc(x.r.a.short) : 'Команда') + ' · ' + esc(x.d.by) + ' · ' + fmtTime.format(new Date(x.d.ts)) + '</span></div></div>'; }).join('') || '<p class="muted" style="margin:0;font-size:13.5px">Пока нет решений по рекомендациям.</p>') + '</div>' +
        '</div></section>' +
      '</div>' + footerStrip();
  };

  /* ---------- Reports ---------- */
  var REPORTS = {
    team: { title: 'Состояние команды', ic: 'users', desc: 'Состав, готовность и ключевые показатели всех спортсменов на дату среза.' },
    risk: { title: 'Риски и прогнозы моделей', ic: 'shield', desc: 'Риск травмы на 7 дней, прогноз готовности на завтра, главный фактор риска и ранние сигналы.' },
    pilot: { title: 'Результаты пилота', ic: 'chart', desc: 'Средние показатели команды по дням за 30 дней — для отслеживания динамики пилота.' }
  };
  function reportRows(type) {
    var t = team();
    if (type === 'team') {
      return [['Спортсмен', 'Позиция', 'Номер', 'Готовность', 'Восстановление', 'Риск травмы 7 дн., %', 'Сон, ч', 'HRV, мс', 'Статус']].concat(sortRows(t.list, { key: 'risk', dir: 'desc' }).map(function (x) {
        return [x.a.short, x.a.posName, x.a.num, x.s.readiness, x.s.recovery, x.s.risk, x.s.sleep == null ? '' : D.round(x.s.sleep, 1), x.s.hrv, STATUS[x.s.status][1]];
      }));
    }
    if (type === 'risk') {
      return [['Спортсмен', 'Риск травмы 7 дн., %', 'Кратность к среднему', 'Главный фактор риска', 'Готовность завтра (0–10)', 'Вероятность «плохого дня», %', 'Восстановление', 'Сон, ч', 'HRV к норме, %', 'ACWR', 'Сигнал', 'Флаги']].concat(sortRows(t.list, { key: 'risk', dir: 'desc' }).map(function (x) {
        var top = D.factorBreakdown(x.a, state.offset).filter(function (f) { return f.c > 0; })[0];
        return [x.a.short, x.s.risk, x.s.rr == null ? '' : D.round(x.s.rr, 2), top ? top.name + ' (' + top.value + ')' : '', x.s.fc ? D.round(x.s.fc.value, 1) : '', x.s.fc ? Math.round(x.s.fc.pLow * 100) : '', x.s.recovery, x.s.sleep == null ? '' : D.round(x.s.sleep, 1), x.s.hrvPct == null ? '' : x.s.hrvPct, x.s.acwr == null ? '' : x.s.acwr, x.s.signal || '', (x.s.flags || []).map(function (f) { return f.t; }).join('; ')];
      }));
    }
    var labels = t.labels(30), r = t.series('readiness', 30), v = t.series('recovery', 30), k = t.series('risk', 30);
    return [['Дата', 'Готовность (ср.)', 'Восстановление (ср.)', 'Риск травмы 7 дн. (ср.), %']].concat(labels.map(function (d, i) { return [d.toISOString().slice(0, 10), r[i], v[i], k[i]]; }));
  }
  function downloadReport(type) {
    var rows = reportRows(type);
    var meta = [['AI Sports Precision Medicine — ' + REPORTS[type].title], [(isPilot() ? pilot.team.name : 'Демо-команда') + ' · срез ' + asOfDate().toISOString().slice(0, 10)], ['Вымышленные данные. Прогнозы моделей не являются медицинскими заключениями.'], []];
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
    logEvent('report', 'Сформирован отчёт «' + REPORTS[type].title + '»');
    toast('Отчёт «' + REPORTS[type].title + '» скачан');
  }
  /* ----- PDF-отчёт: таблица рисуется на canvas (кириллица — шрифтами системы), страницы A4 упаковываются в PDF без библиотек ----- */
  function pdfFromJpegs(pages) {
    // pages: [{ bytes: Uint8Array (JPEG), w, h }] → Blob application/pdf, A4 альбом 842×595 pt
    var enc = new TextEncoder(), parts = [], offsets = [], pos = 0;
    function push(x) { var b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); pos += b.length; }
    function obj(n, body) { offsets[n] = pos; push(n + ' 0 obj\n'); body(); push('\nendobj\n'); }
    var n = pages.length, kids = [];
    for (var i = 0; i < n; i++) kids.push((3 + i * 3) + ' 0 R');
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, function () { push('<< /Type /Catalog /Pages 2 0 R >>'); });
    obj(2, function () { push('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>'); });
    pages.forEach(function (p, i) {
      var pg = 3 + i * 3, ct = pg + 1, im = pg + 2;
      obj(pg, function () { push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /XObject << /Im' + i + ' ' + im + ' 0 R >> >> /Contents ' + ct + ' 0 R >>'); });
      var cs = 'q 842 0 0 595 0 0 cm /Im' + i + ' Do Q';
      obj(ct, function () { push('<< /Length ' + cs.length + ' >>\nstream\n' + cs + '\nendstream'); });
      obj(im, function () { push('<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.bytes.length + ' >>\nstream\n'); push(p.bytes); push('\nendstream'); });
    });
    var total = 3 + n * 3, xref = pos;
    push('xref\n0 ' + total + '\n0000000000 65535 f \n');
    for (var k = 1; k < total; k++) push(String(offsets[k]).padStart(10, '0') + ' 00000 n \n');
    push('trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF');
    return new Blob(parts, { type: 'application/pdf' });
  }
  function renderReportPages(title, sub, rows) {
    var S = 2.5, W = 842, H = 595, M = 36, ROW = 18, TOP = 106, BOTTOM = 30;
    var FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI", Roboto, Arial, sans-serif';
    var head = rows[0], body = rows.slice(1);
    var meas = document.createElement('canvas').getContext('2d');
    function f(size, w) { return (w || 400) + ' ' + size + 'px ' + FONT; }
    function txt(v) {
      if (v == null || v === '' || (typeof v === 'number' && v !== v)) return '—';
      if (typeof v !== 'number') return String(v);
      var dec = (String(v).split('.')[1] || '').length;
      return num(v, Math.min(2, dec));
    }
    // колонка числовая, если большинство значений — числа: такие выравниваем вправо, включая прочерки
    var numericCol = head.map(function (h, ci) { var n = 0, t = 0; body.forEach(function (r) { if (r[ci] != null && r[ci] !== '') { t++; if (typeof r[ci] === 'number') n++; } }); return t > 0 && n / t > 0.6; });
    // ширины колонок — по содержимому, в пределах страницы
    meas.font = f(8.6);
    var natural = head.map(function (h, ci) {
      var m = 0; body.slice(0, 200).forEach(function (r) { m = Math.max(m, meas.measureText(txt(r[ci])).width); });
      meas.font = f(8.2, 600); var hw = meas.measureText(String(h)).width; meas.font = f(8.6);
      // заголовок может переноситься на 2 строки, поэтому числовой колонке хватает половины его ширины
      if (numericCol[ci]) return Math.max(m, Math.min(hw / 2 + 10, 74), 30) + 14;
      return Math.min(Math.max(m, Math.min(hw, 110), 34) + 14, ci === 0 ? 200 : 260);
    });
    var avail = W - 2 * M, sum = natural.reduce(function (a, b) { return a + b; }, 0);
    var widths;
    if (sum <= avail) widths = natural.map(function (w) { return w + (avail - sum) * w / sum; });
    else {
      // сжимаем только широкие текстовые колонки, имена и числа не трогаем
      var flex = natural.map(function (w, ci) { return ci > 0 && !numericCol[ci] && w > 90; });
      var fixed = natural.reduce(function (a, w, ci) { return a + (flex[ci] ? 0 : w); }, 0);
      var flexSum = natural.reduce(function (a, w, ci) { return a + (flex[ci] ? w : 0); }, 0);
      var k = flexSum ? Math.max(0.3, (avail - fixed) / flexSum) : 1;
      widths = natural.map(function (w, ci) { return flex[ci] ? w * k : w; });
      var tot = widths.reduce(function (a, b) { return a + b; }, 0);
      if (tot > avail) widths = widths.map(function (w) { return w * avail / tot; });
    }
    var perPage = Math.floor((H - TOP - BOTTOM - ROW) / ROW), pages = Math.max(1, Math.ceil(body.length / perPage)), out = [];
    function clip(ctx, s, w) { if (ctx.measureText(s).width <= w) return s; while (s.length > 1 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }
    function wrapHead(ctx, s, w) {
      var words = String(s).split(' '), lines = [''];
      words.forEach(function (wd) { var t = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + wd : wd; if (ctx.measureText(t).width > w && lines[lines.length - 1]) lines.push(wd); else lines[lines.length - 1] = t; });
      return lines.slice(0, 2).map(function (l, i, a) { return i === a.length - 1 ? clip(ctx, l, w) : l; });
    }
    for (var p = 0; p < pages; p++) {
      var cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
      var c = cv.getContext('2d'); c.scale(S, S);
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
      // шапка
      c.fillStyle = '#f2873d'; c.fillRect(M, M - 2, 22, 22);
      c.strokeStyle = '#2a1606'; c.lineWidth = 1.6; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath(); c.moveTo(M + 4, M + 10); c.lineTo(M + 8, M + 10); c.lineTo(M + 10, M + 5); c.lineTo(M + 13, M + 15); c.lineTo(M + 15.5, M + 8); c.lineTo(M + 18, M + 10); c.stroke();
      c.fillStyle = '#1d1b17'; c.font = f(10.5, 700); c.textBaseline = 'middle'; c.fillText('AI Sports', M + 30, M + 4);
      c.fillStyle = '#736b60'; c.font = f(8); c.fillText('Precision Medicine', M + 30, M + 15);
      c.textAlign = 'right'; c.fillText('Сформирован ' + fmtTime.format(new Date()), W - M, M + 9); c.textAlign = 'left';
      c.fillStyle = '#1d1b17'; c.font = f(17, 700); c.fillText(title, M, M + 44);
      c.fillStyle = '#736b60'; c.font = f(9); c.fillText(sub, M, M + 62);
      // таблица
      var y = TOP;
      c.fillStyle = '#f6f1e8'; c.fillRect(M, y, W - 2 * M, ROW + 6);
      c.font = f(8.2, 600); c.fillStyle = '#45403a';
      var x = M;
      head.forEach(function (h, ci) {
        var ls = wrapHead(c, h, widths[ci] - 12), right = numericCol[ci];
        c.textAlign = right ? 'right' : 'left';
        ls.forEach(function (l, li) { c.fillText(l, right ? x + widths[ci] - 8 : x + 6, y + (ls.length === 1 ? (ROW + 6) / 2 : 7 + li * 10)); });
        c.textAlign = 'left'; x += widths[ci];
      });
      y += ROW + 6;
      body.slice(p * perPage, (p + 1) * perPage).forEach(function (r, ri) {
        c.font = f(8.6); x = M;
        r.forEach(function (v, ci) {
          var s = txt(v), isNum = numericCol[ci];
          c.fillStyle = ci === 0 ? '#1d1b17' : '#3d3832'; if (ci === 0) c.font = f(8.6, 600); else c.font = f(8.6);
          s = clip(c, s, widths[ci] - 12);
          if (isNum) { c.textAlign = 'right'; c.fillText(s, x + widths[ci] - 8, y + ROW / 2); c.textAlign = 'left'; } else c.fillText(s, x + 6, y + ROW / 2);
          x += widths[ci];
        });
        c.fillStyle = '#ece5da'; c.fillRect(M, y + ROW - 0.5, W - 2 * M, 0.6);
        y += ROW;
      });
      // подвал
      c.fillStyle = '#8e8579'; c.font = f(7.5);
      c.fillText('Прогнозы моделей носят вероятностный характер и не являются медицинским заключением. Решение принимает специалист.', M, H - 20);
      c.textAlign = 'right'; c.fillText('Стр. ' + (p + 1) + ' из ' + pages, W - M, H - 20); c.textAlign = 'left';
      out.push(cv);
    }
    return out;
  }
  function downloadReportPdf(type) {
    var R = REPORTS[type], rows = reportRows(type);
    if (type === 'risk') { // в PDF — без служебных колонок ACWR и «Флаги» (они есть в CSV)
      var drop = [rows[0].indexOf('ACWR'), rows[0].indexOf('Флаги')].filter(function (i) { return i > -1; });
      rows = rows.map(function (r) { return r.filter(function (_, i) { return drop.indexOf(i) < 0; }); });
    }
    var sub = (isPilot() ? '«' + pilot.team.name + '»' : 'Демо-команда, вымышленные данные') + ' · срез на ' + fmtFull.format(asOfDate()) + ' · ' + (rows.length - 1) + ' ' + plural(rows.length - 1, 'строка', 'строки', 'строк');
    var go = function () {
      var canv = renderReportPages(R.title, sub, rows);
      Promise.all(canv.map(function (cv) {
        return new Promise(function (res) { cv.toBlob(function (b) { b.arrayBuffer().then(function (ab) { res({ bytes: new Uint8Array(ab), w: cv.width, h: cv.height }); }); }, 'image/jpeg', 0.92); });
      })).then(function (pages) {
        var blob = pdfFromJpegs(pages), url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = 'ai-sports_' + type + '_' + asOfDate().toISOString().slice(0, 10) + '.pdf';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        logEvent('report', 'Сформирован PDF-отчёт «' + R.title + '»');
        toast('PDF «' + R.title + '» скачан');
      });
    };
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(go);
  }
  RENDER.reports = function () {
    return pageHead('reports') + '<div class="grid g-3">' + Object.keys(REPORTS).map(function (k) {
      var R = REPORTS[k], rows = reportRows(k);
      var head = rows[0].slice(0, 3), body = rows.slice(1, 4).map(function (r) { return r.slice(0, 3); });
      return '<article class="panel report-card"><span class="ri">' + icon(R.ic) + '</span><span class="report-meta">CSV и PDF · ' + (rows.length - 1) + ' ' + plural(rows.length - 1, 'строка', 'строки', 'строк') + ' · ' + rows[0].length + ' ' + plural(rows[0].length, 'колонка', 'колонки', 'колонок') + '</span><h3>' + R.title + '</h3><p>' + R.desc + '</p>' +
        '<div class="report-preview" aria-label="Предпросмотр"><table><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + body.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' +
        '<div class="report-actions"><button class="btn btn-ghost" type="button" data-download="' + k + '">' + icon('download', 'icon-sm') + 'CSV для Excel</button><button class="btn btn-ghost" type="button" data-pdf="' + k + '">' + icon('file', 'icon-sm') + 'PDF</button></div></article>';
    }).join('') + '</div>' +
      '<div class="note">' + icon('info', 'icon-sm') + '<span>Файлы формируются прямо в браузере и не отправляются на сервер. CSV открывается в Excel без настройки (UTF-8, разделитель «;»), PDF — формат A4, готов к печати и отправке.</span></div>' + footerStrip();
  };

  /* ---------- Settings ---------- */
  RENDER.settings = function () {
    var themeSeg = '<div class="seg" role="group" aria-label="Тема">' + [['light', 'Светлая'], ['dark', 'Тёмная'], ['system', 'Как в системе']].map(function (x) { return '<button type="button" data-theme-set="' + x[0] + '" aria-pressed="' + (state.theme === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
    var roleSeg = '<div class="seg" role="group" aria-label="Роль">' + Object.keys(ROLES).map(function (k) { return '<button type="button" data-role-set="' + k + '" aria-pressed="' + (state.role === k) + '">' + ROLES[k].title + '</button>'; }).join('') + '</div>';
    var sources = [['G', 'Garmin', 'Health API · сон, HRV, нагрузка'], ['AH', 'Apple Health', 'HealthKit через приложение спортсмена'], ['P', 'Polar', 'AccessLink · тренировки и пульс'], ['O', 'Oura Ring', 'Сон и восстановление'], ['W', 'Whoop', 'Восстановление и нагрузка'], ['Lab', 'Лабораторная система', 'Импорт результатов анализов'], ['AS', 'Браслет AI Sports', 'Собственное устройство платформы']];
    var M = [['Готовность и восстановление', 'y', 'y', 'y', 'n'], ['Данные носимых устройств', 'y', 'y', 'y', 'n'], ['Лабораторные анализы', 'y', 'n', 'n', 'n'], ['Журнал травм и болезней', 'y', 'p', 'n', 'n'], ['Ответы чек-ина (детально)', 'n', 'n', 'y', 'n'], ['Статус чек-ина (обобщённо)', 'y', 'p', 'y', 'n'], ['Пользователи, согласия, аудит', 'n', 'n', 'n', 'y']];
    function cell(v) { return v === 'y' ? '<td class="y">' + icon('check', 'icon-sm') + '<span class="sr-only">Да</span></td>' : v === 'p' ? '<td class="p">с согласия</td>' : '<td class="n">—<span class="sr-only">Нет</span></td>'; }
    var wsPanel = '<section class="panel"><div class="panel-head"><div><h2>Моя команда</h2><p>' + (pilot ? '«' + esc(pilot.team.name) + '» · данные хранятся только на этом устройстве' : 'Рабочее пространство пилота для реальной команды') + '</p></div>' + (pilot ? '<span class="badge ice plain">' + icon('users', 'icon-sm') + (isPilot() ? 'Активно' : 'Создано') + '</span>' : '') + '</div><div class="panel-body">' +
      (pilot
        ? '<div class="kv" style="margin-bottom:14px"><div><span>Спортсменов</span><b>' + pilot.athletes.length + '</b></div><div><span>Записей</span><b>' + num(pilotRecordCount()) + '</b></div></div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
          (!isPilot() ? '<button class="btn btn-primary btn-sm" type="button" data-ws-go="pilot">' + icon('users', 'icon-sm') + 'Переключиться на команду</button>' : '<button class="btn btn-ghost btn-sm" type="button" data-ws-go="demo">' + icon('spark', 'icon-sm') + 'Перейти в демо</button>') +
          '<button class="btn btn-ghost btn-sm" type="button" data-action="team-links">' + icon('link', 'icon-sm') + 'Ссылки на чек-ин</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-action="inbox">' + icon('brain', 'icon-sm') + 'Входящие чек-ины</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-action="pilot-import">' + icon('upload', 'icon-sm') + 'Импорт истории</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-action="pilot-backup">' + icon('download', 'icon-sm') + 'Резервная копия</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-action="staff">' + icon('users', 'icon-sm') + 'Сотрудники</button>' +
          '<button class="btn btn-quiet btn-sm" type="button" data-action="rotate-key">' + icon('shield', 'icon-sm') + 'Сменить ключ ссылок</button>' +
          '<button class="btn btn-danger btn-sm" type="button" data-action="pilot-clear">' + icon('trash', 'icon-sm') + 'Удалить пространство</button></div>' +
          '<div class="note" style="margin-top:14px">' + icon('shield', 'icon-sm') + '<span>Делайте зашифрованную копию хотя бы раз в неделю: при очистке данных браузера записи исчезнут. Рекомендуем коды вместо фамилий спортсменов.</span></div>'
        : '<p class="muted" style="margin:0 0 14px;font-size:13.5px">Реальный состав, ежедневные чек-ины и нагрузка, прогнозы моделей и зашифрованные резервные копии. Всё хранится на этом устройстве и не отправляется на сервер.</p>' +
          '<button class="btn btn-primary" type="button" data-action="pilot-create">' + icon('plus', 'icon-sm') + 'Создать «Мою команду»</button>') +
      '</div></section>';
    return pageHead('settings') +
      wsPanel +
      '<div class="grid g-2" style="align-items:start">' +
        '<section class="panel"><div class="panel-head"><div><h2>Рабочее пространство</h2><p>' + (isPilot() ? 'Настройки кабинета на этом устройстве' : 'Демонстрационный кабинет спортивного врача') + '</p></div></div><div class="panel-body">' +
          '<div class="setting"><div><b>Тема оформления</b><span class="d">Тёмная, светлая или как в системе</span></div>' + themeSeg + '</div>' +
          '<div class="setting"><div><b>Компактный режим</b><span class="d">Уменьшить расстояние между строками</span></div><span class="switch"><input type="checkbox" id="compact" ' + (state.compact ? 'checked' : '') + ' aria-label="Компактный режим"><span class="track"></span></span></div>' +
          '<div class="setting"><div><b>' + (isPilot() ? 'Ваша роль' : 'Роль в демо') + '</b><span class="d">' + (isPilot() ? 'Определяет, какие данные видны, — по матрице доступа' : 'Меняет, какие данные видны — как в реальной матрице доступа') + '</span></div>' + roleSeg + '</div>' +
          '<div class="setting"><div><b>Язык интерфейса</b><span class="d">Русский · казахский запланирован для пилота</span></div><div class="seg" role="group" aria-label="Язык"><button type="button" aria-pressed="true">Русский</button><button type="button" disabled aria-pressed="false" title="Скоро">Қазақша · скоро</button></div></div>' +
          (isPilot()
            ? '<div class="setting"><div><b>Режим данных</b><span class="d">Реальная команда «' + esc(pilot.team.name) + '» · данные только на этом устройстве</span></div><span class="badge ok">Пилот</span></div>'
            : '<div class="setting"><div><b>Режим данных</b><span class="d">Только демонстрационные данные, без реальных людей</span></div><span class="badge info">Демо</span></div>') +
          (isPilot() ? '' : '<div class="setting"><div><b>Сбросить демо-данные</b><span class="d">Удалить добавленных спортсменов, чек-ины, решения и настройки в этом браузере</span></div><button class="btn btn-danger btn-sm" type="button" data-action="reset">' + icon('refresh', 'icon-sm') + 'Сбросить</button></div>') +
        '</div></section>' +
        '<div style="display:flex;flex-direction:column;gap:16px">' +
          '<section class="panel"><div class="panel-head"><div><h2>Источники данных</h2><p>' + (isPilot() ? 'Подключены ручной ввод, чек-ин по ссылке и импорт CSV. Носимые устройства — по запросу.' : 'Интеграции запланированы. В демо внешние устройства не подключены.') + '</p></div></div><div class="panel-body">' +
            (isPilot() ? [['CI', 'Чек-ин по ссылке', 'Спортсмен отвечает с телефона, ответ зашифрован'], ['CSV', 'Импорт истории', 'Нагрузка и самочувствие из таблицы'], ['Ru', 'Ввод в кабинете', 'Нагрузка дня, правка журнала']].map(function (s) { return '<div class="source"><span class="si">' + s[0] + '</span><span class="grow"><b>' + s[1] + '</b><span>' + s[2] + '</span></span><span class="badge ok">Активно</span></div>'; }).join('') : '') +
            sources.map(function (s) { return '<div class="source"><span class="si">' + s[0] + '</span><span class="grow"><b>' + s[1] + '</b><span>' + s[2] + '</span></span><span class="badge mute">Не подключено</span></div>'; }).join('') +
            '<a class="btn btn-ghost btn-sm" style="margin-top:14px" href="mailto:' + EMAIL + '?subject=' + encodeURIComponent('Интеграция источника данных — AI Sports') + '">' + icon('mail', 'icon-sm') + 'Обсудить интеграцию</a></div></section>' +
          '<section class="panel"><div class="panel-head"><div><h2>Матрица доступа</h2><p>Каждая роль видит только нужную ей категорию данных</p></div></div><div class="panel-body table-wrap"><table class="access-table"><thead><tr><th scope="col">Данные</th><th scope="col">Врач</th><th scope="col">Тренер</th><th scope="col">Психолог</th><th scope="col">Админ</th></tr></thead><tbody>' +
            M.map(function (r) { return '<tr><td>' + r[0] + '</td>' + cell(r[1]) + cell(r[2]) + cell(r[3]) + cell(r[4]) + '</tr>'; }).join('') + '</tbody></table></div></section>' +
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
      ['FC Barcelona', 'Омика, состав тела, питание, сон, GPS-нагрузка', 'Мультимодальные связи, ранние сигналы', 'Партнёрский исследовательский кейс; цена не указана', 'Элитные спортсмены клуба'],
      ['Zone7', 'Данные разных устройств, нагрузка и восстановление', 'Риск травм, рекомендации нагрузки, планер', 'B2B для команд; цена в референсе не раскрыта', 'Профессиональные клубы'],
      ['AI Sports', 'Медицина, физиология, сон, нагрузка, психология; омика — позже', 'Модели риска травмы и готовности на открытых данных, объяснение факторов, планировщик нагрузки, mental check-in', '$500–1 000 / спортсмен / месяц', 'Профессиональные команды, федерации и клубы']
    ];
    var closed = [['Kitman Labs', 'Единая история спортсмена, разграничение ролей, объяснение факторов риска'], ['NFL / AWS', 'Командный портал и агрегированные бенчмарки; не копировать масштаб симуляций в MVP'], ['InsideTracker', 'Динамика биомаркеров и понятный план действий; клиническое сопровождение отдельно'], ['FC Barcelona', 'Личная базовая линия, сочетание сигналов, контроль качества измерений'], ['Zone7', 'Device-agnostic слой, недельный план, проверка сценария нагрузки']];
    var hyp = [
      ['Клинический контур, а не дашборд', 'Единый маршрут «сигнал → спортивный врач → план → контроль результата» для нескольких команд и федераций; локальное хранение, согласия и аудит доступа. Проверять требования юристами до внедрения.'],
      ['Модели под вид спорта', 'Базовые модели обучены на открытых данных и используют относительные признаки. Для каждого вида спорта — дообучение на специфичных нагрузках и позициях, затем проспективная валидация на нескольких командах.'],
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
        '<p><b>Миллион измерений ≠ миллион независимых примеров.</b> 20–25 спортсменов за 6 месяцев недостаточно, чтобы с нуля обучить прогноз травм: исходы редки, измерения коррелированы. Поэтому базовые модели обучены на открытых научных когортах (74 бегуна и 22 футболистки, ~47 тыс. дней), а пилот проверяет их перенос, калибровку и пользу для штаба. Подробно — в разделе <a href="#/models">Модели ИИ</a>.</p></div></section>' +
      '<section class="panel"><div class="panel-head"><div><h2><span class="badge info plain">05</span> Экономика: оправданы ли $500–1 000 в месяц?</h2></div></div><div class="panel-body" style="display:flex;flex-direction:column;gap:14px">' +
        '<div class="money"><div><span>Лицензия на атлета</span><b>$6 000–12 000 / год</b></div><div><span>24 спортсмена · 6 месяцев</span><b>$72 000–144 000</b></div><div><span>24 спортсмена · год</span><b>$144 000–288 000</b></div></div>' +
        '<div class="grid g-3" style="gap:12px">' +
          '<div class="hyp"><b>Не сравнивать SaaS и клинический сервис</b><p>InsideTracker: $149/год за подписку, анализы отдельно. OneTwenty: $499/год по референсу, с панелями, добавками и доступом к врачам. Предложение AI Sports дороже примерно в 12–81 раз по годовой подписке, но B2C и B2B-пакеты различаются по объёму услуг.</p></div>' +
          '<div class="hyp"><b>Условно оправдано — как managed service</b><p>Цена возможна при включённых лабораторных панелях, выделенной клинической команде, согласованных сроках ответа, интеграциях, защите данных и отчётности федерации. Только dashboard и рекомендации вряд ли обоснуют эту цену для небольшой команды.</p></div>' +
          '<div class="hyp"><b>Рекомендованная упаковка</b><p>Разделить платформу, внедрение/интеграции и медицинское сопровождение. Предложить платный шестимесячный пилот с фиксированным объёмом. Указать число анализов, консультаций и SLA; не продавать неограниченную медицинскую помощь по цене лицензии.</p></div>' +
        '</div>' +
        '<div class="note">' + icon('info', 'icon-sm') + '<span><b>Как доказать ценность:</b> ROI = предотвращённые пропущенные дни × согласованная стоимость дня + сэкономленное время специалистов − полная стоимость. Зафиксировать baseline, учесть сезонность и отсутствие гарантии снижения травм. $600/год и $500/месяц — разные сегменты: 10 000 × $600 = $6 млн/год; 10 000 × $500 × 12 = $60 млн/год. Это сценарии выручки, не прогноз продаж. Цели снижения травм 20–30% — гипотезы, а не обещание.</span></div>' +
      '</div></section>' +
      '<section class="pitch"><span class="kicker"><span class="dot"></span>06 · Elevator pitch · 100 слов</span><h3 style="margin-top:8px">Не ещё один трекер. Единая система заботы о спортсмене.</h3>' +
        '<p>AI Sports Precision Medicine — клиническая платформа сопровождения профессиональных команд. Мы объединяем лабораторные показатели, сон, тренировочную нагрузку и психологические опросы в персональную модель спортсмена. Система замечает сочетания ранних отклонений, объясняет сигнал врачу и помогает согласовать индивидуальный план восстановления, питания и подготовки. Решения остаются за специалистами; качество данных и неопределённость видны пользователю. Отличие — непрерывный маршрут от сигнала до измеренного результата, прозрачные модели с честными метриками и преемственность данных между командами. Шестимесячный пилот проверяет доступность спортсменов, полезность предупреждений и экономику сопровождения.</p></section>' +
      footerStrip();
  };

  /* ---------- Help ---------- */
  RENDER.help = function () {
    var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    var mod = mac ? '⌘' : 'Ctrl';
    var faq = [
      ['Откуда данные в кабинете?', 'Это демонстрационный состав из 24 вымышленных спортсменов. Измерения сгенерированы, а риск травмы и прогноз готовности рассчитывают настоящие обученные модели прямо в браузере. Свои данные можно проверить в разделе «Модели ИИ» → «Проверить на своих данных».'],
      ['Что значит «Риск травмы · 7 дн.»?', 'Оценка вероятности травмы в ближайшую неделю по модели, обученной на открытых данных 74 спортсменов. Рядом — кратность к среднему уровню (например, ×1,6). Это повод для внимания специалиста, а не диагноз.'],
      ['Как работает планировщик нагрузки?', 'В разделе «AI-аналитика» задайте нагрузку и интенсивность на ближайшие 3 дня — модель пересчитает риск травмы и сравнит с обычным режимом.'],
      ['Почему я не вижу анализы?', 'Лабораторные показатели — медицинская тайна и доступны роли «Спортивный врач». Смените роль в меню профиля справа вверху или в настройках.'],
      ['Как вести реальную команду, а не демо?', 'Нажмите на карточку команды слева вверху и создайте «Мою команду»: реальный состав, утренние чек-ины, нагрузка дня и импорт истории из CSV. Все данные хранятся только на этом устройстве — настройте зашифрованную резервную копию в настройках.'],
      ['Как спортсмены заполняют чек-ин с телефона?', 'В карточке «Цифровой двойник» нажмите «Ссылка для телефона» (или «Ссылки на чек-ин» в настройках — сразу для всей команды) и отправьте спортсмену ссылку или QR-код лично. Спортсмен отвечает за минуту без регистрации; ответ шифруется и приходит вам ссылкой в мессенджере — откройте её на этом устройстве или вставьте пачку ответов во «Входящие чек-ины». Если ссылка попала не тому человеку — смените ключ ссылок: все старые ссылки перестанут работать.'],
      ['Как перенести данные на другое устройство?', 'Настройки → Моя команда → «Резервная копия»: задайте пароль и скачайте зашифрованный файл. На новом устройстве откройте кабинет, нажмите «Создать «Мою команду»» → «У меня есть резервная копия» и выберите файл. Ссылки спортсменов продолжат работать.'],
      ['Что умеет администратор?', 'Роль «Администратор» управляет пользователями и их ролями, согласиями спортсменов и видит журнал аудита, но не имеет доступа к медицинским данным. Переключитесь на неё в меню профиля и откройте раздел «Администрирование».'],
      ['Где хранятся мои действия в демо?', 'Добавленные спортсмены, чек-ины, решения и настройки сохраняются только в вашем браузере (localStorage) и никуда не отправляются. Их можно удалить в настройках кнопкой «Сбросить».'],
      ['Как выгрузить отчёт?', 'Нажмите «Создать отчёт» в любом разделе или откройте раздел «Отчёты». Файл CSV формируется прямо в браузере и открывается в Excel.']
    ];
    return pageHead('help') +
      '<div class="grid g-main" style="align-items:start">' +
        '<section class="panel"><div class="panel-head"><div><h2>Частые вопросы</h2></div></div><div class="panel-body faq-app">' +
          faq.map(function (f) { return '<details><summary>' + f[0] + icon('plus', 'icon-sm') + '</summary><p>' + f[1] + '</p></details>'; }).join('') + '</div></section>' +
        '<div style="display:flex;flex-direction:column;gap:16px">' +
          '<section class="panel"><div class="panel-head"><div><h2>Быстрый старт</h2></div></div><div class="panel-body"><div class="journal">' +
            [['Обзор команды', 'Оцените готовность и ранние сигналы на сегодня'], ['Спортсмены', 'Отфильтруйте «Требуют внимания» и откройте карточку'], ['Цифровой двойник', 'Пройдите чек-ин — прогноз на завтра обновится'], ['AI-аналитика', 'Разберите факторы риска и проверьте план нагрузки'], ['Рекомендации', 'Согласуйте или отклоните действия — решение попадёт в журнал']].map(function (s, i) { return '<div class="journal-row"><span class="dot" style="background:var(--violet)"></span><div><b>' + (i + 1) + '. ' + s[0] + '</b><span>' + s[1] + '</span></div></div>'; }).join('') + '</div></div></section>' +
          '<section class="panel"><div class="panel-head"><div><h2>Горячие клавиши</h2></div></div><div class="panel-body">' +
            [['Поиск спортсмена и разделов', [mod, 'K']], ['Поиск (альтернатива)', ['/']], ['Закрыть окно', ['Esc']], ['Помощь', ['?']]].map(function (k) { return '<div class="shortcut"><span>' + k[0] + '</span><span>' + k[1].map(function (x) { return '<span class="kbd">' + x + '</span>'; }).join('') + '</span></div>'; }).join('') + '</div></section>' +
          '<section class="panel"><div class="panel-head"><div><h2>Связаться с командой</h2><p>Пилот, интеграции, вопросы по данным</p></div></div><div class="panel-body" style="display:flex;flex-direction:column;gap:10px">' +
            '<a class="btn btn-primary" href="mailto:' + EMAIL + '?subject=' + encodeURIComponent('Вопрос по кабинету AI Sports') + '">' + icon('mail', 'icon-sm') + EMAIL + '</a>' +
            '<div style="display:flex;flex-wrap:wrap;gap:8px"><a class="btn btn-ghost btn-sm" href="/privacy">Конфиденциальность</a><a class="btn btn-ghost btn-sm" href="/cookies">Cookie</a><a class="btn btn-ghost btn-sm" href="/terms">Соглашение</a></div></div></section>' +
        '</div>' +
      '</div>' + footerStrip();
  };

  /* ======================= Рабочее пространство «Моя команда» ======================= */
  var SPORTS = ['Футбол', 'Водное поло', 'Баскетбол', 'Волейбол', 'Хоккей', 'Бег', 'Плавание', 'Бокс', 'Дзюдо', 'Другой'];
  function wsLabel() { return isPilot() ? (pilot.team.name || 'Моя команда') : 'Демо-команда'; }
  function todayISO() { return model.isoOf(asOfDate()); }

  function workspacePopover(btn) {
    var html = '<h3>Рабочее пространство</h3>' +
      '<button class="menu-item" type="button" role="menuitemradio" aria-checked="' + (!isPilot()) + '" data-ws="demo"><span class="ws-ic">' + icon('spark', 'icon-sm') + '</span><span><b style="font-weight:600">Демо-команда</b><span class="sub">24 вымышленных спортсмена</span></span>' + (!isPilot() ? icon('check', 'icon-sm tick') : '') + '</button>' +
      (pilot ?
        '<button class="menu-item" type="button" role="menuitemradio" aria-checked="' + isPilot() + '" data-ws="pilot"><span class="ws-ic i">' + icon('users', 'icon-sm') + '</span><span><b style="font-weight:600">' + esc(pilot.team.name) + '</b><span class="sub">' + pilot.athletes.length + ' ' + plural(pilot.athletes.length, 'спортсмен', 'спортсмена', 'спортсменов') + ' · данные на этом устройстве</span></span>' + (isPilot() ? icon('check', 'icon-sm tick') : '') + '</button>' :
        '<button class="menu-item" type="button" data-ws-create><span class="ws-ic i">' + icon('plus', 'icon-sm') + '</span><span><b style="font-weight:600">Создать «Мою команду»</b><span class="sub">Реальный состав и данные пилота — без сервера</span></span></button>') +
      (pilot ? '<div class="menu-sep"></div><button class="menu-item" type="button" data-ws-backup>' + icon('download', 'icon-sm') + 'Резервная копия…</button>' : '');
    openPopover(btn, html, {
      alignLeft: true,
      mount: function (p) {
        p.addEventListener('click', function (e) {
          var w = e.target.closest('[data-ws]');
          if (w) {
            var to = w.getAttribute('data-ws');
            if ((to === 'pilot') !== isPilot()) {
              state.ws = to; save();
              logEvent('system', 'Переключение рабочего пространства: ' + (to === 'pilot' ? '«' + pilot.team.name + '»' : 'демо-команда'));
              rebuild(); closePopover(); render();
              toast(to === 'pilot' ? 'Рабочее пространство: ' + pilot.team.name : 'Рабочее пространство: демо-команда');
            } else closePopover();
            return;
          }
          if (e.target.closest('[data-ws-create]')) { closePopover(); setupPilotModal(); }
          if (e.target.closest('[data-ws-backup]')) { closePopover(); backupModal(); }
        });
      }
    });
  }

  function parseRoster(text) {
    var POSMAP = { 'вратарь': 'gk', 'защитник': 'df', 'полузащитник': 'mf', 'нападающий': 'fw' };
    var out = [], errs = [];
    text.split(/\n/).forEach(function (line) {
      line = line.trim();
      if (!line) return;
      var parts = line.split(';').map(function (x) { return x.replace(/\s+/g, ' ').trim(); });
      var name = parts[0];
      if (name.length < 2 || name.length > 60) { errs.push(line); return; }
      var pos = POSMAP[(parts[1] || '').toLowerCase()] || '';
      var num = parts[2] && /^\d{1,2}$/.test(parts[2]) ? Number(parts[2]) : null;
      out.push({ name: name, pos: pos, num: num });
    });
    return { list: out.slice(0, 60), errs: errs };
  }
  function setupPilotModal() {
    openModal('<div class="modal-head"><span class="mi" style="background:var(--ice-soft);color:var(--ice)">' + icon('users') + '</span><div><h2 id="modal-title">Моя команда</h2><p>Рабочее пространство пилота. Все данные остаются на этом устройстве.</p></div></div>' +
      '<form class="modal-body" id="pw-form" novalidate>' +
      '<div class="grid g-2" style="gap:12px"><div class="field"><label for="pw-name">Название команды <span class="req" aria-hidden="true">*</span></label><input class="input" id="pw-name" maxlength="60" autocomplete="off" placeholder="Например, Сборная — основной состав" required aria-describedby="pw-err"><span class="err" id="pw-err"></span></div>' +
      '<div class="field"><label for="pw-sport">Вид спорта</label><select class="select" id="pw-sport">' + SPORTS.map(function (x) { return '<option>' + x + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field"><label for="pw-roster">Состав — один спортсмен в строке <span class="req" aria-hidden="true">*</span></label>' +
      '<textarea class="textarea" id="pw-roster" rows="6" placeholder="Спортсмен-01; нападающий; 7&#10;Спортсмен-02; вратарь; 1&#10;Спортсмен-03" aria-describedby="pw-roster-err"></textarea><span class="err" id="pw-roster-err"></span>' +
      '<span class="muted" style="font-size:12.5px">Формат: «код или имя; позиция; номер» — позиция и номер необязательны. Рекомендуем коды вместо фамилий: так в системе не будет лишних персональных данных.</span></div>' +
      '<div class="note">' + icon('shield', 'icon-sm') + '<span>Данные команды хранятся только в этом браузере и не отправляются никому, включая нас. Регулярно делайте резервную копию (Настройки → Моя команда). Платформа не является медицинским изделием.</span></div>' +
      '<details class="restore-box"><summary>' + icon('upload', 'icon-sm') + 'У меня есть резервная копия — восстановить</summary><div class="restore-in">' + restoreHtml() + '</div></details>' +
      '<div class="modal-foot" style="margin-top:4px"><button class="btn btn-ghost" type="button" data-close>Отмена</button><button class="btn btn-primary" type="submit">' + icon('check', 'icon-sm') + 'Создать рабочее пространство</button></div></form>', {
      mount: function (m) {
        mountRestore(m);
        m.querySelector('#pw-form').addEventListener('submit', function (e) {
          e.preventDefault();
          var nameEl = m.querySelector('#pw-name');
          var name = nameEl.value.replace(/\s+/g, ' ').trim();
          var ok = true;
          if (name.length < 2) { nameEl.setAttribute('aria-invalid', 'true'); m.querySelector('#pw-err').textContent = 'Укажите название'; ok = false; } else { nameEl.removeAttribute('aria-invalid'); m.querySelector('#pw-err').textContent = ''; }
          var r = parseRoster(m.querySelector('#pw-roster').value);
          if (!r.list.length) { m.querySelector('#pw-roster-err').textContent = 'Добавьте хотя бы одного спортсмена'; ok = false; } else { m.querySelector('#pw-roster-err').textContent = r.errs.length ? 'Пропущены строки: ' + r.errs.slice(0, 3).join(' · ') : ''; }
          if (!ok) return;
          var used = {};
          pilot = { v: 1, team: { name: name, sport: m.querySelector('#pw-sport').value, created: Date.now() }, athletes: r.list.map(function (x, i) {
            var num = x.num;
            if (num == null || used[num]) { num = 1; while (used[num]) num++; }
            used[num] = 1;
            return { id: 'p' + (i + 1).toString(36) + Date.now().toString(36).slice(-4), name: x.name, pos: x.pos, num: num };
          }), records: {} };
          savePilot();
          state.ws = 'pilot'; save();
          logEvent('system', 'Создано рабочее пространство «' + name + '» · ' + pilot.athletes.length + ' спортсменов');
          rebuild(); closeModal(); go('overview'); render();
          toast('Рабочее пространство создано. Начните с чек-ина или импорта истории.');
        });
      }
    });
  }

  /* ---------- Групповой ввод нагрузки за день ---------- */
  function teamLoadModal() {
    if (!isPilot()) return;
    var iso = todayISO();
    openModal('<div class="modal-head"><span class="mi">' + icon('load') + '</span><div><h2 id="modal-title">Нагрузка за ' + fmtFull.format(asOfDate()) + '</h2><p>sRPE = тяжесть (0–10) × минуты. Пустая строка — без изменений, 0 и 0 — день отдыха.</p></div></div>' +
      '<form class="modal-body" id="tl-form"><div class="tl-grid" role="group" aria-label="Нагрузка по спортсменам">' +
      '<div class="tl-head"><span>Спортсмен</span><span>RPE 0–10</span><span>Минуты</span><span>sRPE</span></div>' +
      model.athletes.map(function (a) {
        var r = (pilot.records[a.id] || {})[iso] || {};
        return '<div class="tl-row"><label for="tl-r-' + a.id + '">' + esc(a.short) + '</label>' +
          '<input class="input" id="tl-r-' + a.id + '" data-tl-rpe="' + a.id + '" type="text" inputmode="numeric" maxlength="2" autocomplete="off" value="' + (r.rpe != null ? r.rpe : '') + '" aria-label="RPE: ' + esc(a.short) + '">' +
          '<input class="input" data-tl-min="' + a.id + '" type="text" inputmode="numeric" maxlength="3" autocomplete="off" value="' + (r.srpe != null && r.rpe ? Math.round(r.srpe / r.rpe) : (r.srpe === 0 ? 0 : '')) + '" aria-label="Минуты: ' + esc(a.short) + '">' +
          '<output data-tl-out="' + a.id + '" class="num muted">' + (r.srpe != null ? num(r.srpe) : '—') + '</output></div>';
      }).join('') + '</div>' +
      '<span class="err" id="tl-err" role="alert"></span>' +
      '<div class="modal-foot" style="margin-top:4px"><button class="btn btn-ghost" type="button" data-close>Отмена</button><button class="btn btn-primary" type="submit">' + icon('check', 'icon-sm') + 'Сохранить нагрузку</button></div></form>', {
      cls: 'wide',
      mount: function (m) {
        function upd(id) {
          var rp = m.querySelector('[data-tl-rpe="' + id + '"]').value.trim(), mn = m.querySelector('[data-tl-min="' + id + '"]').value.trim();
          var out = m.querySelector('[data-tl-out="' + id + '"]');
          out.textContent = (rp !== '' && mn !== '') ? num(Number(rp) * Number(mn)) : '—';
        }
        m.querySelectorAll('[data-tl-rpe],[data-tl-min]').forEach(function (el) {
          el.addEventListener('input', function () { upd(el.getAttribute('data-tl-rpe') || el.getAttribute('data-tl-min')); });
        });
        m.querySelector('#tl-form').addEventListener('submit', function (e) {
          e.preventDefault();
          var saved = 0, err = '';
          model.athletes.forEach(function (a) {
            var rp = m.querySelector('[data-tl-rpe="' + a.id + '"]').value.trim(), mn = m.querySelector('[data-tl-min="' + a.id + '"]').value.trim();
            if (rp === '' && mn === '') return;
            var R = Number(rp.replace(',', '.')), M = Number(mn.replace(',', '.'));
            if (!(R >= 0 && R <= 10) || !(M >= 0 && M <= 600) || rp === '' || mn === '') { err = 'Проверьте строку «' + a.short + '»: RPE 0–10 и минуты 0–600'; return; }
            var rec = pilotRec(a.id, iso);
            rec.srpe = Math.round(R * M);
            rec.rpe = M === 0 ? 0 : R;
            rec.sessions = M > 0 ? Math.max(1, rec.sessions || 0) : 0;
            saved++;
          });
          if (err) { m.querySelector('#tl-err').textContent = err; return; }
          if (!saved) { m.querySelector('#tl-err').textContent = 'Заполните хотя бы одну строку'; return; }
          savePilot();
          logEvent('data', 'Внесена нагрузка за ' + iso + ': ' + saved + ' ' + plural(saved, 'спортсмен', 'спортсмена', 'спортсменов'));
          rebuild(); closeModal(); render();
          toast('Нагрузка сохранена: ' + saved + ' ' + plural(saved, 'запись', 'записи', 'записей'));
        });
      }
    });
  }

  /* ---------- Импорт истории CSV в «Мою команду» ---------- */
  function importHistoryModal() {
    if (!isPilot()) return;
    openModal('<div class="modal-head"><span class="mi">' + icon('upload') + '</span><div><h2 id="modal-title">Импорт истории</h2><p>CSV-журнал нагрузки и чек-инов — в профили спортсменов. Обрабатывается только в браузере.</p></div></div>' +
      '<div class="modal-body">' +
      '<div class="note">' + icon('info', 'icon-sm') + '<span>Формат тот же, что в разделе «Модели ИИ» (колонки athlete, date, srpe …). Имена в колонке athlete должны совпадать с именами в составе — несовпавшие можно создать автоматически. Существующие записи за те же даты будут дополнены.</span></div>' +
      '<label class="check"><input type="checkbox" id="ih-create" checked> Создавать спортсменов, которых нет в составе</label>' +
      '<div class="import-row"><label class="btn btn-primary" for="ih-file">' + icon('upload', 'icon-sm') + 'Выбрать CSV-файл<input type="file" id="ih-file" accept=".csv,text/csv" class="sr-only"></label><button class="btn btn-ghost" type="button" data-action="csv-template">' + icon('download', 'icon-sm') + 'Шаблон</button></div>' +
      '<div id="ih-out" aria-live="polite"></div></div>', {
      mount: function (m) {
        m.querySelector('#ih-file').addEventListener('change', function () {
          var f = this.files && this.files[0];
          if (!f) return;
          if (f.size > 5 * 1024 * 1024) { m.querySelector('#ih-out').innerHTML = '<div class="note warn">' + icon('alert', 'icon-sm') + '<span>Файл больше 5 МБ.</span></div>'; return; }
          var rd = new FileReader();
          rd.onload = function () {
            try {
              var res = importHistory(String(rd.result || ''), m.querySelector('#ih-create').checked);
              m.querySelector('#ih-out').innerHTML = '<div class="note ok-note">' + icon('check', 'icon-sm') + '<span><b>' + esc(f.name) + '</b>: записей добавлено или обновлено — ' + res.saved + ', спортсменов создано — ' + res.created + (res.unmatched.length ? '. Пропущены (нет в составе): ' + esc(res.unmatched.slice(0, 4).join(', ')) + (res.unmatched.length > 4 ? '…' : '') : '') + (res.skipped ? '. Строк с ошибками: ' + res.skipped : '') + '</span></div>' +
                '<button class="btn btn-primary btn-block" type="button" data-close style="margin-top:12px">Готово — открыть команду</button>';
              logEvent('data', 'Импорт истории CSV: ' + f.name + ' · ' + res.saved + ' записей');
              rebuild(); render();
            } catch (err) {
              m.querySelector('#ih-out').innerHTML = '<div class="note warn">' + icon('alert', 'icon-sm') + '<span><b>Не удалось прочитать файл.</b> ' + esc(err.message || String(err)) + '</span></div>';
            }
          };
          rd.readAsText(f, 'utf-8');
          this.value = '';
        });
      }
    });
  }
  function importHistory(text, createMissing) {
    var parsed = parseCSV(text);
    if (parsed.rows.length > 200000) throw new Error('Слишком много строк (> 200 000)');
    var byName = {};
    pilot.athletes.forEach(function (a) { byName[a.name.toLowerCase()] = a; });
    var saved = 0, created = 0, skipped = 0, unmatched = {};
    parsed.rows.forEach(function (r) {
      var nm = String(r.athlete || '').replace(/\s+/g, ' ').trim();
      var dt = toDate(r.date);
      if (!nm || dt !== dt) { skipped++; return; }
      var a = byName[nm.toLowerCase()];
      if (!a) {
        if (!createMissing || pilot.athletes.length >= 60) { unmatched[nm] = 1; return; }
        a = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: nm, pos: '', num: null };
        var used = {}; pilot.athletes.forEach(function (x) { used[x.num] = 1; });
        var n2 = 1; while (used[n2]) n2++;
        a.num = n2;
        pilot.athletes.push(a); byName[nm.toLowerCase()] = a; created++;
      }
      var d = new Date(dt);
      var iso = d.toISOString().slice(0, 10);
      var rec = pilotRec(a.id, iso), any = false;
      function setN(key, v, lo, hi) { var x = toNum(v); if (x === x && x >= lo && x <= hi) { rec[key] = x; any = true; } }
      setN('srpe', r.srpe, 0, 3000); setN('hi', r.hi_load, 0, 3000);
      setN('sessions', r.sessions, 0, 6); setN('strength', r.strength, 0, 4);
      setN('rpe', r.rpe, 0, 10); setN('readiness', r.readiness, 0, 10);
      setN('fatigue', r.fatigue, 1, 5); setN('soreness', r.soreness, 1, 5);
      setN('sleep_quality', r.sleep_quality, 1, 5); setN('stress', r.stress, 1, 5);
      setN('mood', r.mood, 1, 5); setN('sleep_hours', r.sleep_hours, 0, 16);
      if (any) { if (!rec.src) rec.src = 'import'; saved++; } else skipped++;
    });
    savePilot();
    return { saved: saved, created: created, skipped: skipped, unmatched: Object.keys(unmatched) };
  }

  /* ---------- Резервные копии (с шифрованием по желанию) ---------- */
  function b64(buf) { var b = ''; new Uint8Array(buf).forEach(function (x) { b += String.fromCharCode(x); }); return btoa(b); }
  function unb64(str) { var bin = atob(str), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  function deriveKey(pass, salt, usages) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']).then(function (km) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: 310000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, usages);
    });
  }
  function saveFile(text, name) {
    var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob), el = document.createElement('a');
    el.href = url; el.download = name; document.body.appendChild(el); el.click(); el.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function restoreHtml() {
    return '<div class="field"><label for="bk-restore-pass">Восстановление из файла</label><input class="input" id="bk-restore-pass" type="password" autocomplete="off" placeholder="Пароль копии, если она зашифрована" style="margin-bottom:8px">' +
      '<label class="btn btn-ghost btn-block" for="bk-file">' + icon('upload', 'icon-sm') + 'Выбрать файл копии<input type="file" id="bk-file" accept=".json,application/json" class="sr-only"></label></div>' +
      '<div id="bk-out" aria-live="polite"></div>';
  }
  /* Проверка файла копии: только известные поля, допустимые значения, без лишнего */
  var REC_NUM = { srpe: [0, 5000], hi: [0, 5000], sessions: [0, 6], strength: [0, 6], rpe: [0, 10], readiness: [0, 10], fatigue: [1, 5], soreness: [1, 5], sleep_quality: [1, 5], stress: [1, 5], mood: [1, 5], sleep_hours: [0, 16], ci_ts: [0, 1e14], edited: [0, 1] };
  function sanitizeBackup(p) {
    if (!p || typeof p !== 'object' || p.app !== 'ai-sports-pilot' || !p.team || typeof p.team !== 'object' || !Array.isArray(p.athletes) || !p.records || typeof p.records !== 'object') return null;
    var str = function (v, n) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').slice(0, n) : ''; };
    var team = { name: str(p.team.name, 60) || 'Моя команда', sport: str(p.team.sport, 40), created: typeof p.team.created === 'number' ? p.team.created : Date.now() };
    if (/^[A-Za-z0-9_-]{4,40}$/.test(p.team.id || '') && /^[A-Za-z0-9_-]{43}$/.test(p.team.key || '')) { team.id = p.team.id; team.key = p.team.key; team.keyAt = typeof p.team.keyAt === 'number' ? p.team.keyAt : null; }
    var seen = {}, athletes = [];
    p.athletes.slice(0, 60).forEach(function (a) {
      if (!a || !/^[A-Za-z0-9_-]{1,40}$/.test(a.id || '') || seen[a.id]) return;
      seen[a.id] = 1;
      athletes.push({ id: a.id, name: str(a.name, 60) || a.id, pos: str(a.pos, 40), num: typeof a.num === 'number' && isFinite(a.num) && a.num >= 0 && a.num < 1000 ? Math.round(a.num) : null });
    });
    if (!athletes.length) return null;
    var records = {};
    athletes.forEach(function (a) {
      var src = p.records[a.id]; if (!src || typeof src !== 'object') return;
      var out = {};
      Object.keys(src).slice(0, 4000).forEach(function (d) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !src[d] || typeof src[d] !== 'object') return;
        var r = src[d], o = {};
        Object.keys(REC_NUM).forEach(function (k) { var v = r[k]; if (typeof v === 'number' && isFinite(v) && v >= REC_NUM[k][0] && v <= REC_NUM[k][1]) o[k] = v; });
        if (typeof r.note === 'string' && r.note) o.note = str(r.note, 300);
        if (r.src === 'athlete' || r.src === 'import') o.src = r.src;
        if (Object.keys(o).length) out[d] = o;
      });
      records[a.id] = out;
    });
    var staff = {}, consents = {};
    if (p.staff && typeof p.staff === 'object') Object.keys(ROLES).forEach(function (k) { var v = str(p.staff[k], 60).trim(); if (v) staff[k] = v; });
    if (p.consents && typeof p.consents === 'object') athletes.forEach(function (a) {
      var c = p.consents[a.id]; if (!c || typeof c !== 'object') return;
      consents[a.id] = {}; PILOT_CONSENTS.forEach(function (k) { if (typeof c[k[0]] === 'boolean') consents[a.id][k[0]] = c[k[0]]; });
    });
    var audit = Array.isArray(p.audit) ? p.audit.filter(function (e) { return e && typeof e.ts === 'number' && isFinite(e.ts) && typeof e.text === 'string'; }).slice(0, 1000).map(function (e) { return { ts: e.ts, kind: str(e.kind, 20) || 'system', text: str(e.text, 400), by: str(e.by, 60), role: str(e.role, 60) }; }) : [];
    return { v: 1, team: team, athletes: athletes, records: records, staff: staff, consents: consents, audit: audit, lastBackup: Date.now() };
  }
  function mountRestore(m) {
    m.querySelector('#bk-file').addEventListener('change', function () {
      var f = this.files && this.files[0], out = m.querySelector('#bk-out');
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var obj;
        try { obj = JSON.parse(String(rd.result || '')); } catch (e) { out.innerHTML = '<div class="note warn">' + icon('alert', 'icon-sm') + '<span>Это не файл копии AI Sports.</span></div>'; return; }
        function apply(raw) {
          var payload = sanitizeBackup(raw);
          if (!payload) {
            out.innerHTML = '<div class="note warn">' + icon('alert', 'icon-sm') + '<span>Файл не похож на копию «Моей команды» или повреждён.</span></div>';
            return;
          }
          pilot = payload;
          savePilot();
          state.ws = 'pilot'; save();
          logEvent('system', 'Восстановление из резервной копии: «' + payload.team.name + '» · ' + payload.athletes.length + ' спортсм., ' + num(pilotRecordCount()) + ' зап.');
          rebuild(); closeModal(); render();
          toast('Данные восстановлены: ' + payload.team.name);
        }
        if (obj.enc === 'AES-GCM') {
          var pass = m.querySelector('#bk-restore-pass').value;
          if (!pass) { out.innerHTML = '<div class="note warn">' + icon('alert', 'icon-sm') + '<span>Копия зашифрована — введите пароль выше и выберите файл ещё раз.</span></div>'; return; }
          deriveKey(pass, unb64(obj.salt), ['decrypt']).then(function (key) {
            return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(obj.iv) }, key, unb64(obj.data));
          }).then(function (pt) { apply(JSON.parse(new TextDecoder().decode(pt))); })
            .catch(function () { out.innerHTML = '<div class="note warn">' + icon('alert', 'icon-sm') + '<span>Не удалось расшифровать: проверьте пароль.</span></div>'; });
        } else apply(obj);
      };
      rd.readAsText(f, 'utf-8');
      this.value = '';
    });
  }
  function backupModal() {
    if (!pilot) { setupPilotModal(); return; }
    openModal('<div class="modal-head"><span class="mi" style="background:var(--ice-soft);color:var(--ice)">' + icon('shield') + '</span><div><h2 id="modal-title">Резервная копия</h2><p>«' + esc(pilot.team.name) + '» · ' + pilot.athletes.length + ' ' + plural(pilot.athletes.length, 'спортсмен', 'спортсмена', 'спортсменов') + ' · ' + num(pilotRecordCount()) + ' ' + plural(pilotRecordCount(), 'запись', 'записи', 'записей') + '</p></div></div>' +
      '<div class="modal-body">' +
      '<div class="field"><label for="bk-pass">Пароль шифрования (рекомендуем)</label><input class="input" id="bk-pass" type="password" autocomplete="new-password" placeholder="Пусто — копия без шифрования"><span class="muted" style="font-size:12.5px">AES-256-GCM, ключ из пароля (PBKDF2, 310 000 итераций). Пароль не восстановить — храните его отдельно.</span></div>' +
      '<button class="btn btn-primary btn-block" type="button" id="bk-save">' + icon('download', 'icon-sm') + 'Скачать копию</button>' +
      '<div class="menu-sep" style="margin:4px 0"></div>' +
      restoreHtml() +
      '<div class="note warn">' + icon('alert', 'icon-sm') + '<span>Восстановление заменит текущие данные «Моей команды». Данные демо-команды не затрагиваются.</span></div></div>', {
      mount: function (m) {
        m.querySelector('#bk-save').addEventListener('click', function () {
          var pass = m.querySelector('#bk-pass').value;
          var payload = { app: 'ai-sports-pilot', v: 1, exportedAt: new Date().toISOString(), team: pilot.team, athletes: pilot.athletes, records: pilot.records, staff: pilot.staff || {}, consents: pilot.consents || {}, audit: pilot.audit || [] };
          var fname = 'ai-sports_' + (pilot.team.name || 'team').toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-').slice(0, 24) + '_' + new Date().toISOString().slice(0, 10);
          if (!pass) {
            saveFile(JSON.stringify(payload), fname + '.json');
            pilot.lastBackup = Date.now(); savePilot();
            logEvent('system', 'Создана резервная копия (без шифрования)');
            toast('Копия скачана — без шифрования');
            return;
          }
          var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
          deriveKey(pass, salt, ['encrypt']).then(function (key) {
            return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(JSON.stringify(payload)));
          }).then(function (ct) {
            saveFile(JSON.stringify({ app: 'ai-sports-pilot', v: 1, enc: 'AES-GCM', kdf: 'PBKDF2-SHA256', it: 310000, salt: b64(salt), iv: b64(iv), data: b64(ct) }), fname + '.enc.json');
            pilot.lastBackup = Date.now(); savePilot();
            logEvent('system', 'Создана зашифрованная резервная копия');
            toast('Зашифрованная копия скачана');
          }).catch(function () { m.querySelector('#bk-out').innerHTML = '<div class="note warn">' + icon('alert', 'icon-sm') + '<span>Шифрование недоступно в этом браузере. Попробуйте без пароля.</span></div>'; });
        });
        mountRestore(m);
      }
    });
  }

  /* ======================= Журнал записей спортсмена (режим пилота) ======================= */
  var J_FIELDS = [
    // ключ хранения, подпись, мин, макс, перевёрнутая шкала (в хранилище 5 = лучше), подсказка
    ['readiness', 'Готовность', 0, 10, false, '0–10'],
    ['fatigue', 'Усталость', 1, 5, true, '1 нет — 5 сильная'],
    ['soreness', 'Мышечная боль', 1, 5, true, '1 нет — 5 сильная'],
    ['sleep_quality', 'Качество сна', 1, 5, false, '1 плохое — 5 отличное'],
    ['stress', 'Стресс', 1, 5, true, '1 низкий — 5 высокий'],
    ['mood', 'Настроение', 1, 5, false, '1 плохое — 5 отличное'],
    ['sleep_hours', 'Сон, ч', 0, 16, false, '0–16'],
    ['srpe', 'Нагрузка sRPE, у.е.', 0, 3000, false, 'RPE × минуты'],
    ['rpe', 'RPE тренировки', 0, 10, false, '0–10'],
    ['hi', 'Интенсивная часть, у.е.', 0, 3000, false, 'по желанию']
  ];
  var SRC_LABEL = { athlete: 'спортсмен', import: 'импорт' };
  function jShow(f, v) { return v == null ? null : (f[4] ? 6 - v : v); }
  function journalHtml(a) {
    var rec = pilot.records[a.id] || {};
    var dates = Object.keys(rec).sort().reverse();
    var shown = dates.slice(0, 60);
    return '<section class="panel"><div class="panel-head"><div><h2>Журнал записей <span class="badge plain mute">' + dates.length + '</span></h2><p>Все данные спортсмена по дням: проверка, исправление и удаление ошибочных записей</p></div>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-jedit="' + esc(model.isoOf(asOfDate())) + '" data-jid="' + a.id + '">' + icon('plus', 'icon-sm') + 'Добавить день</button></div>' +
      (shown.length ? '<div class="table-wrap"><table class="table journal-table"><caption class="sr-only">Журнал записей: ' + esc(a.short) + '</caption><thead><tr><th scope="col">Дата</th><th scope="col">Готовность</th><th scope="col">Усталость</th><th scope="col">Боль</th><th scope="col">Сон</th><th scope="col">sRPE</th><th scope="col">Источник</th><th scope="col"><span class="sr-only">Действия</span></th></tr></thead><tbody>' +
        shown.map(function (d) {
          var r = rec[d] || {};
          function cell(v, suf) { return v == null ? '<td class="num muted">—</td>' : '<td class="num">' + num(v, v % 1 ? 1 : 0) + (suf || '') + '</td>'; }
          return '<tr tabindex="-1" style="cursor:default"><td class="num"><b>' + fmtFull.format(new Date(d + 'T00:00:00')) + '</b></td>' +
            cell(r.readiness, '/10') + cell(jShow(J_FIELDS[1], r.fatigue), '/5') + cell(jShow(J_FIELDS[2], r.soreness), '/5') + cell(r.sleep_hours, ' ч') + cell(r.srpe) +
            '<td><span class="badge plain mute">' + esc((SRC_LABEL[r.src] || 'кабинет') + (r.edited ? ' · правка' : '')) + '</span></td>' +
            '<td class="j-actions"><button class="icon-btn" type="button" data-jedit="' + d + '" data-jid="' + a.id + '" aria-label="Изменить запись за ' + d + '">' + icon('sliders') + '</button>' +
            '<button class="icon-btn" type="button" data-jdel="' + d + '" data-jid="' + a.id + '" aria-label="Удалить запись за ' + d + '">' + icon('trash') + '</button></td></tr>';
        }).join('') + '</tbody></table></div>' +
        (dates.length > shown.length ? '<div class="panel-foot"><span>Показаны последние 60 дней из ' + dates.length + '</span></div>' : '')
      : '<div class="panel-body"><div class="empty">' + icon('file') + 'Записей пока нет. Отправьте спортсмену ссылку на чек-ин или внесите данные сами.</div></div>') +
      '</section>';
  }
  function journalEditModal(aid, iso) {
    var a = byId(aid); if (!a || !isPilot()) return;
    var r = (pilot.records[aid] || {})[iso] || {};
    openModal('<div class="modal-head"><span class="mi">' + icon('sliders') + '</span><div><h2 id="modal-title">Запись за день</h2><p>' + esc(a.short) + '</p></div></div>' +
      '<form class="modal-body" id="je-form" novalidate>' +
      '<div class="field"><label for="je-date">Дата</label><input class="input" id="je-date" type="date" value="' + esc(iso) + '" max="' + esc(model.isoOf(new Date())) + '"></div>' +
      '<div class="je-grid">' + J_FIELDS.map(function (f) {
        var v = jShow(f, r[f[0]]);
        return '<div class="field"><label for="je-' + f[0] + '">' + f[1] + '</label><input class="input" id="je-' + f[0] + '" type="text" inputmode="decimal" autocomplete="off" value="' + (v == null ? '' : String(v).replace('.', ',')) + '" placeholder="' + f[5] + '"></div>';
      }).join('') + '</div>' +
      '<div class="field"><label for="je-note">Комментарий</label><textarea class="textarea" id="je-note" maxlength="300" rows="2">' + esc(r.note || '') + '</textarea></div>' +
      '<span class="err" id="je-err" role="alert"></span>' +
      '<div class="note">' + icon('info', 'icon-sm') + '<span>Пустое поле — значение удаляется. Шкалы показаны так, как их видит спортсмен (для усталости, боли и стресса 5 — сильнее всего).</span></div>' +
      '<div class="modal-foot" style="margin-top:4px"><button class="btn btn-ghost" type="button" data-close>Отмена</button><button class="btn btn-primary" type="submit">' + icon('check', 'icon-sm') + 'Сохранить запись</button></div></form>', {
      cls: 'wide',
      mount: function (m) {
        m.querySelector('#je-form').addEventListener('submit', function (e) {
          e.preventDefault();
          var errEl = m.querySelector('#je-err'), out = {}, bad = null;
          var newIso = m.querySelector('#je-date').value;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(newIso)) { errEl.textContent = 'Укажите дату'; return; }
          J_FIELDS.forEach(function (f) {
            if (bad) return;
            var el = m.querySelector('#je-' + f[0]), raw = String(el.value).trim().replace(',', '.');
            if (raw === '') { el.removeAttribute('aria-invalid'); return; }
            var x = Number(raw);
            if (!(x >= f[2] && x <= f[3])) { el.setAttribute('aria-invalid', 'true'); bad = f[1] + ': от ' + f[2] + ' до ' + f[3]; el.focus(); return; }
            el.removeAttribute('aria-invalid');
            out[f[0]] = f[4] ? 6 - x : x;
          });
          if (bad) { errEl.textContent = 'Проверьте поле «' + bad + '»'; return; }
          var note = m.querySelector('#je-note').value.trim().slice(0, 300);
          if (note) out.note = note;
          if (out.srpe != null) out.sessions = out.srpe > 0 ? Math.max(1, r.sessions || 1) : 0;
          Object.keys(r).forEach(function (k) {
            if (k === 'note' || k === 'sessions' || J_FIELDS.some(function (f) { return f[0] === k; })) return;
            out[k] = r[k];
          });
          if (out.srpe == null && r.sessions != null && r.srpe == null) out.sessions = r.sessions;
          out.edited = 1;
          pilot.records[aid] = pilot.records[aid] || {};
          if (newIso !== iso) delete pilot.records[aid][iso];
          if (Object.keys(out).filter(function (k) { return ['src', 'edited', 'ci_ts'].indexOf(k) < 0; }).length) pilot.records[aid][newIso] = out;
          else delete pilot.records[aid][newIso];
          savePilot();
          logEvent('data', 'Изменена запись журнала: ' + a.short + ' · ' + newIso + (newIso !== iso ? ' (перенесена с ' + iso + ')' : ''));
          rebuild(); closeModal(); render(); toast('Запись сохранена');
        });
      }
    });
  }
  function journalDeleteModal(aid, iso) {
    var a = byId(aid); if (!a || !isPilot()) return;
    openModal('<div class="modal-head"><span class="mi" style="background:var(--red-soft);color:var(--red)">' + icon('trash') + '</span><div><h2 id="modal-title">Удалить запись?</h2><p>' + esc(a.short) + ' · ' + fmtFull.format(new Date(iso + 'T00:00:00')) + '. Чек-ин и нагрузка за этот день будут удалены, прогнозы пересчитаются.</p></div></div>' +
      '<div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Отмена</button><button class="btn btn-danger" type="button" id="jd-go">Удалить</button></div>', {
      mount: function (m) {
        m.querySelector('#jd-go').addEventListener('click', function () {
          if (pilot.records[aid]) delete pilot.records[aid][iso];
          savePilot();
          logEvent('data', 'Удалена запись журнала: ' + a.short + ' · ' + iso);
          rebuild(); closeModal(); render(); toast('Запись удалена');
        });
      }
    });
  }

  /* ======================= Чек-ин спортсменов по ссылке ======================= */
  var CX = window.ASPCrypto;
  function cryptoReady() { return !!(CX && window.crypto && crypto.subtle); }
  function ensureTeamCrypto() {
    if (!pilot) return false;
    if (!pilot.team.id || !pilot.team.key) {
      pilot.team.id = CX.randomId(6);
      pilot.team.key = CX.randomKey();
      pilot.team.keyAt = Date.now();
      savePilot();
    }
    return true;
  }
  function appBaseHtml() { return /\.html$/.test(location.pathname); }
  function checkinBase() { return location.origin + (appBaseHtml() ? '/checkin.html' : '/checkin'); }
  function inviteUrl(a) {
    ensureTeamCrypto();
    return CX.deriveAthleteKey(pilot.team.key, pilot.team.id, a.id).then(function (k) {
      return checkinBase() + '#' + CX.inviteHash(pilot.team.id, a.id, k, a.short);
    });
  }
  function qrSvg(text) {
    if (typeof window.qrcode !== 'function') return '';
    var qr = window.qrcode(0, 'M');
    qr.addData(text); qr.make();
    var n = qr.getModuleCount(), q = 2, size = n + q * 2, d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + (c + q) + ' ' + (r + q) + 'h1v1h-1z';
    return '<svg class="qr" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="QR-код ссылки на чек-ин" shape-rendering="crispEdges"><rect width="' + size + '" height="' + size + '" fill="#fff"/><path d="' + d + '" fill="#1d1b17"/></svg>';
  }
  function copyText(text, okMsg) {
    var p = navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject();
    return p.then(function () { toast(okMsg || 'Скопировано'); }).catch(function () { window.prompt('Скопируйте:', text); });
  }
  function athleteLinkModal(id) {
    if (!isPilot() || !cryptoReady()) return;
    var a = byId(id); if (!a) return;
    inviteUrl(a).then(function (url) {
      logEvent('access', 'Выдана ссылка на чек-ин: ' + a.short);
      openModal('<div class="modal-head"><span class="mi" style="background:var(--ice-soft);color:var(--ice)">' + icon('link') + '</span><div><h2 id="modal-title">Чек-ин с телефона</h2><p>Персональная ссылка для «' + esc(a.short) + '»</p></div></div>' +
        '<div class="modal-body">' +
          '<div class="invite-grid"><div class="qr-box">' + qrSvg(url) + '<span>Наведите камеру телефона</span></div>' +
          '<div class="invite-steps"><div class="journal-row"><span class="dot" style="background:var(--violet)"></span><div><b>1. Отправьте ссылку лично спортсмену</b><span>В личные сообщения, не в общий чат: по ссылке можно отвечать от имени этого спортсмена.</span></div></div>' +
          '<div class="journal-row"><span class="dot" style="background:var(--violet)"></span><div><b>2. Спортсмен отвечает за минуту</b><span>Ссылка запоминается на его телефоне — дальше чек-ин открывается с главного экрана.</span></div></div>' +
          '<div class="journal-row"><span class="dot" style="background:var(--mint)"></span><div><b>3. Ответ приходит вам ссылкой</b><span>Откройте её на этом устройстве — запись появится в журнале. Несколько ответов можно вставить разом через «Входящие».</span></div></div></div></div>' +
          '<div class="field"><label for="inv-url">Ссылка</label><input class="input mono" id="inv-url" readonly value="' + esc(url) + '"></div>' +
          '<div class="modal-foot" style="margin-top:0;justify-content:flex-start"><button class="btn btn-primary" type="button" id="inv-copy">' + icon('link', 'icon-sm') + 'Скопировать ссылку</button>' +
          (navigator.share ? '<button class="btn btn-ghost" type="button" id="inv-share">' + icon('external', 'icon-sm') + 'Поделиться</button>' : '') +
          '<a class="btn btn-ghost" target="_blank" rel="noopener noreferrer" href="https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent('Ваш утренний чек-ин AI Sports') + '">Telegram</a></div>' +
          '<div class="note">' + icon('shield', 'icon-sm') + '<span>Ключ находится в части ссылки после «#» и не передаётся ни на один сервер. Если ссылка попала не к тому человеку — смените ключ команды в настройках: все старые ссылки перестанут работать.</span></div>' +
        '</div>', {
        cls: 'wide',
        mount: function (m) {
          m.querySelector('#inv-copy').addEventListener('click', function () { copyText(url, 'Ссылка скопирована — отправьте её лично спортсмену'); });
          var sh = m.querySelector('#inv-share');
          if (sh) sh.addEventListener('click', function () { navigator.share({ title: 'Чек-ин AI Sports', url: url }).catch(function () { /* отменено */ }); });
          m.querySelector('#inv-url').addEventListener('focus', function () { this.select(); });
        }
      });
    }).catch(function () { toast('Не удалось создать ссылку: шифрование недоступно в этом браузере'); });
  }
  function teamLinksModal() {
    if (!isPilot() || !cryptoReady()) return;
    Promise.all(model.athletes.map(function (a) { return inviteUrl(a).then(function (u) { return { a: a, url: u }; }); })).then(function (rows) {
      openModal('<div class="modal-head"><span class="mi" style="background:var(--ice-soft);color:var(--ice)">' + icon('link') + '</span><div><h2 id="modal-title">Ссылки на чек-ин</h2><p>' + rows.length + ' ' + plural(rows.length, 'спортсмен', 'спортсмена', 'спортсменов') + ' · каждая ссылка — только для своего спортсмена</p></div></div>' +
        '<div class="modal-body"><div class="links-list">' + rows.map(function (r, i) {
          return '<div class="link-row"><span class="person">' + avatar(r.a) + '<span><b>' + esc(r.a.short) + '</b><span>' + (r.a.posName ? esc(r.a.posName) : 'Спортсмен') + (r.a.num ? ' · № ' + esc(r.a.num) : '') + '</span></span></span>' +
            '<span class="link-actions"><button class="btn btn-ghost btn-sm" type="button" data-copy-link="' + i + '">' + icon('link', 'icon-sm') + 'Копировать</button><button class="btn btn-quiet btn-sm" type="button" data-qr-link="' + esc(r.a.id) + '">QR</button></span></div>';
        }).join('') + '</div>' +
        '<div class="note">' + icon('info', 'icon-sm') + '<span>Отправляйте каждую ссылку лично. Для массовой рассылки скачайте список и разошлите через свой рабочий канал.</span></div></div>' +
        '<div class="modal-foot"><button class="btn btn-ghost" type="button" id="links-csv">' + icon('download', 'icon-sm') + 'Скачать список (CSV)</button><button class="btn btn-primary" type="button" data-close>Готово</button></div>', {
        cls: 'wide',
        mount: function (m) {
          m.addEventListener('click', function (e) {
            var c = e.target.closest('[data-copy-link]');
            if (c) { var r = rows[+c.getAttribute('data-copy-link')]; copyText(r.url, 'Ссылка для «' + r.a.short + '» скопирована'); return; }
            var q = e.target.closest('[data-qr-link]');
            if (q) { closeModal(); athleteLinkModal(q.getAttribute('data-qr-link')); }
          });
          m.querySelector('#links-csv').addEventListener('click', function () {
            saveCSV([['Спортсмен', 'Номер', 'Ссылка на чек-ин']].concat(rows.map(function (r) { return [r.a.short, r.a.num || '', r.url]; })), 'ai-sports_checkin-links.csv');
            logEvent('access', 'Выгружен список ссылок на чек-ин (' + rows.length + ')');
            toast('Список скачан — храните его как пароли');
          });
        }
      });
    });
  }
  function rotateTeamKey() {
    if (!pilot) return;
    openModal('<div class="modal-head"><span class="mi" style="background:var(--orange-soft);color:var(--orange)">' + icon('shield') + '</span><div><h2 id="modal-title">Сменить ключ команды?</h2><p>Все выданные ссылки на чек-ин и ещё не принятые ответы перестанут работать. Новые ссылки нужно будет разослать заново.</p></div></div>' +
      '<div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Отмена</button><button class="btn btn-danger" type="button" id="rk-go">Сменить ключ</button></div>', {
      mount: function (m) {
        m.querySelector('#rk-go').addEventListener('click', function () {
          pilot.team.id = CX.randomId(6); pilot.team.key = CX.randomKey(); pilot.team.keyAt = Date.now(); savePilot();
          logEvent('access', 'Ключ команды для чек-инов сменён — старые ссылки отозваны');
          closeModal(); render(); toast('Ключ сменён. Разошлите новые ссылки.');
        });
      }
    });
  }

  /* ----- сотрудники этого устройства ----- */
  function staffModal() {
    if (!isPilot()) return;
    var st = pilot.staff || {};
    openModal('<div class="modal-head"><span class="mi">' + icon('users') + '</span><div><h2 id="modal-title">Сотрудники</h2><p>Имена подставляются в шапку, журнал аудита и решения по рекомендациям</p></div></div>' +
      '<form class="modal-body" id="st-form" novalidate><div class="je-grid">' + Object.keys(ROLES).map(function (k) {
        return '<div class="field"><label for="st-' + k + '">' + ROLES[k].title + '</label><input class="input" id="st-' + k + '" type="text" maxlength="60" autocomplete="off" value="' + esc(st[k] || '') + '" placeholder="Имя и фамилия"></div>';
      }).join('') + '</div>' +
      '<div class="note">' + icon('info', 'icon-sm') + '<span>Роль переключается в меню профиля в правом верхнем углу. Права доступа зависят от роли: лабораторные данные видит только врач, ответы чек-ина детально — только психолог.</span></div>' +
      '<div class="modal-foot" style="margin-top:4px"><button class="btn btn-ghost" type="button" data-close>Отмена</button><button class="btn btn-primary" type="submit">' + icon('check', 'icon-sm') + 'Сохранить</button></div></form>', {
      mount: function (m) {
        m.querySelector('#st-form').addEventListener('submit', function (e) {
          e.preventDefault();
          var out = {};
          Object.keys(ROLES).forEach(function (k) { var v = m.querySelector('#st-' + k).value.replace(/\s+/g, ' ').trim().slice(0, 60); if (v) out[k] = v; });
          pilot.staff = out; savePilot();
          logEvent('staff', 'Обновлены имена сотрудников устройства');
          closeModal(); render(); toast('Сотрудники сохранены');
        });
      }
    });
  }

  /* ----- приём ответов ----- */
  function decodeReply(rep) {
    if (!pilot || !pilot.team.id) return Promise.resolve({ error: 'Сначала создайте «Мою команду» на этом устройстве.' });
    if (rep.teamId !== pilot.team.id) return Promise.resolve({ error: 'Ответ для другой команды или по старой ссылке (ключ был сменён).' });
    var a = byId(rep.athleteId);
    if (!a) return Promise.resolve({ error: 'Спортсмена нет в составе — возможно, он удалён.' });
    return CX.deriveAthleteKey(pilot.team.key, pilot.team.id, a.id).then(function (k) {
      return CX.open(k, rep.blob, CX.aadFor(pilot.team.id, a.id));
    }).then(function (p) {
      if (!p || p.v !== 1 || p.a !== a.id || p.t !== pilot.team.id || !/^\d{4}-\d{2}-\d{2}$/.test(p.d) || !p.r) return { error: 'Ответ повреждён.', a: a };
      var r = p.r, bad = false;
      function rng(v, lo, hi) { if (v == null) return; if (typeof v !== 'number' || !(v >= lo && v <= hi)) bad = true; }
      rng(r.readiness, 0, 10); ['fatigue', 'soreness', 'sleepq', 'stress', 'mood'].forEach(function (k) { rng(r[k], 1, 5); });
      rng(r.sleeph, 0, 16); rng(r.rpe, 0, 10); rng(r.dur, 0, 600);
      if (r.readiness == null || bad) return { error: 'В ответе недопустимые значения.', a: a };
      var dt = new Date(p.d + 'T00:00:00'), now = new Date();
      if (dt - now > 36e5 * 36 || now - dt > 864e5 * 60) return { error: 'Дата ответа вне допустимого окна (60 дней).', a: a };
      var cur = (pilot.records[a.id] || {})[p.d] || {};
      if (cur.ci_ts && typeof p.ts === 'number' && cur.ci_ts >= p.ts) return { dup: true, a: a, d: p.d, r: r, ts: p.ts, newer: cur.ci_ts > p.ts };
      var exists = cur.readiness != null;
      return { ok: true, a: a, d: p.d, r: r, ts: p.ts, exists: exists };
    }).catch(function () { return { error: 'Не удалось расшифровать: ссылка повреждена или ключ был сменён.', a: a }; });
  }
  function applyReply(x) {
    var rec = pilotRec(x.a.id, x.d), r = x.r;
    rec.readiness = r.readiness;
    if (r.mood != null) rec.mood = r.mood;
    if (r.stress != null) rec.stress = 6 - r.stress;
    if (r.sleepq != null) rec.sleep_quality = r.sleepq;
    if (r.soreness != null) rec.soreness = 6 - r.soreness;
    if (r.fatigue != null) rec.fatigue = 6 - r.fatigue;
    if (r.sleeph != null) rec.sleep_hours = r.sleeph;
    if (r.note) rec.note = String(r.note).slice(0, 300);
    rec.src = 'athlete';
    delete rec.edited;
    if (typeof x.ts === 'number') rec.ci_ts = x.ts;
    if (r.dur != null) {
      var y = new Date(x.d + 'T00:00:00'); y.setDate(y.getDate() - 1);
      var yr = pilotRec(x.a.id, model.isoOf(y));
      yr.srpe = Math.round((r.rpe || 0) * r.dur);
      yr.rpe = r.dur === 0 ? 0 : r.rpe;
      yr.sessions = r.dur > 0 ? Math.max(1, yr.sessions || 0) : 0;
      if (!yr.src) yr.src = 'athlete';
    }
  }
  function replySummary(r) {
    var parts = ['готовность ' + r.readiness + '/10'];
    if (r.fatigue != null) parts.push('усталость ' + r.fatigue + '/5');
    if (r.soreness != null) parts.push('боль ' + r.soreness + '/5');
    if (r.sleeph != null) parts.push('сон ' + num(r.sleeph, 1) + ' ч');
    if (r.dur != null) parts.push(r.dur === 0 ? 'вчера отдых' : 'вчера RPE ' + r.rpe + ' × ' + r.dur + ' мин');
    return parts.join(' · ');
  }
  function showReplies(list) {
    Promise.all(list.map(decodeReply)).then(function (res) {
      var good = res.filter(function (x) { return x.ok; });
      var seen = {};
      good = good.filter(function (x) { var k = x.a.id + x.d; if (seen[k] && seen[k].ts >= x.ts) return false; seen[k] = x; return true; });
      var dups = res.filter(function (x) { return x.dup; });
      var bad = res.filter(function (x) { return !x.ok && !x.dup; });
      openModal('<div class="modal-head"><span class="mi" style="background:var(--mint-soft);color:var(--mint)">' + icon('brain') + '</span><div><h2 id="modal-title">' + (good.length === 1 ? 'Чек-ин от спортсмена' : 'Входящие чек-ины') + '</h2><p>' + good.length + ' ' + plural(good.length, 'ответ готов', 'ответа готовы', 'ответов готовы') + ' к сохранению' + (dups.length ? ' · ' + dups.length + ' уже в журнале' : '') + (bad.length ? ' · ' + bad.length + ' с ошибкой' : '') + '</p></div></div>' +
        '<div class="modal-body"><div class="links-list">' +
        good.map(function (x) {
          return '<div class="link-row"><span class="person">' + avatar(x.a) + '<span><b>' + esc(x.a.short) + ' · ' + fmtFull.format(new Date(x.d + 'T00:00:00')) + '</b><span>' + esc(replySummary(x.r)) + (x.r.note && can('psych') ? '<br>«' + esc(x.r.note) + '»' : '') + '</span></span></span>' + (x.exists ? '<span class="badge warn plain">заменит запись</span>' : '<span class="badge ok plain">новый</span>') + '</div>';
        }).join('') +
        dups.map(function (x) { return '<div class="link-row"><span class="person">' + avatar(x.a) + '<span><b>' + esc(x.a.short) + ' · ' + fmtFull.format(new Date(x.d + 'T00:00:00')) + '</b><span>' + (x.newer ? 'В журнале уже более свежий ответ за этот день' : 'Этот ответ уже сохранён') + '</span></span></span><span class="badge plain mute">пропущен</span></div>'; }).join('') +
        bad.map(function (x) { return '<div class="link-row"><span class="person"><span class="avatar c4">!</span><span><b>' + (x.a ? esc(x.a.short) : 'Неизвестный ответ') + '</b><span class="val-warn">' + esc(x.error) + '</span></span></span></div>'; }).join('') +
        '</div>' + (good.length ? '' : dups.length && !bad.length ? '<div class="note">' + icon('check', 'icon-sm') + '<span>Всё уже в журнале — сохранять нечего.</span></div>' : '<div class="note warn">' + icon('alert', 'icon-sm') + '<span>Нечего сохранять. Если ключ команды менялся — отправьте спортсмену новую ссылку.</span></div>') + '</div>' +
        '<div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>' + (good.length ? 'Отмена' : 'Закрыть') + '</button>' + (good.length ? '<button class="btn btn-primary" type="button" id="rp-save">' + icon('check', 'icon-sm') + 'Сохранить в журнал</button>' : '') + '</div>', {
        cls: 'wide',
        mount: function (m) {
          var sv = m.querySelector('#rp-save');
          if (sv) sv.addEventListener('click', function () {
            good.forEach(applyReply);
            savePilot();
            logEvent('checkin', 'Приняты чек-ины спортсменов по ссылке: ' + good.length + ' (' + good.map(function (x) { return x.a.short; }).slice(0, 4).join(', ') + (good.length > 4 ? '…' : '') + ')');
            rebuild(); closeModal(); render();
            toast('Сохранено: ' + good.length + ' ' + plural(good.length, 'чек-ин', 'чек-ина', 'чек-инов'));
          });
        }
      });
    });
  }
  function inboxModal() {
    if (!isPilot()) return;
    openModal('<div class="modal-head"><span class="mi" style="background:var(--mint-soft);color:var(--mint)">' + icon('brain') + '</span><div><h2 id="modal-title">Входящие чек-ины</h2><p>Вставьте ответы спортсменов — можно сразу несколько, хоть всю переписку</p></div></div>' +
      '<div class="modal-body"><div class="field"><label for="ib-text">Ссылки-ответы</label><textarea class="textarea mono" id="ib-text" rows="7" placeholder="https://…/app#ci=…"></textarea></div><span class="err" id="ib-err" role="alert"></span>' +
      '<div class="note">' + icon('info', 'icon-sm') + '<span>Из текста берутся только ссылки чек-ина; остальное игнорируется. Расшифровка — на этом устройстве.</span></div></div>' +
      '<div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Отмена</button><button class="btn btn-primary" type="button" id="ib-go">' + icon('check', 'icon-sm') + 'Разобрать</button></div>', {
      mount: function (m) {
        m.querySelector('#ib-go').addEventListener('click', function () {
          var list = CX.parseReplies(m.querySelector('#ib-text').value);
          if (!list.length) { m.querySelector('#ib-err').textContent = 'Не нашёл ни одной ссылки чек-ина. Скопируйте сообщение спортсмена целиком.'; return; }
          closeModal(); showReplies(list);
        });
      }
    });
  }
  function handleIncomingHash() {
    if (!/^#ci=/.test(location.hash)) return false;
    var rep = CX && CX.parseReply(location.hash);
    try { history.replaceState(null, '', location.pathname + '#/overview'); } catch (e) { location.hash = '#/overview'; }
    if (!rep) { toast('Ссылка чек-ина повреждена'); return true; }
    if (!pilot) { setTimeout(function () { openModal('<div class="modal-head"><span class="mi">' + icon('info') + '</span><div><h2 id="modal-title">Это ответ на чек-ин</h2><p>Открыть его можно только на устройстве, где ведётся «Моя команда», — там хранится ключ команды. Перешлите ссылку себе на рабочее устройство или восстановите команду из резервной копии.</p></div></div><div class="modal-foot"><button class="btn btn-primary" type="button" data-close>Понятно</button></div>'); }, 50); return true; }
    if (!isPilot()) { state.ws = 'pilot'; save(); rebuild(); }
    setTimeout(function () { showReplies([rep]); }, 60);
    return true;
  }

  /* ======================= Администрирование ======================= */
  var CONSENT_KEYS = [
    ['wear', 'Данные носимых устройств', 'Сон, HRV, пульс, нагрузка с браслета'],
    ['lab', 'Лабораторные анализы', 'Импорт результатов из лаборатории'],
    ['coach', 'Передача тренеру', 'Обобщённые показатели готовности для штаба'],
    ['research', 'Обезличенное использование', 'Дообучение моделей без имени и контактов']
  ];
  var CONSENT_OFF = { 'a20:wear': 1, 'a20:lab': 1, 'a11:research': 1, 'a06:coach': 1, 'a22:research': 1 };
  var PILOT_CONSENTS = [
    ['health', 'Данные о здоровье', 'Чек-ины, сон, самочувствие и нагрузка — письменное согласие спортсмена'],
    ['coach', 'Передача тренеру', 'Обобщённый статус готовности для тренерского штаба'],
    ['research', 'Обезличенное использование', 'Улучшение моделей без имени и контактов']
  ];
  function consentKeys() { return isPilot() ? PILOT_CONSENTS : CONSENT_KEYS; }
  function consentOf(id, key) {
    if (isPilot()) return !!(((pilot.consents || {})[id] || {})[key]);
    var o = state.consents[id];
    if (o && key in o) return !!o[key];
    return !(CONSENT_OFF[id + ':' + key]);
  }
  function staffSeed() {
    return [
      { id: 'u-adm', name: 'Айгерим Нурланова', role: 'admin', email: 'a.nurlanova@demo.team', active: true, last: 'сегодня, 08:02' },
      { id: 'u-doc', name: 'Алия Касымова', role: 'doctor', email: 'a.kassymova@demo.team', active: true, last: 'сегодня, 07:41' },
      { id: 'u-coach', name: 'Серик Нуртаев', role: 'coach', email: 's.nurtaev@demo.team', active: true, last: 'сегодня, 06:58' },
      { id: 'u-psych', name: 'Мария Ли', role: 'psych', email: 'm.li@demo.team', active: true, last: 'вчера, 19:12' },
      { id: 'u-coach2', name: 'Данияр Оспанов', role: 'coach', email: 'd.ospanov@demo.team', active: true, last: '3 дня назад' },
      { id: 'u-old', name: 'Виктор Пак', role: 'psych', email: 'v.pak@demo.team', active: false, last: '2 месяца назад' }
    ];
  }
  function getStaff() {
    if (!state.staff || !state.staff.length) { state.staff = staffSeed(); }
    return state.staff;
  }
  var AUDIT_KINDS = {
    role: ['user', 'Доступ'], staff: ['users', 'Доступ'], consent: ['shield', 'Согласия'], access: ['link', 'Доступ'],
    decision: ['check', 'Решения'], checkin: ['brain', 'Данные'], athlete: ['users', 'Данные'],
    data: ['upload', 'Данные'], report: ['download', 'Отчёты'], system: ['settings', 'Система']
  };
  function logEvent(kind, text) {
    var r = who(state.role), ev = { ts: Date.now(), kind: kind, text: text, by: r.name, role: r.title };
    if (isPilot()) {
      // журнал пилота хранится вместе с данными команды и попадает в резервную копию
      pilot.audit = [ev].concat(pilot.audit || []).slice(0, 1000);
      savePilot();
      return;
    }
    state.audit = [ev].concat(state.audit || []).slice(0, 300);
    save();
  }
  function demoAudit() {
    function at(h, m, dAgo) { var d = new Date(model.today); d.setDate(d.getDate() - (dAgo || 0)); d.setHours(h, m, 0, 0); return d.getTime(); }
    return [
      { ts: at(7, 41), kind: 'role', text: 'Вход в систему', by: 'Алия Касымова', role: 'Спортивный врач', demo: true },
      { ts: at(7, 2), kind: 'data', text: 'Синхронизация устройств: получены данные 23 из 24 спортсменов', by: 'Система', role: 'Планировщик', demo: true },
      { ts: at(6, 58), kind: 'role', text: 'Вход в систему', by: 'Серик Нуртаев', role: 'Главный тренер', demo: true },
      { ts: at(19, 12, 1), kind: 'report', text: 'Сформирован отчёт «Состояние команды»', by: 'Мария Ли', role: 'Спортивный психолог', demo: true },
      { ts: at(18, 40, 1), kind: 'system', text: 'Обновление моделей до v1.0.0 (риск травмы, готовность)', by: 'Айгерим Нурланова', role: 'Администратор', demo: true },
      { ts: at(9, 15, 2), kind: 'consent', text: 'Обновлено согласие: Глеб Никитин — данные устройств отозваны', by: 'Айгерим Нурланова', role: 'Администратор', demo: true },
      { ts: at(8, 30, 3), kind: 'staff', text: 'Деактивирован пользователь Виктор Пак', by: 'Айгерим Нурланова', role: 'Администратор', demo: true }
    ];
  }
  function allAudit() { return isPilot() ? (pilot.audit || []) : (state.audit || []).concat(demoAudit()); }

  RENDER.admin = function () {
    if (!can('admin')) {
      return pageHead('admin') +
        '<section class="panel panel-body" style="display:flex;flex-direction:column;align-items:flex-start;gap:14px;padding:32px">' +
        '<span class="kpi-ic i" style="width:46px;height:46px">' + icon('lock') + '</span>' +
        '<h2 class="title-m">Раздел доступен администратору</h2>' +
        '<p class="muted" style="margin:0;max-width:52ch">Управление пользователями, согласиями и журналом аудита — зона ответственности администратора платформы. Текущая роль: «' + ROLES[state.role].title + '».</p>' +
        '<button class="btn btn-primary" type="button" data-role-set="admin">' + icon('users', 'icon-sm') + (isPilot() ? 'Переключиться на роль администратора' : 'Войти как администратор (демо)') + '</button></section>' + footerStrip();
    }
    if (isPilot()) return pilotAdminHtml();
    var staff = getStaff();
    var activeStaff = staff.filter(function (u) { return u.active; }).length;
    var real = model.athletes.filter(function (a) { return !a.custom; });
    var totalConsents = real.length * CONSENT_KEYS.length, givenConsents = 0;
    real.forEach(function (a) { CONSENT_KEYS.forEach(function (k) { if (consentOf(a.id, k[0])) givenConsents++; }); });
    var audit = allAudit();
    var today0 = new Date(model.today); today0.setHours(0, 0, 0, 0);
    var todayEvents = audit.filter(function (e) { return e.ts >= today0.getTime(); }).length;
    var fresh = real.filter(function (a) { return snapOf(a).status !== 'nodata'; }).length;
    var quality = Math.round(fresh / real.length * 100);
    var f = state.auditFilter || 'all';
    var FILTERS = [['all', 'Все'], ['access', 'Доступ'], ['decision', 'Решения'], ['data', 'Данные'], ['system', 'Система']];
    function inFilter(e) {
      if (f === 'all') return true;
      if (f === 'access') return e.kind === 'role' || e.kind === 'staff' || e.kind === 'consent' || e.kind === 'access';
      if (f === 'decision') return e.kind === 'decision';
      if (f === 'data') return e.kind === 'data' || e.kind === 'checkin' || e.kind === 'athlete' || e.kind === 'report';
      return e.kind === 'system';
    }
    var shown = audit.filter(inFilter).slice(0, 40);
    var seg = '<div class="seg" role="group" aria-label="Фильтр журнала">' + FILTERS.map(function (x) { return '<button type="button" data-audit-f="' + x[0] + '" aria-pressed="' + (f === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
    var ca = byId(state.consentAthlete) || real[0];
    var mv = ML && ML.models ? ML.models.injury.version : '—';
    var storage = 0; try { storage = (localStorage.getItem(STORE) || '').length; } catch (e) { /* noop */ }
    var integrations = [['Vercel Edge', 'Хостинг и заголовки безопасности', 'ok', 'Активно'], ['Модели ИИ v' + mv, 'Инференс в браузере · ' + (ML && ML.ready ? 'загружены' : 'не загружены'), ML && ML.ready ? 'ok' : 'warn', ML && ML.ready ? 'Активно' : 'Ошибка'], ['Garmin Health API', 'Сон, HRV, нагрузка', 'mute', 'Не подключено'], ['Лабораторная система', 'Импорт анализов', 'mute', 'Не подключено'], ['SSO / каталог пользователей', 'Единый вход организации', 'mute', 'Не подключено']];

    return pageHead('admin', '<button class="btn btn-ghost" type="button" data-action="audit-export">' + icon('download') + '<span class="lbl">Журнал в CSV</span></button>') +
      '<div class="grid g-4">' +
        '<article class="panel kpi"><div class="kpi-top"><span>Пользователи</span><span class="kpi-ic i">' + icon('users', 'icon-sm') + '</span></div><div class="kpi-mid"><span class="kpi-val">' + activeStaff + '<small>/ ' + staff.length + '</small></span></div><div class="kpi-foot"><span class="delta flat">' + staff.filter(function (u) { return !u.active; }).length + '</span>деактивировано</div></article>' +
        '<article class="panel kpi"><div class="kpi-top"><span>Согласия спортсменов</span><span class="kpi-ic m">' + icon('shield', 'icon-sm') + '</span></div><div class="kpi-mid"><span class="kpi-val">' + Math.round(givenConsents / totalConsents * 100) + '<small>%</small></span></div><div class="kpi-foot"><span class="delta flat">' + givenConsents + ' из ' + totalConsents + '</span>категорий данных</div></article>' +
        '<article class="panel kpi"><div class="kpi-top"><span>События аудита</span><span class="kpi-ic v">' + icon('file', 'icon-sm') + '</span></div><div class="kpi-mid"><span class="kpi-val">' + todayEvents + '<small>сегодня</small></span></div><div class="kpi-foot"><span class="delta flat">' + audit.length + '</span>всего в журнале</div></article>' +
        '<article class="panel kpi"><div class="kpi-top"><span>Качество данных</span><span class="kpi-ic o">' + icon('activity', 'icon-sm') + '</span></div><div class="kpi-mid"><span class="kpi-val">' + quality + '<small>%</small></span></div><div class="kpi-foot"><span class="delta ' + (quality >= 90 ? 'up' : 'down') + '">' + fresh + '/' + real.length + '</span>устройств на связи</div></article>' +
      '</div>' +
      '<div class="grid g-main">' +
        '<section class="panel"><div class="panel-head"><div><h2>Пользователи и роли</h2><p>Каждая роль видит только нужную ей категорию данных — матрица в настройках</p></div><button class="btn btn-primary btn-sm" type="button" data-action="invite">' + icon('plus', 'icon-sm') + 'Пригласить</button></div>' +
          '<div class="table-wrap"><table class="table staff-table"><caption class="sr-only">Пользователи платформы</caption><thead><tr><th scope="col">Пользователь</th><th scope="col">Роль</th><th scope="col">Активность</th><th scope="col">Доступ</th><th scope="col"><span class="sr-only">Действия</span></th></tr></thead><tbody>' +
          staff.map(function (u) {
            var r = ROLES[u.role] || ROLES.doctor;
            var initials = u.name.trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
            return '<tr tabindex="-1" style="cursor:default"' + (u.active ? '' : ' class="staff-off"') + '><td><span class="person"><span class="avatar ' + avClass(u.id) + '">' + esc(initials) + '</span><span><b>' + esc(u.name) + '</b><span>' + esc(u.email) + '</span></span></span></td>' +
              '<td><label class="sr-only" for="role-' + u.id + '">Роль: ' + esc(u.name) + '</label><select class="select select-sm" id="role-' + u.id + '" data-staff-role="' + u.id + '">' + Object.keys(ROLES).map(function (k) { return '<option value="' + k + '"' + (u.role === k ? ' selected' : '') + '>' + ROLES[k].title + '</option>'; }).join('') + '</select></td>' +
              '<td class="muted" style="font-size:13px">' + esc(u.last || '—') + '</td>' +
              '<td><span class="switch"><input type="checkbox" data-staff-active="' + u.id + '" ' + (u.active ? 'checked' : '') + ' aria-label="Доступ: ' + esc(u.name) + '"><span class="track"></span></span></td>' +
              '<td>' + (u.custom ? '<button class="icon-btn" type="button" data-staff-remove="' + u.id + '" aria-label="Удалить ' + esc(u.name) + '">' + icon('trash') + '</button>' : '') + '</td></tr>';
          }).join('') + '</tbody></table></div>' +
          '<div class="panel-foot"><span>' + icon('lock', 'icon-sm') + ' Администратор управляет доступом, но не видит медицинские данные</span></div></section>' +
        '<section class="panel"><div class="panel-head"><div><h2>Система и модели</h2><p>Состояние платформы</p></div><span class="badge ice plain">' + icon('cpu', 'icon-sm') + 'v' + mv + '</span></div><div class="panel-body" style="display:flex;flex-direction:column;gap:10px">' +
          integrations.map(function (x) { return '<div class="sys-row"><span class="grow"><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></span><span class="badge ' + x[2] + '">' + x[3] + '</span></div>'; }).join('') +
          '<div class="sys-row"><span class="grow"><b>Локальное хранилище демо</b><span>Настройки, чек-ины, решения, журнал — только этот браузер</span></span><span class="badge plain mute num">' + num(Math.max(1, Math.round(storage / 1024))) + ' КБ</span></div>' +
          '<div class="note">' + icon('info', 'icon-sm') + '<span>В продуктовой версии здесь — подключение SSO, резервное копирование, ротация ключей и соответствие требованиям к данным о здоровье.</span></div>' +
        '</div></section>' +
      '</div>' +
      '<div class="grid g-main">' +
        '<section class="panel"><div class="panel-head"><div><h2>Журнал аудита <span class="badge plain mute">' + audit.length + '</span></h2><p>Кто, что и когда сделал — каждое действие фиксируется</p></div></div>' +
          '<div class="table-tools"><div class="left">' + seg + '</div>' + (state.audit && state.audit.length ? '<button class="btn btn-quiet btn-sm" type="button" data-action="audit-clear">Очистить мои события</button>' : '') + '</div>' +
          '<div class="audit-list">' + (shown.map(function (e) {
            var k = AUDIT_KINDS[e.kind] || ['info', 'Событие'];
            return '<div class="audit-row"><span class="ai-ic' + (e.demo ? ' demo' : '') + '">' + icon(k[0] === 'user' ? 'users' : k[0], 'icon-sm') + '</span><div class="grow"><b>' + esc(e.text) + '</b><span>' + esc(e.by) + ' · ' + esc(e.role) + (e.demo ? ' · демо-событие' : '') + '</span></div><time class="muted">' + fmtTime.format(new Date(e.ts)) + '</time></div>';
          }).join('') || '<div class="empty">' + icon('search') + 'В этой категории пока нет событий.</div>') + '</div>' +
          '<div class="panel-foot"><span>Показано ' + shown.length + ' из ' + audit.filter(inFilter).length + '</span><span>Хранится 300 последних событий</span></div></section>' +
        '<section class="panel"><div class="panel-head"><div><h2>Согласия спортсменов</h2><p>Обработка данных — только в заявленных целях</p></div></div><div class="panel-body" style="display:flex;flex-direction:column;gap:16px">' +
          '<div class="consent-cover">' + CONSENT_KEYS.map(function (k) {
            var n = real.filter(function (a) { return consentOf(a.id, k[0]); }).length;
            var pct = Math.round(n / real.length * 100);
            return '<div class="factor"><div class="factor-row"><span>' + k[1] + '</span><span>' + n + ' из ' + real.length + '</span></div><div class="factor-track"><i style="width:' + pct + '%;background:' + (pct === 100 ? 'var(--mint)' : pct >= 90 ? 'var(--violet-strong)' : 'var(--orange)') + '"></i></div></div>';
          }).join('') + '</div>' +
          athleteSelect('consent-select', ca.id, 'Спортсмен для настройки согласий') +
          '<div class="consent-grid">' + CONSENT_KEYS.map(function (k) {
            var on = consentOf(ca.id, k[0]);
            return '<label class="consent-row"><span class="grow"><b>' + k[1] + '</b><span>' + k[2] + '</span></span><span class="switch"><input type="checkbox" data-consent="' + k[0] + '" data-athlete="' + ca.id + '" ' + (on ? 'checked' : '') + '><span class="track"></span></span></label>';
          }).join('') + '</div>' +
          '<div class="note">' + icon('shield', 'icon-sm') + '<span>Отзыв согласия в реальной системе останавливает сбор соответствующей категории и запускает удаление по регламенту. Здесь — демонстрация интерфейса; каждое изменение попадает в журнал аудита.</span></div>' +
        '</div></section>' +
      '</div>' + footerStrip();
  };
  function daysAgo(ts) { return ts ? Math.floor((Date.now() - ts) / 864e5) : null; }
  function agoText(ts) {
    var d = daysAgo(ts);
    if (d == null) return 'ни разу';
    return d === 0 ? 'сегодня' : d === 1 ? 'вчера' : d + ' ' + plural(d, 'день', 'дня', 'дней') + ' назад';
  }
  function pilotAdminHtml() {
    var ath = pilot.athletes, n = ath.length;
    var t0 = new Date(); t0.setHours(0, 0, 0, 0);
    var days7 = []; for (var i = 0; i < 7; i++) { var d = new Date(t0); d.setDate(d.getDate() - i); days7.push(model.isoOf(d)); }
    var filled = 0;
    ath.forEach(function (a) { var rr = pilot.records[a.id] || {}; days7.forEach(function (iso) { if (rr[iso] && rr[iso].readiness != null) filled++; }); });
    var coverage = n ? Math.round(filled / (n * 7) * 100) : 0;
    var audit = allAudit();
    var todayEvents = audit.filter(function (e) { return e.ts >= t0.getTime(); }).length;
    var bAge = daysAgo(pilot.lastBackup);
    var keys = consentKeys();
    var withHealth = ath.filter(function (a) { return consentOf(a.id, 'health'); }).length;
    var f = state.auditFilter || 'all';
    var FILTERS = [['all', 'Все'], ['access', 'Доступ'], ['decision', 'Решения'], ['data', 'Данные'], ['system', 'Система']];
    function inFilter(e) {
      if (f === 'all') return true;
      if (f === 'access') return e.kind === 'role' || e.kind === 'staff' || e.kind === 'consent' || e.kind === 'access';
      if (f === 'decision') return e.kind === 'decision';
      if (f === 'data') return e.kind === 'data' || e.kind === 'checkin' || e.kind === 'athlete' || e.kind === 'report';
      return e.kind === 'system';
    }
    var shown = audit.filter(inFilter).slice(0, 60);
    var seg = '<div class="seg" role="group" aria-label="Фильтр журнала">' + FILTERS.map(function (x) { return '<button type="button" data-audit-f="' + x[0] + '" aria-pressed="' + (f === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
    var ca = byId(state.consentAthlete) || model.athletes[0];
    var mv = ML && ML.models ? ML.models.injury.version : '—';
    var storage = 0; try { storage = (localStorage.getItem(PSTORE) || '').length * 2; } catch (e) { /* noop */ }
    function sys(t, sub, cls, badge, btn) { return '<div class="sys-row"><span class="grow"><b>' + t + '</b><span>' + sub + '</span></span>' + (btn || '') + '<span class="badge ' + cls + '">' + badge + '</span></div>'; }
    return pageHead('admin', '<button class="btn btn-ghost" type="button" data-action="audit-export">' + icon('download') + '<span class="lbl">Журнал в CSV</span></button>') +
      '<div class="grid g-4">' +
        '<article class="panel kpi"><div class="kpi-top"><span>Спортсмены</span><span class="kpi-ic i">' + icon('users', 'icon-sm') + '</span></div><div class="kpi-mid"><span class="kpi-val">' + n + '</span></div><div class="kpi-foot"><span class="delta flat">' + num(pilotRecordCount()) + '</span>записей в журнале</div></article>' +
        '<article class="panel kpi"><div class="kpi-top"><span>Чек-ины за 7 дней</span><span class="kpi-ic m">' + icon('brain', 'icon-sm') + '</span></div><div class="kpi-mid"><span class="kpi-val">' + coverage + '<small>%</small></span></div><div class="kpi-foot"><span class="delta ' + (coverage >= 70 ? 'up' : 'down') + '">' + filled + ' из ' + n * 7 + '</span>ожидаемых ответов</div></article>' +
        '<article class="panel kpi"><div class="kpi-top"><span>Согласия на данные</span><span class="kpi-ic v">' + icon('shield', 'icon-sm') + '</span></div><div class="kpi-mid"><span class="kpi-val">' + withHealth + '<small>/ ' + n + '</small></span></div><div class="kpi-foot"><span class="delta ' + (withHealth === n ? 'up' : 'down') + '">' + (n - withHealth) + '</span>без отметки о согласии</div></article>' +
        '<article class="panel kpi"><div class="kpi-top"><span>Резервная копия</span><span class="kpi-ic o">' + icon('download', 'icon-sm') + '</span></div><div class="kpi-mid"><span class="kpi-val" style="font-size:24px">' + agoText(pilot.lastBackup) + '</span></div><div class="kpi-foot"><span class="delta ' + (bAge != null && bAge <= 7 ? 'up' : 'down') + '">' + (bAge != null && bAge <= 7 ? 'в норме' : 'пора') + '</span>рекомендуем раз в неделю</div></article>' +
      '</div>' +
      '<div class="grid g-main">' +
        '<section class="panel"><div class="panel-head"><div><h2>Сотрудники и роли</h2><p>Кто работает с данными на этом устройстве. Роль определяет, какие данные видны</p></div><button class="btn btn-ghost btn-sm" type="button" data-action="staff">' + icon('sliders', 'icon-sm') + 'Изменить имена</button></div>' +
          '<div class="table-wrap"><table class="table staff-table"><caption class="sr-only">Сотрудники устройства</caption><thead><tr><th scope="col">Сотрудник</th><th scope="col">Роль</th><th scope="col">Доступ к данным</th></tr></thead><tbody>' +
          Object.keys(ROLES).map(function (k) {
            var r = who(k);
            var scope = { doctor: 'Все данные, включая анализы', coach: 'Готовность и нагрузка, без медданных', psych: 'Ответы чек-ина детально', admin: 'Согласия, журнал, безопасность — без медданных' }[k];
            return '<tr tabindex="-1" style="cursor:default"><td><span class="person"><span class="avatar ' + avClass(k) + '">' + esc(r.initials) + '</span><span><b>' + esc(r.name) + '</b><span>' + (r.unnamed ? 'имя не указано' : (state.role === k ? 'работает сейчас' : '&nbsp;')) + '</span></span></span></td><td>' + esc(r.title) + '</td><td class="muted" style="font-size:13px">' + scope + '</td></tr>';
          }).join('') + '</tbody></table></div>' +
          '<div class="panel-foot"><span>' + icon('lock', 'icon-sm') + ' Данные не покидают устройство — общий доступ даётся передачей зашифрованной копии</span></div></section>' +
        '<section class="panel"><div class="panel-head"><div><h2>Безопасность и данные</h2><p>Состояние рабочего пространства «' + esc(pilot.team.name) + '»</p></div><span class="badge ice plain">' + icon('cpu', 'icon-sm') + 'v' + mv + '</span></div><div class="panel-body" style="display:flex;flex-direction:column;gap:10px">' +
          sys('Хранение', 'Только этот браузер · ' + num(Math.max(1, Math.round(storage / 1024))) + ' КБ · без сервера', 'ok', 'Локально') +
          sys('Ключ ссылок чек-ина', pilot.team.key ? 'Создан ' + agoText(pilot.team.keyAt || pilot.team.created) : 'Будет создан при первой ссылке', pilot.team.key ? 'ok' : 'mute', pilot.team.key ? 'Активен' : 'Нет', '<button class="btn btn-quiet btn-sm" type="button" data-action="rotate-key">Сменить</button>') +
          sys('Резервная копия', 'Последняя: ' + agoText(pilot.lastBackup), bAge != null && bAge <= 7 ? 'ok' : 'warn', bAge != null && bAge <= 7 ? 'В норме' : 'Сделайте', '<button class="btn btn-quiet btn-sm" type="button" data-action="pilot-backup">Создать</button>') +
          sys('Модели ИИ v' + mv, 'Инференс в браузере · ' + (ML && ML.ready ? 'загружены' : 'не загружены'), ML && ML.ready ? 'ok' : 'warn', ML && ML.ready ? 'Активно' : 'Ошибка') +
          sys('Офлайн-режим', 'Кабинет открывается без интернета после первого визита', 'serviceWorker' in navigator ? 'ok' : 'mute', 'serviceWorker' in navigator ? 'Доступен' : 'Нет') +
        '</div></section>' +
      '</div>' +
      '<div class="grid g-main">' +
        '<section class="panel"><div class="panel-head"><div><h2>Журнал аудита <span class="badge plain mute">' + audit.length + '</span></h2><p>Кто, что и когда сделал. Журнал входит в резервную копию и не очищается</p></div></div>' +
          '<div class="table-tools"><div class="left">' + seg + '</div></div>' +
          '<div class="audit-list">' + (shown.map(function (e) {
            var k = AUDIT_KINDS[e.kind] || ['info', 'Событие'];
            return '<div class="audit-row"><span class="ai-ic">' + icon(k[0] === 'user' ? 'users' : k[0], 'icon-sm') + '</span><div class="grow"><b>' + esc(e.text) + '</b><span>' + esc(e.by) + ' · ' + esc(e.role) + '</span></div><time class="muted">' + fmtTime.format(new Date(e.ts)) + '</time></div>';
          }).join('') || '<div class="empty">' + icon('search') + 'В этой категории пока нет событий.</div>') + '</div>' +
          '<div class="panel-foot"><span>Показано ' + shown.length + ' из ' + audit.filter(inFilter).length + '</span><span>Хранится 1000 последних событий</span></div></section>' +
        '<section class="panel"><div class="panel-head"><div><h2>Согласия спортсменов</h2><p>Отметьте, какие письменные согласия получены</p></div></div><div class="panel-body" style="display:flex;flex-direction:column;gap:16px">' +
          '<div class="consent-cover">' + keys.map(function (k) {
            var c = ath.filter(function (a) { return consentOf(a.id, k[0]); }).length;
            var pct = n ? Math.round(c / n * 100) : 0;
            return '<div class="factor"><div class="factor-row"><span>' + k[1] + '</span><span>' + c + ' из ' + n + '</span></div><div class="factor-track"><i style="width:' + pct + '%;background:' + (pct === 100 ? 'var(--mint)' : pct >= 90 ? 'var(--violet-strong)' : 'var(--orange)') + '"></i></div></div>';
          }).join('') + '</div>' +
          (ca ? athleteSelect('consent-select', ca.id, 'Спортсмен для настройки согласий') +
          '<div class="consent-grid">' + keys.map(function (k) {
            var on = consentOf(ca.id, k[0]);
            return '<label class="consent-row"><span class="grow"><b>' + k[1] + '</b><span>' + k[2] + '</span></span><span class="switch"><input type="checkbox" data-consent="' + k[0] + '" data-athlete="' + ca.id + '" ' + (on ? 'checked' : '') + '><span class="track"></span></span></label>';
          }).join('') + '</div>' : '') +
          '<div class="note">' + icon('shield', 'icon-sm') + '<span>Храните подписанные согласия у себя. Если спортсмен отозвал согласие — удалите его записи в журнале или самого спортсмена из состава; каждое изменение фиксируется в журнале аудита.</span></div>' +
        '</div></section>' +
      '</div>' + footerStrip();
  }
  MOUNT.admin = function () {
    var sel = document.getElementById('consent-select');
    if (sel) sel.addEventListener('change', function () { state.consentAthlete = sel.value; save(); render(); });
    view.querySelectorAll('[data-staff-role]').forEach(function (el) {
      el.addEventListener('change', function () {
        var u = getStaff().filter(function (x) { return x.id === el.getAttribute('data-staff-role'); })[0];
        if (!u) return;
        var was = (ROLES[u.role] || {}).title;
        u.role = el.value;
        logEvent('staff', 'Роль пользователя ' + u.name + ': «' + was + '» → «' + ROLES[u.role].title + '»');
        render(); toast('Роль обновлена: ' + u.name);
      });
    });
    view.querySelectorAll('[data-staff-active]').forEach(function (el) {
      el.addEventListener('change', function () {
        var u = getStaff().filter(function (x) { return x.id === el.getAttribute('data-staff-active'); })[0];
        if (!u) return;
        u.active = el.checked;
        logEvent('staff', (u.active ? 'Активирован' : 'Деактивирован') + ' пользователь ' + u.name);
        render(); toast(u.active ? 'Доступ открыт: ' + u.name : 'Доступ закрыт: ' + u.name);
      });
    });
    view.querySelectorAll('[data-consent]').forEach(function (el) {
      el.addEventListener('change', function () {
        var id = el.getAttribute('data-athlete'), key = el.getAttribute('data-consent');
        var a = byId(id);
        if (isPilot()) {
          pilot.consents = pilot.consents || {};
          (pilot.consents[id] = pilot.consents[id] || {})[key] = el.checked;
          savePilot();
        } else (state.consents[id] = state.consents[id] || {})[key] = el.checked;
        var k = consentKeys().filter(function (x) { return x[0] === key; })[0];
        logEvent('consent', 'Согласие «' + k[1] + '» для ' + (a ? a.short : id) + ': ' + (el.checked ? 'дано' : 'отозвано'));
        render(); toast(el.checked ? 'Согласие записано' : 'Согласие отозвано · зафиксировано в журнале');
      });
    });
  };
  function inviteModal() {
    openModal('<div class="modal-head"><span class="mi" style="background:var(--ice-soft);color:var(--ice)">' + icon('users') + '</span><div><h2 id="modal-title">Пригласить пользователя</h2><p>Доступ появится после принятия приглашения (демо)</p></div></div>' +
      '<form class="modal-body" id="inv-form" novalidate>' +
      '<div class="field"><label for="inv-name">Имя и фамилия <span class="req" aria-hidden="true">*</span></label><input class="input" id="inv-name" maxlength="60" autocomplete="off" placeholder="Например, Асель Жумабаева" required aria-describedby="inv-err"><span class="err" id="inv-err"></span></div>' +
      '<div class="grid g-2" style="gap:12px"><div class="field"><label for="inv-email">Рабочая почта</label><input class="input" id="inv-email" type="email" maxlength="80" autocomplete="off" placeholder="name@team.kz" aria-describedby="inv-email-err"><span class="err" id="inv-email-err"></span></div>' +
      '<div class="field"><label for="inv-role">Роль</label><select class="select" id="inv-role">' + Object.keys(ROLES).map(function (k) { return '<option value="' + k + '">' + ROLES[k].title + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="note">' + icon('info', 'icon-sm') + '<span>Не указывайте реальные персональные данные. Пользователь хранится только в вашем браузере.</span></div>' +
      '<div class="modal-foot" style="margin-top:4px"><button class="btn btn-ghost" type="button" data-close>Отмена</button><button class="btn btn-primary" type="submit">' + icon('check', 'icon-sm') + 'Отправить приглашение</button></div></form>', {
      mount: function (m) {
        m.querySelector('#inv-form').addEventListener('submit', function (e) {
          e.preventDefault();
          var nameEl = m.querySelector('#inv-name'), emailEl = m.querySelector('#inv-email');
          var val = nameEl.value.replace(/\s+/g, ' ').trim(), em = emailEl.value.trim(), ok = true;
          if (val.length < 3 || !/^[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі\-\s']+$/.test(val)) { nameEl.setAttribute('aria-invalid', 'true'); m.querySelector('#inv-err').textContent = 'Укажите имя буквами (минимум 3 символа)'; ok = false; } else { nameEl.removeAttribute('aria-invalid'); m.querySelector('#inv-err').textContent = ''; }
          if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { emailEl.setAttribute('aria-invalid', 'true'); m.querySelector('#inv-email-err').textContent = 'Похоже, в адресе опечатка'; ok = false; } else { emailEl.removeAttribute('aria-invalid'); m.querySelector('#inv-email-err').textContent = ''; }
          if (!ok) { (m.querySelector('[aria-invalid="true"]') || nameEl).focus(); return; }
          var role = m.querySelector('#inv-role').value;
          getStaff().push({ id: 'u' + Date.now().toString(36), name: val, role: role, email: em || 'приглашение не отправлено', active: true, last: 'приглашён', custom: true });
          logEvent('staff', 'Приглашён пользователь ' + val + ' с ролью «' + ROLES[role].title + '»');
          closeModal(); render(); toast('Приглашение создано: ' + val);
        });
      }
    });
  }

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
        '<div class="metric-tiles"><div class="tile"><span>Готовность</span><b class="' + scoreClass(s.readiness) + '">' + num(s.readiness) + '<small> /100</small></b></div><div class="tile"><span>Восстановление</span><b class="' + scoreClass(s.recovery) + '">' + num(s.recovery) + '<small> /100</small></b></div><div class="tile"><span>Риск · 7 дн.</span><b class="' + riskClass(s.rr) + '">' + fmtRisk(s) + '</b><em>' + fmtRR(s.rr) + ' к среднему</em></div></div>' +
        '<div class="kv"><div><span>' + icon('sleep', 'icon-sm') + 'Сон</span><b>' + D.fmtHours(s.sleep) + '</b></div><div><span>' + icon('heart', 'icon-sm') + 'HRV</span><b>' + (s.hrv == null ? '—' : num(s.hrv) + ' мс') + '</b></div><div><span>' + icon('activity', 'icon-sm') + 'Готовность завтра</span><b>' + (s.fc ? num(s.fc.value, 1) + ' / 10' : '—') + '</b></div><div><span>' + icon('alert', 'icon-sm') + '«Плохой день»</span><b>' + (s.fc ? Math.round(s.fc.pLow * 100) + '%' : '—') + '</b></div></div>' +
        (s.signal ? '<div class="note warn">' + icon('alert', 'icon-sm') + '<span><b>Ранний сигнал: ' + esc(s.signal) + '.</b><br>' + s.flags.map(function (f) { return esc(f.t); }).join(' · ') + '. Рекомендуется оценка спортивного врача. Не является диагнозом.</span></div>' :
          s.status === 'nodata' ? '<div class="note">' + icon('info', 'icon-sm') + '<span>Ожидаем данные с устройства. Первые 14–28 дней формируется личная норма — показатели выводятся без алертов.</span></div>' :
          '<div class="note">' + icon('check', 'icon-sm') + '<span>Отклонений от личной нормы не обнаружено.</span></div>') +
        (s.status !== 'nodata' ? lineChart({ labels: days.map(function (d) { return d.date; }), label: 'Готовность и восстановление за 14 дней', series: [{ name: 'Готовность', color: 'var(--s1)', values: days.map(function (d) { return d.readiness; }), area: true }, { name: 'Восстановление', color: 'var(--s2)', values: days.map(function (d) { return d.recovery; }) }], height: 190, min: 20, max: 100 }) : '') +
        (s.inj ? '<div><b style="font-size:13.5px;display:block;margin-bottom:8px">Главные факторы риска</b>' + injuryFactorsHtml(a, 3) + '</div>' : '') +
        '<div class="note">' + icon('shield', 'icon-sm') + '<span>' + (a.pilot ? 'Профиль «Моей команды»: данные хранятся только на этом устройстве. Прогнозы моделей не являются диагнозом.' : 'Вымышленный профиль. Прогнозы считают обученные модели; они не относятся к реальному человеку и не являются диагнозом.') + '</span></div>' +
      '</div>' +
      '<div class="drawer-foot">' + (a.custom || a.pilot ? '<button class="btn btn-danger" type="button" data-remove="' + a.id + '">' + icon('trash', 'icon-sm') + 'Удалить</button>' : '<a class="btn btn-ghost" href="#/medical/' + a.id + '">' + icon('flask', 'icon-sm') + 'Медданные</a>') +
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
        var rmA = byId(rid);
        if (isPilot()) {
          pilot.athletes = pilot.athletes.filter(function (c) { return c.id !== rid; });
          delete pilot.records[rid];
          savePilot();
          logEvent('athlete', 'Спортсмен и его записи удалены из состава' + (rmA ? ': ' + rmA.short : ''));
        } else {
          state.custom = state.custom.filter(function (c) { return c.id !== rid; });
          delete state.checkins[rid];
          logEvent('athlete', (isPilot() ? 'Удалён спортсмен из состава' : 'Удалён демо-профиль спортсмена') + (rmA ? ': ' + rmA.short : ''));
        }
        save(); rebuild(); closeDrawer(); render(); toast(isPilot() ? 'Спортсмен удалён из состава' : 'Профиль удалён из демо-состава');
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
    openModal('<div class="modal-head"><span class="mi">' + icon('file') + '</span><div><h2 id="modal-title">Создать отчёт</h2><p>Экспорт показателей команды в PDF или CSV для Excel</p></div></div>' +
      '<div class="modal-body"><div class="field"><span class="label" id="rep-fmt-l">Формат</span><div class="seg" role="radiogroup" aria-labelledby="rep-fmt-l" id="rep-fmt"><button type="button" role="radio" aria-pressed="true" aria-checked="true" data-fmt="pdf">PDF</button><button type="button" role="radio" aria-pressed="false" aria-checked="false" data-fmt="csv">CSV для Excel</button></div></div><div class="field"><label for="rep-type">Тип отчёта</label><select class="select" id="rep-type">' + Object.keys(REPORTS).map(function (k) { return '<option value="' + k + '">' + REPORTS[k].title + '</option>'; }).join('') + '</select></div>' +
      '<div class="note">' + icon('users', 'icon-sm') + '<span><b>' + (isPilot() ? esc(pilot.team.name) : 'Демо-команда') + '</b><br>' + t.total + ' ' + plural(t.total, 'спортсмен', 'спортсмена', 'спортсменов') + ' · срез на ' + fmtFull.format(asOfDate()) + '</span></div>' +
      '<p class="muted" style="margin:0;font-size:12.5px">' + (isPilot() ? 'Экспорт содержит срез на выбранную дату. Прогнозы моделей не являются медицинским заключением.' : 'Экспорт содержит демонстрационный срез, а не исторические измерения или медицинские заключения.') + '</p></div>' +
      '<div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Отмена</button><button class="btn btn-primary" type="button" id="rep-go">' + icon('download', 'icon-sm') + 'Скачать отчёт</button></div>', {
      mount: function (m) {
        var fmt = 'pdf';
        m.querySelectorAll('[data-fmt]').forEach(function (b) { b.addEventListener('click', function () { fmt = b.getAttribute('data-fmt'); m.querySelectorAll('[data-fmt]').forEach(function (x) { var on = x === b; x.setAttribute('aria-pressed', String(on)); x.setAttribute('aria-checked', String(on)); }); }); });
        m.querySelector('#rep-go').addEventListener('click', function () { var k = m.querySelector('#rep-type').value; if (fmt === 'pdf') downloadReportPdf(k); else downloadReport(k); closeModal(); });
      }
    });
  }

  function addAthleteModal() {
    var used = model.athletes.map(function (a) { return Number(a.num); });
    var next = 1; while (used.indexOf(next) > -1) next++;
    openModal('<div class="modal-head"><span class="mi">' + icon('users') + '</span><div><h2 id="modal-title">Новый спортсмен</h2><p>' + (isPilot() ? 'Добавьте спортсмена в состав «' + esc(pilot.team.name) + '»' : 'Добавьте спортсмена в демонстрационный состав') + '</p></div></div>' +
      '<form class="modal-body" id="add-form" novalidate>' +
        '<div class="field"><label for="add-name">Имя и фамилия <span class="req" aria-hidden="true">*</span></label><input class="input" id="add-name" maxlength="60" placeholder="Например, Алексей Иванов" autocomplete="off" aria-describedby="add-err" required><span class="err" id="add-err"></span></div>' +
        '<div class="grid g-2" style="gap:12px"><div class="field"><label for="add-pos">Амплуа</label><select class="select" id="add-pos"><option value="fw">Нападающий</option><option value="cf">Центральный нападающий</option><option value="df">Защитник</option><option value="gk">Вратарь</option></select></div>' +
        '<div class="field"><label for="add-num">Игровой номер</label><input class="input" id="add-num" type="number" min="1" max="99" value="' + next + '" aria-describedby="num-err"><span class="err" id="num-err"></span></div></div>' +
        '<div class="note">' + icon('info', 'icon-sm') + '<span>' + (isPilot() ? 'Рекомендуем код вместо фамилии. Данные хранятся только на этом устройстве.' : 'Не вводите реальные персональные или медицинские данные. Новому профилю не присваиваются прогнозы без измерений. Профиль хранится только в вашем браузере.') + '</span></div>' +
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
          var id = (isPilot() ? 'p' : 'c') + Date.now().toString(36);
          if (isPilot()) {
            pilot.athletes.push({ id: id, name: val, pos: m.querySelector('#add-pos').value, num: nv });
            savePilot();
            logEvent('athlete', 'Добавлен спортсмен в состав: ' + val);
          } else {
            state.custom.push({ id: id, name: val, pos: m.querySelector('#add-pos').value, num: nv });
            logEvent('athlete', (isPilot() ? 'Добавлен спортсмен: ' : 'Добавлен демо-профиль спортсмена: ') + val);
          }
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
    var fields = [['mood', 'Настроение', 'Плохое', 'Отличное', 4], ['stress', 'Уровень стресса', 'Низкий', 'Высокий', 2], ['motivation', 'Мотивация', 'Низкая', 'Высокая', 4], ['sleepq', 'Качество сна', 'Плохое', 'Отличное', 4], ['soreness', 'Мышечная болезненность', 'Нет', 'Сильная', 2], ['fatigue', 'Усталость', 'Нет', 'Сильная', 2]];
    openModal('<div class="modal-head"><span class="mi">' + icon('brain') + '</span><div><h2 id="modal-title">Как вы себя чувствуете?</h2><p>' + esc(a.short) + ' · чек-ин за ' + fmtFull.format(asOfDate()) + (isPilot() ? '' : ' · демо') + '</p></div></div>' +
      '<form class="modal-body" id="ci-form">' +
      '<div class="slider-row"><div class="top"><label for="ci-readiness">Готовность к тренировке сегодня</label><output id="ci-readiness-o" for="ci-readiness">7 / 10</output></div><input class="range" type="range" id="ci-readiness" min="0" max="10" step="1" value="7" aria-valuetext="7 из 10"><div class="ends" aria-hidden="true"><span>Совсем не готов</span><span>Полностью готов</span></div></div>' +
      fields.map(function (f) {
        return '<div class="slider-row"><div class="top"><label for="ci-' + f[0] + '">' + f[1] + '</label><output id="ci-' + f[0] + '-o" for="ci-' + f[0] + '">' + f[4] + ' / 5</output></div><input class="range" type="range" id="ci-' + f[0] + '" min="1" max="5" step="1" value="' + f[4] + '" aria-valuetext="' + f[4] + ' из 5"><div class="ends" aria-hidden="true"><span>' + f[2] + '</span><span>' + f[3] + '</span></div></div>';
      }).join('') +
      '<div class="grid g-3" style="gap:12px"><div class="field"><label for="ci-sleeph">Сон, часов</label><input class="input" id="ci-sleeph" type="text" inputmode="decimal" maxlength="5" autocomplete="off" placeholder="напр., 7,5"></div>' +
      '<div class="field"><label for="ci-rpe">Вчера: RPE 0–10</label><input class="input" id="ci-rpe" type="number" min="0" max="10" step="1" inputmode="numeric" placeholder="тяжесть"></div>' +
      '<div class="field"><label for="ci-dur">Вчера: минут</label><input class="input" id="ci-dur" type="number" min="0" max="600" step="5" inputmode="numeric" placeholder="0 — отдых"></div></div>' +
      '<span class="err" id="ci-err" role="alert"></span>' +
      '<div class="field"><label for="ci-note">Комментарий (по желанию)</label><textarea class="textarea" id="ci-note" maxlength="300" placeholder="Что важно знать специалисту сегодня?"></textarea></div>' +
      '<div class="note">' + icon('info', 'icon-sm') + '<span>Детальные ответы видит только психолог. Тренер — обобщённый статус. Это не психологическая диагностика; при выраженном дистрессе обратитесь к специалисту.</span></div>' +
      '<div class="modal-foot" style="margin-top:4px"><button class="btn btn-ghost" type="button" data-close>Отмена</button><button class="btn btn-primary" type="submit">' + icon('check', 'icon-sm') + 'Сохранить чек-ин</button></div></form>', {
      mount: function (m) {
        fields.concat([['readiness', '', '', '', 7, 10]]).forEach(function (f) {
          var r = m.querySelector('#ci-' + f[0]), o = m.querySelector('#ci-' + f[0] + '-o'), mx = f[5] || 5;
          r.addEventListener('input', function () { o.textContent = r.value + ' / ' + mx; r.setAttribute('aria-valuetext', r.value + ' из ' + mx); });
        });
        m.querySelector('#ci-form').addEventListener('submit', function (e) {
          e.preventDefault();
          var errEl = m.querySelector('#ci-err');
          function val(id, lo, hi, label) {
            var el = m.querySelector(id), v = String(el.value).trim().replace(',', '.');
            if (v === '') { el.removeAttribute('aria-invalid'); return null; }
            var x = Number(v);
            if (!(x >= lo && x <= hi)) { el.setAttribute('aria-invalid', 'true'); el.focus(); throw new Error('«' + label + '»: от ' + lo + ' до ' + hi); }
            el.removeAttribute('aria-invalid'); return x;
          }
          var sleeph, rpe, dur;
          try { sleeph = val('#ci-sleeph', 0, 16, 'Сон'); rpe = val('#ci-rpe', 0, 10, 'RPE'); dur = val('#ci-dur', 0, 600, 'Минут'); }
          catch (err) { errEl.textContent = 'Проверьте поле ' + err.message; return; }
          if (dur != null && dur > 0 && rpe == null) { errEl.textContent = 'Для вчерашней тренировки укажите RPE (0 минут — день отдыха)'; m.querySelector('#ci-rpe').focus(); return; }
          if (rpe != null && dur == null) { errEl.textContent = 'Укажите длительность вчерашней тренировки в минутах'; m.querySelector('#ci-dur').focus(); return; }
          errEl.textContent = '';
          var entry = { ts: Date.now(), note: m.querySelector('#ci-note').value.trim().slice(0, 300), readiness: Number(m.querySelector('#ci-readiness').value) };
          fields.forEach(function (f) { entry[f[0]] = Number(m.querySelector('#ci-' + f[0]).value); });
          if (sleeph != null) entry.sleeph = sleeph;
          if (dur != null) { entry.dur = dur; entry.rpe = dur === 0 ? 0 : rpe; }
          if (isPilot()) {
            var rec = pilotRec(a.id, todayISO());
            rec.readiness = entry.readiness; rec.mood = entry.mood;
            rec.stress = 6 - entry.stress; rec.sleep_quality = entry.sleepq;
            rec.soreness = 6 - entry.soreness; rec.fatigue = 6 - entry.fatigue;
            if (entry.note) rec.note = entry.note;
            if (entry.sleeph != null) rec.sleep_hours = entry.sleeph;
            if (entry.dur != null) {
              var yd = new Date(asOfDate()); yd.setDate(yd.getDate() - 1);
              var yr = pilotRec(a.id, model.isoOf(yd));
              yr.srpe = Math.round((entry.rpe || 0) * entry.dur);
              yr.rpe = entry.dur === 0 ? 0 : entry.rpe;
              yr.sessions = entry.dur > 0 ? Math.max(1, yr.sessions || 0) : 0;
            }
            savePilot();
          } else {
            state.checkins[a.id] = [entry].concat(state.checkins[a.id] || []).slice(0, 20);
          }
          logEvent('checkin', 'Заполнен чек-ин: ' + a.short + ' · готовность ' + entry.readiness + '/10' + (isPilot() ? ' · ' + todayISO() : ''));
          save(); rebuild(); closeModal(); render();
          var s2 = snapOf(byId(a.id));
          toast(s2.fc ? 'Чек-ин сохранён · прогноз на завтра ' + num(s2.fc.value, 1) + ' / 10' : 'Чек-ин сохранён');
        });
      }
    });
  }

  function confirmPilotClear() {
    if (!pilot) return;
    openModal('<div class="modal-head"><span class="mi" style="background:var(--red-soft);color:var(--red)">' + icon('trash') + '</span><div><h2 id="modal-title">Удалить «' + esc(pilot.team.name) + '»?</h2><p>Состав и все ' + num(pilotRecordCount()) + ' записей будут удалены с этого устройства без возможности восстановления. Сначала скачайте резервную копию.</p></div></div>' +
      '<div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Отмена</button><button class="btn btn-ghost" type="button" id="pc-backup">' + icon('download', 'icon-sm') + 'Сначала копию</button><button class="btn btn-danger" type="button" id="pc-go">Удалить навсегда</button></div>', {
      mount: function (m) {
        m.querySelector('#pc-backup').addEventListener('click', function () { closeModal(); backupModal(); });
        m.querySelector('#pc-go').addEventListener('click', function () {
          logEvent('system', 'Удалено рабочее пространство «' + pilot.team.name + '»');
          pilot = null;
          try { localStorage.removeItem(PSTORE); } catch (e) { /* noop */ }
          state.ws = 'demo'; save();
          rebuild(); closeModal(); render();
          toast('Рабочее пространство удалено');
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
          save();
          logEvent('system', 'Сброс демо-данных кабинета');
          rebuild(); applyTheme(); closeModal(); render(); toast('Демо-данные сброшены');
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
    var html = '<h3>' + (isPilot() ? 'Кто работает на устройстве' : 'Роль в демо-кабинете') + '</h3>' + Object.keys(ROLES).map(function (k) {
      var r = who(k);
      return '<button class="menu-item" type="button" role="menuitemradio" aria-checked="' + (state.role === k) + '" data-role="' + k + '"><span class="avatar ' + avClass(k) + '" style="width:30px;height:30px;font-size:11px">' + esc(r.initials) + '</span><span><b style="font-weight:600">' + esc(r.name) + '</b><span class="sub">' + (r.unnamed ? 'имя не указано' : esc(r.title)) + '</span></span>' + (state.role === k ? icon('check', 'icon-sm tick') : '') + '</button>';
    }).join('') + '<div class="menu-sep"></div>' +
      (isPilot() ? '<button class="menu-item" type="button" role="menuitem" data-action="staff">' + icon('users', 'icon-sm') + 'Имена сотрудников</button>' : '') +
      '<a class="menu-item" href="#/settings" role="menuitem">' + icon('settings', 'icon-sm') + 'Настройки</a>' +
      '<a class="menu-item" href="#/help" role="menuitem">' + icon('help', 'icon-sm') + 'Помощь и поддержка</a>' +
      '<a class="menu-item" href="/" role="menuitem">' + icon('home', 'icon-sm') + 'На сайт</a>' +
      '<button class="menu-item" type="button" role="menuitem" data-action="signout">' + icon('logout', 'icon-sm') + 'Выйти' + (state.profile ? ' (' + esc(state.profile.name.split(' ')[0]) + ')' : '') + '</button>';
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
  function setRole(r) {
    var from = ROLES[state.role].title;
    state.role = r; save();
    logEvent('role', 'Смена роли: «' + from + '» → «' + ROLES[r].title + '»');
    render(); toast('Роль: ' + ROLES[r].title);
  }
  function notifPopover(btn) {
    var notes = buildNotes();
    var html = '<div class="notif-head"><b>Уведомления</b><span class="muted" style="font-size:12.5px">' + (isPilot() ? 'События команды' : 'События команды · демо') + '</span></div><div class="notif-list">' +
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
    else state.decisions[id] = { status: status, ts: Date.now(), by: who(state.role).name + ' (' + who(state.role).title.toLowerCase() + ')' };
    var rec = buildRecs().filter(function (r) { return r.id === id; })[0];
    logEvent('decision', (status === 'accepted' ? 'Согласована' : status === 'declined' ? 'Отклонена' : 'Отменено решение по') + ' рекомендация «' + (rec ? rec.title : id) + '»' + (rec && rec.a ? ' · ' + rec.a.short : ''));
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
      else if (a === 'print') { logEvent('report', 'Печать / PDF: ' + (current.page === 'twin' ? 'отчёт по спортсмену' : PAGES[current.page][0])); window.print(); }
      else if (a === 'workspace') workspacePopover(act);
      else if (a === 'athlete-link') athleteLinkModal(act.getAttribute('data-id'));
      else if (a === 'team-links') teamLinksModal();
      else if (a === 'inbox') inboxModal();
      else if (a === 'rotate-key') rotateTeamKey();
      else if (a === 'staff') staffModal();
      else if (a === 'signout') { closePopover(); signOut(); }
      else if (a === 'team-load') teamLoadModal();
      else if (a === 'pilot-import') importHistoryModal();
      else if (a === 'pilot-backup') backupModal();
      else if (a === 'pilot-create') setupPilotModal();
      else if (a === 'pilot-clear') confirmPilotClear();
      else if (a === 'invite') inviteModal();
      else if (a === 'audit-export') {
        saveCSV([['Время', 'Категория', 'Событие', 'Кто', 'Роль']].concat(allAudit().map(function (e) {
          return [new Date(e.ts).toISOString().replace('T', ' ').slice(0, 16), (AUDIT_KINDS[e.kind] || ['', 'Событие'])[1], e.text, e.by, e.role];
        })), 'ai-sports_audit.csv');
        logEvent('report', 'Выгружен журнал аудита в CSV');
        render(); toast('Журнал аудита скачан');
      }
      else if (a === 'audit-clear') { state.audit = []; save(); render(); toast('Ваши события очищены — демо-история осталась'); }
      else if (a === 'csv-template') { saveCSV(templateRows(), 'ai-sports_shablon.csv'); toast('Шаблон скачан: 3 вымышленных спортсмена, 84 дня'); }
      else if (a === 'csv-sample') { runImport(templateRows().map(function (r) { return r.map(csvCell).join(';'); }).join('\n'), 'пример (3 вымышленных спортсмена)'); }
      else if (a === 'csv-results' && lastImport) {
        saveCSV([['Спортсмен', 'Дней истории', 'Последняя дата', 'Риск травмы 7 дн., %', 'Кратность к среднему', 'Главный фактор', 'Готовность завтра', 'Нижняя граница 80%', 'Верхняя граница 80%', '«Плохой день», %', 'Комментарий']].concat(lastImport.results.map(function (r) {
          return [r.name, r.days, r.last ? r.last.toISOString().slice(0, 10) : '', r.risk == null ? '' : D.round(r.risk, 1), r.rr == null ? '' : D.round(r.rr, 2), r.top || '', r.fc ? D.round(r.fc.value, 1) : '', r.fc ? D.round(r.fc.lo, 1) : '', r.fc ? D.round(r.fc.hi, 1) : '', r.fc ? Math.round(r.fc.pLow * 100) : '', r.error || r.note || ''];
        })), 'ai-sports_prognoz.csv');
        toast('Результаты скачаны');
      }
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
    var dp = t.closest('[data-pdf]');
    if (dp) { downloadReportPdf(dp.getAttribute('data-pdf')); return; }
    var ts = t.closest('[data-theme-set]');
    if (ts) { state.theme = ts.getAttribute('data-theme-set'); save(); applyTheme(); render(); return; }
    var rs = t.closest('[data-role-set]');
    if (rs) { setRole(rs.getAttribute('data-role-set')); return; }
    var je = t.closest('[data-jedit]');
    if (je) { journalEditModal(je.getAttribute('data-jid'), je.getAttribute('data-jedit')); return; }
    var jd = t.closest('[data-jdel]');
    if (jd) { journalDeleteModal(jd.getAttribute('data-jid'), jd.getAttribute('data-jdel')); return; }
    var wg = t.closest('[data-ws-go]');
    if (wg) {
      var to2 = wg.getAttribute('data-ws-go');
      state.ws = to2; save();
      logEvent('system', 'Переключение рабочего пространства: ' + (to2 === 'pilot' ? '«' + pilot.team.name + '»' : 'демо-команда'));
      rebuild(); render();
      toast(to2 === 'pilot' ? 'Рабочее пространство: ' + pilot.team.name : 'Рабочее пространство: демо-команда');
      return;
    }
    var af = t.closest('[data-audit-f]');
    if (af) { state.auditFilter = af.getAttribute('data-audit-f'); save(); render(); return; }
    var srm = t.closest('[data-staff-remove]');
    if (srm) {
      var uid = srm.getAttribute('data-staff-remove');
      var u = getStaff().filter(function (x) { return x.id === uid; })[0];
      state.staff = getStaff().filter(function (x) { return x.id !== uid; });
      if (u) logEvent('staff', 'Удалён пользователь ' + u.name);
      render(); toast('Пользователь удалён');
      return;
    }
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

  window.addEventListener('hashchange', function () {
    if (handleIncomingHash()) { render(); return; }
    closeDrawer(true); closePopover(); render(); view.focus({ preventScroll: true }); window.scrollTo(0, 0);
  });
  applyTheme();
  handleIncomingHash();
  render();
  if (!hasProfile()) welcomeScreen();
})();
