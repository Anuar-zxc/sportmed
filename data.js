/* AI Sports Precision Medicine — demo data model
   Все спортсмены и показатели вымышленные. Значения детерминированы (seed), чтобы демо выглядело одинаково у всех.
   Показатели считаются прозрачными правилами (личная норма, сон, нагрузка) — это иллюстрация интерфейса, не обученная модель. */
(function (global) {
  'use strict';

  var DAYS = 42;          // история для базовой линии
  var VISIBLE = 30;       // показываем в графиках

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function round(v, d) { var p = Math.pow(10, d || 0); return Math.round(v * p) / p; }
  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : 0; }
  function median(a) { var b = a.slice().sort(function (x, y) { return x - y; }); var m = Math.floor(b.length / 2); return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }

  var POS = { gk: 'Вратарь', df: 'Защитник', fw: 'Нападающий', cf: 'Центральный нападающий' };

  // profile: ok | overload | sleep | hrv | recovery | nodata | lowD
  var ROSTER = [
    ['a01', 'Арман', 'Сейткали', 'gk', 1, 27, 'ok'],
    ['a02', 'Даниил', 'Ким', 'df', 2, 24, 'ok'],
    ['a03', 'Ерлан', 'Жаксылыков', 'cf', 3, 28, 'overload'],
    ['a04', 'Тимур', 'Ахметов', 'fw', 4, 23, 'ok'],
    ['a05', 'Алексей', 'Воронцов', 'df', 5, 29, 'ok'],
    ['a06', 'Бауыржан', 'Омаров', 'fw', 6, 22, 'sleep'],
    ['a07', 'Руслан', 'Ибраев', 'fw', 7, 25, 'ok'],
    ['a08', 'Максим', 'Белов', 'cf', 8, 26, 'hrv'],
    ['a09', 'Нуржан', 'Касенов', 'df', 9, 30, 'ok'],
    ['a10', 'Илья', 'Сорокин', 'fw', 10, 21, 'ok'],
    ['a11', 'Айдос', 'Мукашев', 'fw', 11, 24, 'lowD'],
    ['a12', 'Дмитрий', 'Лаптев', 'df', 12, 27, 'ok'],
    ['a13', 'Санжар', 'Утепов', 'gk', 13, 25, 'recovery'],
    ['a14', 'Артём', 'Гриценко', 'fw', 14, 23, 'ok'],
    ['a15', 'Мирас', 'Тулегенов', 'cf', 15, 26, 'ok'],
    ['a16', 'Кирилл', 'Зайцев', 'df', 16, 28, 'hrv'],
    ['a17', 'Ержан', 'Абдиров', 'fw', 17, 22, 'ok'],
    ['a18', 'Павел', 'Мельник', 'fw', 18, 29, 'ok'],
    ['a19', 'Алибек', 'Сарсенов', 'df', 19, 24, 'ok'],
    ['a20', 'Глеб', 'Никитин', 'fw', 20, 20, 'nodata'],
    ['a21', 'Нурлан', 'Есенов', 'cf', 21, 27, 'ok'],
    ['a22', 'Егор', 'Литвинов', 'fw', 22, 25, 'recovery'],
    ['a23', 'Олжас', 'Бектуров', 'df', 23, 26, 'ok'],
    ['a24', 'Виктор', 'Шевчук', 'fw', 24, 30, 'ok']
  ];

  var LABS = [
    { key: 'ferritin', name: 'Ферритин', unit: 'мкг/л', lo: 30, hi: 300, src: 'lab', dec: 0 },
    { key: 'vitd', name: 'Витамин D (25-OH)', unit: 'нг/мл', lo: 30, hi: 100, src: 'lab', dec: 0 },
    { key: 'hb', name: 'Гемоглобин', unit: 'г/л', lo: 130, hi: 170, src: 'lab', dec: 0 },
    { key: 'cortisol', name: 'Кортизол (утро)', unit: 'нмоль/л', lo: 140, hi: 690, src: 'lab', dec: 0 },
    { key: 'testo', name: 'Тестостерон', unit: 'нмоль/л', lo: 8.6, hi: 29, src: 'lab', dec: 1 },
    { key: 'ck', name: 'Креатинкиназа (КК)', unit: 'Ед/л', lo: 39, hi: 308, src: 'lab', dec: 0 },
    { key: 'crp', name: 'С-реактивный белок', unit: 'мг/л', lo: 0, hi: 5, src: 'lab', dec: 1 }
  ];
  var WEAR = [
    { key: 'hrv', name: 'HRV (ночной rMSSD)', unit: 'мс', src: 'wear', dec: 0 },
    { key: 'rhr', name: 'Пульс покоя', unit: 'уд/мин', lo: 38, hi: 60, src: 'wear', dec: 0 },
    { key: 'sleep', name: 'Длительность сна', unit: 'ч', lo: 7, hi: 10, src: 'wear', dec: 1 },
    { key: 'resp', name: 'Частота дыхания (сон)', unit: 'в мин', lo: 12, hi: 20, src: 'wear', dec: 1 },
    { key: 'temp', name: 'Отклонение температуры', unit: '°C', lo: -0.5, hi: 0.5, src: 'wear', dec: 1 }
  ];

  function dayDate(today, offsetFromToday) {
    var d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    d.setDate(d.getDate() - offsetFromToday);
    return d;
  }

  function buildAthlete(row, idx, today) {
    var rnd = mulberry32(1000 + idx * 7919);
    var id = row[0], prof = row[6], pos = row[3];
    var baseHrv = 58 + rnd() * 34;
    var baseSleep = 7.4 + rnd() * 0.8;
    var baseRhr = 45 + rnd() * 10;
    var baseLoad = pos === 'gk' ? 360 + rnd() * 80 : 470 + rnd() * 120;
    var baseThrows = pos === 'gk' ? 0 : 120 + rnd() * 70;

    var days = [];
    for (var i = DAYS - 1; i >= 0; i--) {
      var d = dayDate(today, i);
      var cyc = i % 7;            // недельный микроцикл, не зависит от календаря
      var rest = cyc === 3;
      var n = function (s) { return (rnd() - 0.5) * 2 * s; };
      var hrv = baseHrv * (1 + n(0.08));
      var sleep = baseSleep + n(0.45);
      var rhr = baseRhr + n(2.5);
      var load = rest ? 40 + rnd() * 40 : baseLoad * (1 + n(0.18)) * (cyc === 4 ? 1.15 : 1);
      var throws = rest || pos === 'gk' ? 0 : baseThrows * (1 + n(0.2));
      var resp = 14 + n(1.2);
      var temp = n(0.18);

      // profile shaping in the last days (i = days ago)
      if (prof === 'overload' && i <= 6) { load *= 1.5; throws *= 1.45; if (i <= 3) hrv *= 0.84; }
      if (prof === 'sleep' && i <= 5) { sleep = 6.4 + rnd() * 0.5; hrv *= 0.93; }
      if (prof === 'hrv' && i <= 2) { hrv *= 0.79; rhr += 4; }
      if (prof === 'recovery' && i <= 4) { hrv *= 0.88; sleep -= 0.4; rhr += 3; }
      if (prof === 'lowD') { sleep -= 0.1; }

      var missing = prof === 'nodata' && i <= 9;
      days.push({
        date: d,
        hrv: missing ? null : round(hrv, 1),
        sleep: missing ? null : round(clamp(sleep, 4.5, 10), 2),
        rhr: missing ? null : round(rhr, 0),
        load: round(load, 0),
        throws: round(throws, 0),
        resp: missing ? null : round(resp, 1),
        temp: missing ? null : round(temp, 1)
      });
    }

    // derived per day
    for (var k = 0; k < days.length; k++) {
      var dd = days[k];
      var hist = days.slice(Math.max(0, k - 28), k).filter(function (x) { return x.hrv != null; });
      var base = hist.length >= 7 ? median(hist.map(function (x) { return x.hrv; })) : baseHrv;
      var acute = mean(days.slice(Math.max(0, k - 6), k + 1).map(function (x) { return x.load; }));
      var chronic = mean(days.slice(Math.max(0, k - 27), k + 1).map(function (x) { return x.load; })) || 1;
      var thrA = mean(days.slice(Math.max(0, k - 6), k + 1).map(function (x) { return x.throws; }));
      var thrC = mean(days.slice(Math.max(0, k - 27), k + 1).map(function (x) { return x.throws; })) || 1;
      dd.hrvBase = round(base, 1);
      dd.acwr = round(acute / chronic, 2);
      dd.throwRatio = pos === 'gk' ? 1 : round(thrA / thrC, 2);
      if (dd.hrv == null) { dd.recovery = null; dd.readiness = null; dd.risk = null; continue; }
      var hr = dd.hrv / base;
      var sleepScore = clamp((dd.sleep - 5.5) / 2.8, 0, 1);
      var rhrScore = clamp((62 - dd.rhr) / 18, 0, 1);
      var recovery = 100 * (0.5 * clamp((hr - 0.72) / 0.36, 0, 1) + 0.35 * sleepScore + 0.15 * rhrScore);
      var loadPenalty = clamp((dd.acwr - 1.1) / 0.5, 0, 1) * 18;
      var readiness = 0.75 * recovery + 25 - loadPenalty;
      dd.recovery = Math.round(clamp(recovery, 20, 99));
      dd.readiness = Math.round(clamp(readiness, 20, 99));

      var risk = 6 + rnd() * 6;
      if (hr < 0.85) risk += 18;
      if (dd.sleep < 7) risk += 9;
      if (dd.acwr > 1.25) risk += 16;
      if (dd.throwRatio > 1.25) risk += 10;
      dd.risk = Math.round(clamp(risk, 3, 85));
    }

    // labs: current panel (~9 days ago) and previous (~55 days ago)
    function lab(lo, hi, bias) { return lo + (hi - lo) * clamp(bias + (rnd() - 0.5) * 0.25, 0.05, 0.95); }
    var labs = {
      ferritin: round(lab(30, 180, 0.45), 0),
      vitd: round(lab(30, 70, 0.45), 0),
      hb: round(lab(132, 168, 0.55), 0),
      cortisol: round(lab(180, 620, 0.45), 0),
      testo: round(lab(11, 27, 0.5), 1),
      ck: round(lab(90, 300, 0.45), 0),
      crp: round(lab(0.2, 3.5, 0.3), 1)
    };
    if (prof === 'overload') { labs.ck = 486; labs.cortisol = 655; }
    if (prof === 'lowD') { labs.vitd = 21; labs.ferritin = 27; }
    if (id === 'a13') { labs.crp = 6.2; }
    var prevLabs = {};
    Object.keys(labs).forEach(function (k) { prevLabs[k] = round(labs[k] * (0.88 + rnd() * 0.24), LABS.filter(function (l) { return l.key === k; })[0].dec); });

    return {
      id: id, first: row[1], last: row[2], name: row[2] + ' ' + row[1], short: row[1] + ' ' + row[2],
      initials: (row[2][0] + row[1][0]).toUpperCase(), pos: pos, posName: POS[pos], num: row[4], age: row[5],
      profile: prof, days: days, labs: labs, prevLabs: prevLabs,
      labDate: dayDate(today, 9), prevLabDate: dayDate(today, 55), custom: false
    };
  }

  function buildCustom(c, idx, today) {
    var days = [];
    for (var i = DAYS - 1; i >= 0; i--) {
      days.push({ date: dayDate(today, i), hrv: null, sleep: null, rhr: null, load: 0, throws: 0, resp: null, temp: null, hrvBase: null, acwr: null, throwRatio: null, recovery: null, readiness: null, risk: null });
    }
    var parts = String(c.name).trim().split(/\s+/);
    var initials = parts.length > 1 ? (parts[0][0] + parts[1][0]) : (parts[0] ? parts[0].slice(0, 2) : '—');
    return {
      id: c.id, first: parts.slice(1).join(' '), last: parts[0] || c.name, name: c.name, short: c.name,
      initials: initials.toUpperCase(), pos: c.pos, posName: POS[c.pos] || c.pos, num: c.num, age: null,
      profile: 'nodata', days: days, labs: null, prevLabs: null, labDate: null, prevLabDate: null, custom: true
    };
  }

  /* Snapshot for a given "as of" offset (0 = today, 1 = yesterday ...) */
  function snapshot(a, offset) {
    var idx = a.days.length - 1 - offset;
    var d = a.days[idx];
    var prev = a.days[idx - 7] || d;
    var s = {
      date: d.date, readiness: d.readiness, recovery: d.recovery, risk: d.risk,
      hrv: d.hrv, hrvBase: d.hrvBase, sleep: d.sleep, rhr: d.rhr, acwr: d.acwr, throwRatio: d.throwRatio,
      load: d.load, resp: d.resp, temp: d.temp,
      prevReadiness: prev.readiness, prevRecovery: prev.recovery
    };
    // flags (orange flags): rules relative to personal baseline
    var flags = [];
    if (d.hrv == null) {
      s.status = 'nodata';
    } else {
      var hrvPct = Math.round((d.hrv / d.hrvBase - 1) * 100);
      s.hrvPct = hrvPct;
      var lowStreak = 0;
      for (var j = idx; j >= 0 && j > idx - 5; j--) { var x = a.days[j]; if (x.hrv != null && x.hrv < 0.85 * x.hrvBase) lowStreak++; else break; }
      s.lowStreak = lowStreak;
      if (d.acwr > 1.25) flags.push({ k: 'load', t: 'Нагрузка +' + Math.round((d.acwr - 1) * 100) + '% (ACWR ' + String(d.acwr).replace('.', ',') + ')' });
      if (d.throwRatio > 1.25) flags.push({ k: 'throws', t: 'Бросковая нагрузка +' + Math.round((d.throwRatio - 1) * 100) + '%' });
      if (hrvPct <= -15) flags.push({ k: 'hrv', t: 'HRV ' + hrvPct + '% к личной норме' + (lowStreak >= 2 ? ' · ' + lowStreak + ' дн. подряд' : '') });
      if (d.sleep < 7) flags.push({ k: 'sleep', t: 'Сон ' + fmtHours(d.sleep) });
      if (d.rhr > (mean(a.days.slice(idx - 28, idx).map(function (x) { return x.rhr || 0; })) + 4)) flags.push({ k: 'rhr', t: 'Пульс покоя +' + Math.round(d.rhr - mean(a.days.slice(idx - 28, idx).map(function (x) { return x.rhr || 0; }))) + ' уд/мин' });
      if (a.labs && a.labs.ck > 308) flags.push({ k: 'ck', t: 'КК ' + a.labs.ck + ' Ед/л' });
      if (a.labs && a.labs.vitd < 30) flags.push({ k: 'vitd', t: 'Витамин D ' + a.labs.vitd + ' нг/мл' });
      if (a.labs && a.labs.crp > 5) flags.push({ k: 'crp', t: 'СРБ ' + String(a.labs.crp).replace('.', ',') + ' мг/л' });

      var kinds = flags.map(function (f) { return f.k; });
      if ((kinds.indexOf('load') > -1 || kinds.indexOf('throws') > -1) && kinds.indexOf('hrv') > -1) s.signal = 'Риск перегрузки плечевого сустава';
      else if (kinds.indexOf('sleep') > -1 && d.recovery < 70) s.signal = 'Недостаточное восстановление';
      else if (kinds.indexOf('hrv') > -1) s.signal = 'Снижение вариабельности пульса';
      else if (kinds.indexOf('crp') > -1) s.signal = 'Признаки воспаления — нужна оценка врача';
      else if (kinds.indexOf('vitd') > -1) s.signal = 'Дефицит витамина D и низкий ферритин';
      else s.signal = null;

      var physio = flags.filter(function (f) { return ['load', 'throws', 'hrv', 'sleep', 'rhr'].indexOf(f.k) > -1; }).length;
      if (d.risk >= 40 || d.readiness < 55 || physio >= 2) s.status = 'attention';
      else if (d.recovery < 64 || kinds.indexOf('crp') > -1) s.status = 'recovery';
      else s.status = 'ready';
    }
    s.flags = flags;
    return s;
  }

  function fmtHours(h) {
    if (h == null) return '—';
    var hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    if (mm === 60) { hh++; mm = 0; }
    return hh + ' ч ' + (mm < 10 ? '0' : '') + mm + ' мин';
  }

  function factorBreakdown(a, offset) {
    var s = snapshot(a, offset);
    if (s.status === 'nodata') return [];
    var f = [];
    f.push({ name: 'Отклонение HRV от личной нормы', v: clamp(-(s.hrvPct || 0) * 1.4, 0, 40) });
    f.push({ name: 'Острая/хроническая нагрузка', v: clamp(((s.acwr || 1) - 1) * 90, 0, 40) });
    f.push({ name: 'Бросковая нагрузка', v: clamp(((s.throwRatio || 1) - 1) * 70, 0, 30) });
    f.push({ name: 'Недосып', v: clamp((7.5 - (s.sleep || 8)) * 14, 0, 30) });
    f.push({ name: 'Пульс покоя', v: clamp(((s.rhr || 50) - 52) * 1.6, 0, 18) });
    var total = f.reduce(function (t, x) { return t + x.v; }, 0) || 1;
    return f.map(function (x) { return { name: x.name, v: Math.round(x.v), share: Math.round((x.v / total) * 100) }; })
      .sort(function (p, q) { return q.v - p.v; });
  }

  function build(options) {
    options = options || {};
    var today = options.today || new Date();
    var athletes = ROSTER.map(function (r, i) { return buildAthlete(r, i, today); });
    (options.custom || []).forEach(function (c, i) { athletes.push(buildCustom(c, i, today)); });
    return { today: today, athletes: athletes, DAYS: DAYS, VISIBLE: VISIBLE, LABS: LABS, WEAR: WEAR, POS: POS };
  }

  global.ASPData = {
    build: build, snapshot: snapshot, factorBreakdown: factorBreakdown,
    fmtHours: fmtHours, mean: mean, median: median, clamp: clamp, round: round, POS: POS
  };
})(window);
