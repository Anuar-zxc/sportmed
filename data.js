/* AI Sports Precision Medicine — модель данных демо-кабинета
   Все спортсмены и измерения вымышленные и детерминированы (seed), чтобы демо выглядело одинаково у всех.
   Индексы готовности и восстановления (0–100) — прозрачные правила относительно личной нормы.
   Риск травмы и прогноз самочувствия на завтра считают обученные модели (model.js, models.js). */
(function (global) {
  'use strict';

  var DAYS = 84;          // 12 недель истории: личные нормы для моделей + графики
  var VISIBLE = 30;       // показываем в графиках
  var ML = global.ASPML;
  var RR_HIGH = 1.5;      // риск травмы ≥ 1,5 × среднего уровня — сигнал «требует внимания» (≈ 8% дней с наибольшим риском в обучающих данных)
  var RR_MID = 1.2;

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
  function nn(v) { return v == null || v !== v ? NaN : v; }

  var POS = { gk: 'Вратарь', df: 'Защитник', mf: 'Полузащитник', fw: 'Нападающий' };

  // profile: ok | overload | sleep | hrv | recovery | nodata | lowD
  var ROSTER = [
    ['a01', 'Арман', 'Сейткали', 'gk', 1, 27, 'ok'],
    ['a02', 'Даниил', 'Ким', 'df', 2, 24, 'ok'],
    ['a03', 'Ерлан', 'Жаксылыков', 'mf', 3, 28, 'overload'],
    ['a04', 'Тимур', 'Ахметов', 'fw', 4, 23, 'ok'],
    ['a05', 'Алексей', 'Воронцов', 'df', 5, 29, 'ok'],
    ['a06', 'Бауыржан', 'Омаров', 'fw', 6, 22, 'sleep'],
    ['a07', 'Руслан', 'Ибраев', 'fw', 7, 25, 'ok'],
    ['a08', 'Максим', 'Белов', 'mf', 8, 26, 'hrv'],
    ['a09', 'Нуржан', 'Касенов', 'df', 9, 30, 'ok'],
    ['a10', 'Илья', 'Сорокин', 'fw', 10, 21, 'ok'],
    ['a11', 'Айдос', 'Мукашев', 'fw', 11, 24, 'lowD'],
    ['a12', 'Дмитрий', 'Лаптев', 'df', 12, 27, 'ok'],
    ['a13', 'Санжар', 'Утепов', 'gk', 13, 25, 'recovery'],
    ['a14', 'Артём', 'Гриценко', 'fw', 14, 23, 'ok'],
    ['a15', 'Мирас', 'Тулегенов', 'mf', 15, 26, 'ok'],
    ['a16', 'Кирилл', 'Зайцев', 'df', 16, 28, 'hrv'],
    ['a17', 'Ержан', 'Абдиров', 'fw', 17, 22, 'ok'],
    ['a18', 'Павел', 'Мельник', 'fw', 18, 29, 'ok'],
    ['a19', 'Алибек', 'Сарсенов', 'df', 19, 24, 'ok'],
    ['a20', 'Глеб', 'Никитин', 'fw', 20, 20, 'nodata'],
    ['a21', 'Нурлан', 'Есенов', 'mf', 21, 27, 'ok'],
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
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

  /* ---------- ряды для моделей ---------- */
  function seriesOf(days) {
    var s = { load: [], hi: [], sessions: [], strength: [], exertion: [], recovery: [], srpe: [],
      fatigue: [], mood: [], readiness: [], sleep_duration: [], sleep_quality: [], soreness: [], stress: [] };
    days.forEach(function (d) {
      var w = d.well || {};
      s.load.push(nn(d.load)); s.srpe.push(nn(d.load)); s.hi.push(nn(d.hi));
      s.sessions.push(nn(d.sessions)); s.strength.push(nn(d.strength));
      s.exertion.push(d.rpe == null ? NaN : d.rpe / 10);
      ['fatigue', 'mood', 'readiness', 'sleep_quality', 'soreness', 'stress'].forEach(function (k) { s[k].push(nn(w[k])); });
      s.sleep_duration.push(nn(w.sleep_duration != null ? w.sleep_duration : d.sleep));
      // потребность в восстановлении 0..1 (выше — хуже): из усталости и болезненности чек-ина
      s.recovery.push(w.fatigue != null && w.soreness != null ? ((5 - w.fatigue) + (5 - w.soreness)) / 8 : NaN);
    });
    return s;
  }

  function applyML(a) {
    a.series = seriesOf(a.days);
    if (!ML || !ML.ready) return;
    var s = a.series;
    for (var k = 0; k < a.days.length; k++) {
      var dd = a.days[k];
      var p = ML.personalNorms(s, k);
      var x = ML.injuryFeaturesAt(s, k, p);
      dd.injX = null; dd.inj = null; dd.risk = null; dd.rr = null;
      if (x[0] === x[0]) { // есть нагрузка за неделю и личная норма
        var r = ML.predictInjury(x);
        dd.injX = x; dd.inj = r;
        dd.risk = Math.max(0.1, round(r.week * 100, 1));
        dd.rr = r.rr;
      }
      dd.fc = null;
      if (s.readiness[k] === s.readiness[k] && k >= 7) dd.fc = ML.predictReadiness(ML.readinessFeaturesAt(s, k));
    }
  }

  /* Пользовательские чек-ины перекрывают демо-значения за соответствующий день */
  function applyCheckins(a, list) {
    (list || []).slice().reverse().forEach(function (c) {
      var d = new Date(c.ts);
      var k = -1;
      for (var i = a.days.length - 1; i >= 0; i--) if (sameDay(a.days[i].date, d)) { k = i; break; }
      if (k < 0) return;
      var w = a.days[k].well = Object.assign({}, a.days[k].well || {});
      if (c.mood != null) w.mood = c.mood;
      if (c.stress != null) w.stress = 6 - c.stress;          // в модели 5 = спокоен
      if (c.sleepq != null) w.sleep_quality = c.sleepq;
      if (c.soreness != null) w.soreness = 6 - c.soreness;    // в модели 5 = нет болезненности
      if (c.fatigue != null) w.fatigue = 6 - c.fatigue;       // в модели 5 = свеж
      if (c.readiness != null) w.readiness = c.readiness;
      if (c.sleeph != null) w.sleep_duration = c.sleeph;
      if (c.rpe != null && c.dur != null && k > 0) {           // вчерашняя тренировка: sRPE = RPE × минуты
        var y = a.days[k - 1], share = y.load > 0 ? (y.hi || 0) / y.load : 0.06;
        y.load = Math.round(c.rpe * c.dur);
        y.hi = Math.round(y.load * share);
        y.rpe = y.load > 0 ? c.rpe : null;
        y.sessions = y.load > 0 ? Math.max(1, y.sessions || 0) : 0;
        y.userLoad = true;
      }
      a.days[k].userCheckin = true;
    });
  }

  function buildAthlete(row, idx, today, checkins) {
    var rnd = mulberry32(1000 + idx * 7919);
    var id = row[0], prof = row[6], pos = row[3];
    var baseHrv = 58 + rnd() * 34;
    var baseSleep = 7.4 + rnd() * 0.8;
    var baseRhr = 45 + rnd() * 10;
    var baseLoad = pos === 'gk' ? 380 + rnd() * 80 : 480 + rnd() * 120;   // sRPE, у.е. (RPE × минуты)
    var baseHi = 0.04 + rnd() * 0.05;                                        // доля высокоинтенсивной работы
    var baseRpe = 4.8 + rnd() * 1.4;
    var baseReady = 6.4 + rnd() * 1.3;                                       // самооценка готовности 0–10
    var n = function (s) { return (rnd() - 0.5) * 2 * s; };

    var days = [];
    for (var i = DAYS - 1; i >= 0; i--) {
      var d = dayDate(today, i);
      var cyc = i % 7;            // недельный микроцикл, не зависит от календаря
      var rest = cyc === 3;
      var hrv = baseHrv * (1 + n(0.08));
      var sleep = baseSleep + n(0.45);
      var rhr = baseRhr + n(2.5);
      var load = rest ? 0 : baseLoad * (1 + n(0.18)) * (cyc === 4 ? 1.15 : 1);
      var hiShare = rest ? 0 : clamp(baseHi * (1 + n(0.5)) * (cyc === 4 ? 1.6 : 1), 0, 0.5);
      var rpe = rest ? null : clamp(Math.round(baseRpe + n(1.2) + (cyc === 4 ? 1.3 : 0)), 2, 10);
      var sessions = rest ? 0 : (cyc === 1 || cyc === 5 ? 2 : 1);
      var strength = !rest && (cyc === 1 || cyc === 5) ? 1 : 0;
      var resp = 14 + n(1.2);
      var temp = n(0.18);

      // профиль в последние дни (i = дней назад)
      if (prof === 'overload' && i <= 6 && !rest) { load *= 1.5; hiShare = clamp(hiShare * 2.2, 0, 0.5); rpe = clamp(rpe + 2, 2, 10); sessions = 2; if (i <= 3) hrv *= 0.84; }
      if (prof === 'overload' && i <= 6 && rest) { load = baseLoad * 0.7; rpe = clamp(Math.round(baseRpe), 2, 10); sessions = 1; }
      if (prof === 'sleep' && i <= 5) { sleep = 6.4 + rnd() * 0.5; hrv *= 0.93; }
      if (prof === 'hrv' && i <= 2) { hrv *= 0.79; rhr += 4; }
      if (prof === 'recovery' && i <= 4) { hrv *= 0.88; sleep -= 0.4; rhr += 3; if (!rest) rpe = clamp(rpe + 1, 2, 10); }
      if (prof === 'lowD') { sleep -= 0.1; }

      var missing = prof === 'nodata' && i <= 9;
      days.push({
        date: d,
        hrv: missing ? null : round(hrv, 1),
        sleep: missing ? null : round(clamp(sleep, 4.5, 10), 2),
        rhr: missing ? null : round(rhr, 0),
        load: round(load, 0),
        hi: round(load * hiShare, 0),
        rpe: rpe, sessions: sessions, strength: strength,
        resp: missing ? null : round(resp, 1),
        temp: missing ? null : round(temp, 1),
        _i: i, _rest: rest
      });
    }

    // производные: индексы по правилам + утренний чек-ин (шкалы как в SoccerMon: 1–5, выше = лучше)
    for (var k = 0; k < days.length; k++) {
      var dd = days[k];
      var hist = days.slice(Math.max(0, k - 28), k).filter(function (x) { return x.hrv != null; });
      var base = hist.length >= 7 ? median(hist.map(function (x) { return x.hrv; })) : baseHrv;
      var acute = mean(days.slice(Math.max(0, k - 6), k + 1).map(function (x) { return x.load; }));
      var chronic = mean(days.slice(Math.max(0, k - 27), k + 1).map(function (x) { return x.load; })) || 1;
      var hiA = mean(days.slice(Math.max(0, k - 6), k + 1).map(function (x) { return x.hi; }));
      var hiC = mean(days.slice(Math.max(0, k - 27), k + 1).map(function (x) { return x.hi; })) || 1;
      dd.hrvBase = round(base, 1);
      dd.acwr = round(acute / chronic, 2);
      dd.hiRatio = round(hiA / hiC, 2);
      if (dd.hrv == null) { dd.recovery = null; dd.readiness = null; dd.well = null; continue; }
      var hr = dd.hrv / base;
      var sleepScore = clamp((dd.sleep - 5.5) / 2.8, 0, 1);
      var rhrScore = clamp((62 - dd.rhr) / 18, 0, 1);
      var recovery = 100 * (0.5 * clamp((hr - 0.72) / 0.36, 0, 1) + 0.35 * sleepScore + 0.15 * rhrScore);
      var loadPenalty = clamp((dd.acwr - 1.1) / 0.5, 0, 1) * 18;
      var readiness = 0.75 * recovery + 25 - loadPenalty;
      dd.recovery = Math.round(clamp(recovery, 20, 99));
      dd.readiness = Math.round(clamp(readiness, 20, 99));

      var prevLoad = k > 0 ? days[k - 1].load : baseLoad;
      var heavy = prof === 'overload' && dd._i <= 6;
      var r10 = clamp(Math.round(baseReady + 4 * (hr - 1) + 0.6 * (dd.sleep - baseSleep) - (heavy ? 1.6 : 0) + n(1.0)), 1, 10);
      var skip = rnd() < 0.05; // иногда спортсмен не заполняет чек-ин
      dd.well = skip ? null : {
        readiness: r10,
        fatigue: clamp(Math.round(3 + 0.5 * (r10 - baseReady) + n(0.7) - (heavy ? 0.8 : 0)), 1, 5),
        soreness: clamp(Math.round(3 - 1.4 * (prevLoad / baseLoad - 1) + n(0.7) - (heavy ? 0.8 : 0)), 1, 5),
        sleep_quality: clamp(Math.round(3 + 0.9 * (dd.sleep - baseSleep) + n(0.6)), 1, 5),
        stress: clamp(Math.round(3.1 + n(0.8)), 1, 5),
        mood: clamp(Math.round(3.2 + 0.3 * (r10 - baseReady) + n(0.7)), 1, 5)
      };
    }

    // анализы: текущая панель (~9 дней назад) и предыдущая (~55 дней назад)
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
    Object.keys(labs).forEach(function (k2) { prevLabs[k2] = round(labs[k2] * (0.88 + rnd() * 0.24), LABS.filter(function (l) { return l.key === k2; })[0].dec); });

    var a = {
      id: id, first: row[1], last: row[2], name: row[2] + ' ' + row[1], short: row[1] + ' ' + row[2],
      initials: (row[2][0] + row[1][0]).toUpperCase(), pos: pos, posName: POS[pos], num: row[4], age: row[5],
      profile: prof, days: days, labs: labs, prevLabs: prevLabs,
      labDate: dayDate(today, 9), prevLabDate: dayDate(today, 55), custom: false
    };
    applyCheckins(a, checkins[id]);
    applyML(a);
    return a;
  }

  /* ---------- Режим «Моя команда»: спортсмен из реальных записей ---------- */
  function isoOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  function buildPilotAthlete(p, today, records) {
    var rec = records[p.id] || {};
    var dates = Object.keys(rec).sort();
    var span = DAYS;
    if (dates.length) {
      var first = new Date(dates[0] + 'T00:00:00');
      var diff = Math.round((dayDate(today, 0) - first) / 86400000) + 1;
      span = clamp(Math.max(DAYS, diff), DAYS, 420);
    }
    var days = [];
    for (var i = span - 1; i >= 0; i--) {
      var d = dayDate(today, i);
      var r = rec[isoOf(d)] || null;
      var hasWell = r && ['readiness', 'fatigue', 'soreness', 'sleep_quality', 'stress', 'mood'].some(function (k) { return r[k] != null; });
      days.push({
        date: d,
        hrv: null, rhr: null, resp: null, temp: null,
        sleep: r && r.sleep_hours != null ? r.sleep_hours : null,
        load: r && r.srpe != null ? r.srpe : null,
        hi: r && r.hi != null ? r.hi : (r && r.srpe === 0 ? 0 : null),
        rpe: r && r.rpe != null ? r.rpe : null,
        sessions: r && r.sessions != null ? r.sessions : (r && r.srpe != null ? (r.srpe > 0 ? 1 : 0) : null),
        strength: r && r.strength != null ? r.strength : (r && r.srpe != null ? 0 : null),
        well: hasWell ? {
          readiness: r.readiness != null ? r.readiness : null,
          fatigue: r.fatigue != null ? r.fatigue : null,
          soreness: r.soreness != null ? r.soreness : null,
          sleep_quality: r.sleep_quality != null ? r.sleep_quality : null,
          stress: r.stress != null ? r.stress : null,
          mood: r.mood != null ? r.mood : null
        } : null,
        noteTxt: r && r.note ? String(r.note).slice(0, 300) : null,
        userCheckin: !!hasWell
      });
    }
    // производные от нагрузки (ACWR и доля интенсивного считаются по известным дням)
    for (var k = 0; k < days.length; k++) {
      var dd = days[k];
      function windowVals(from, key) {
        var out = [];
        for (var j = Math.max(0, k - from + 1); j <= k; j++) { var v = days[j][key]; if (v != null) out.push(v); }
        return out;
      }
      var a7 = windowVals(7, 'load'), a28 = windowVals(28, 'load');
      dd.known7 = a7.length; dd.known28 = a28.length;
      dd.acwr = (a7.length >= 4 && a28.length >= 14 && mean(a28) > 0) ? round(mean(a7) / mean(a28), 2) : null;
      var h7 = windowVals(7, 'hi'), h28 = windowVals(28, 'hi');
      dd.hiRatio = (h7.length >= 4 && h28.length >= 14 && mean(h28) > 0) ? round(mean(h7) / mean(h28), 2) : null;
      dd.hrvBase = null;
      dd.recovery = null; dd.readiness = null;
      var w = dd.well;
      if (w && w.readiness != null) dd.readiness = Math.round(clamp(w.readiness * 10, 5, 99));
      if (w && w.fatigue != null && w.soreness != null) {
        var parts = [w.fatigue, w.soreness, w.sleep_quality != null ? w.sleep_quality : 3];
        dd.recovery = Math.round(clamp(mean(parts) / 5 * 100, 20, 99));
      }
    }
    var parts = String(p.name).trim().split(/\s+/);
    var initials = parts.length > 1 ? (parts[0][0] + parts[1][0]) : (parts[0] ? parts[0].slice(0, 2) : '—');
    var a = {
      id: p.id, first: parts.slice(1).join(' '), last: parts[0] || p.name, name: p.name, short: p.name,
      initials: initials.toUpperCase(), pos: p.pos, posName: POS[p.pos] || p.pos || 'Спортсмен', num: p.num, age: p.age || null,
      profile: 'pilot', days: days, labs: null, prevLabs: null, labDate: null, prevLabDate: null,
      custom: false, pilot: true, recDays: dates.length
    };
    applyML(a);
    return a;
  }

  function buildCustom(c, idx, today, checkins) {
    var days = [];
    for (var i = DAYS - 1; i >= 0; i--) {
      days.push({ date: dayDate(today, i), hrv: null, sleep: null, rhr: null, load: null, hi: null, rpe: null, sessions: null, strength: null, resp: null, temp: null, hrvBase: null, acwr: null, hiRatio: null, recovery: null, readiness: null, risk: null, well: null });
    }
    var parts = String(c.name).trim().split(/\s+/);
    var initials = parts.length > 1 ? (parts[0][0] + parts[1][0]) : (parts[0] ? parts[0].slice(0, 2) : '—');
    var a = {
      id: c.id, first: parts.slice(1).join(' '), last: parts[0] || c.name, name: c.name, short: c.name,
      initials: initials.toUpperCase(), pos: c.pos, posName: POS[c.pos] || (c.pos === 'cf' ? POS.mf : c.pos), num: c.num, age: null,
      profile: 'nodata', days: days, labs: null, prevLabs: null, labDate: null, prevLabDate: null, custom: true
    };
    applyCheckins(a, checkins[c.id]);
    applyML(a);
    return a;
  }

  /* Срез на дату (offset: 0 = сегодня, 1 = вчера …) */
  function snapshot(a, offset) {
    var idx = a.days.length - 1 - offset;
    var d = a.days[idx];
    var prev = a.days[idx - 7] || d;
    var s = {
      date: d.date, readiness: d.readiness, recovery: d.recovery, risk: d.risk, rr: d.rr, inj: d.inj, injX: d.injX,
      fc: d.fc, well: d.well, userCheckin: !!d.userCheckin,
      hrv: d.hrv, hrvBase: d.hrvBase, sleep: d.sleep, rhr: d.rhr, acwr: d.acwr, hiRatio: d.hiRatio,
      load: d.load, resp: d.resp, temp: d.temp,
      prevReadiness: prev.readiness, prevRecovery: prev.recovery
    };
    var flags = [];
    if (d.hrv == null && a.pilot) {
      var w = d.well;
      s.pilot = true;
      s.known7 = d.known7 || 0;
      var recentCheckin = !!w || !!(a.days[idx - 1] && a.days[idx - 1].well);
      if (!recentCheckin && !d.known7) {
        s.status = 'nodata';
      } else {
        if (d.acwr != null && d.acwr > 1.25) flags.push({ k: 'load', t: 'Нагрузка +' + Math.round((d.acwr - 1) * 100) + '% (ACWR ' + String(d.acwr).replace('.', ',') + ')' });
        if (d.hiRatio != null && d.hiRatio > 1.3) flags.push({ k: 'hi', t: 'Интенсивная работа +' + Math.round((d.hiRatio - 1) * 100) + '%' });
        if (d.sleep != null && d.sleep < 7) flags.push({ k: 'sleep', t: 'Сон ' + fmtHours(d.sleep) });
        if (w && w.readiness != null && w.readiness <= 4) flags.push({ k: 'self', t: 'Самооценка готовности ' + w.readiness + '/10' });
        if (w && w.soreness != null && w.soreness <= 2) flags.push({ k: 'sore', t: 'Выраженная болезненность (' + w.soreness + '/5)' });
        if (d.rr != null && d.rr >= RR_HIGH) flags.push({ k: 'model', t: 'Модель: риск ×' + String(round(d.rr, 1)).replace('.', ',') + ' к среднему' });
        var kindsP = flags.map(function (f) { return f.k; });
        function hasP(k) { return kindsP.indexOf(k) > -1; }
        if ((hasP('load') || hasP('hi')) && hasP('model')) s.signal = 'Риск перегрузки';
        else if (hasP('model')) s.signal = 'Повышенный риск травмы по модели';
        else if (hasP('self') && hasP('sore')) s.signal = 'Плохое самочувствие — нужен разговор со специалистом';
        else if (hasP('self')) s.signal = 'Низкая самооценка готовности';
        else if (hasP('sleep') && hasP('sore')) s.signal = 'Недостаточное восстановление';
        else s.signal = null;
        if ((d.rr != null && d.rr >= RR_HIGH) || (w && w.readiness != null && w.readiness <= 3) || flags.length >= 3) s.status = 'attention';
        else if (hasP('self') || hasP('sore') || (d.recovery != null && d.recovery < 55)) s.status = 'recovery';
        else if (!w) s.status = 'nocheckin';
        else s.status = 'ready';
      }
      s.flags = flags;
      return s;
    }
    if (d.hrv == null) {
      s.status = 'nodata';
    } else {
      var hrvPct = Math.round((d.hrv / d.hrvBase - 1) * 100);
      s.hrvPct = hrvPct;
      var lowStreak = 0;
      for (var j = idx; j >= 0 && j > idx - 5; j--) { var x = a.days[j]; if (x.hrv != null && x.hrv < 0.85 * x.hrvBase) lowStreak++; else break; }
      s.lowStreak = lowStreak;
      var rhrMean = mean(a.days.slice(idx - 28, idx).map(function (x) { return x.rhr || 0; }));
      if (d.acwr > 1.25) flags.push({ k: 'load', t: 'Нагрузка +' + Math.round((d.acwr - 1) * 100) + '% (ACWR ' + String(d.acwr).replace('.', ',') + ')' });
      if (d.hiRatio > 1.3) flags.push({ k: 'hi', t: 'Интенсивная работа +' + Math.round((d.hiRatio - 1) * 100) + '%' });
      if (hrvPct <= -15) flags.push({ k: 'hrv', t: 'HRV ' + hrvPct + '% к личной норме' + (lowStreak >= 2 ? ' · ' + lowStreak + ' дн. подряд' : '') });
      if (d.sleep < 7) flags.push({ k: 'sleep', t: 'Сон ' + fmtHours(d.sleep) });
      if (d.rhr > rhrMean + 4) flags.push({ k: 'rhr', t: 'Пульс покоя +' + Math.round(d.rhr - rhrMean) + ' уд/мин' });
      if (d.rr != null && d.rr >= RR_HIGH) flags.push({ k: 'model', t: 'Модель: риск ×' + String(round(d.rr, 1)).replace('.', ',') + ' к среднему' });
      if (a.labs && a.labs.ck > 308) flags.push({ k: 'ck', t: 'КК ' + a.labs.ck + ' Ед/л' });
      if (a.labs && a.labs.vitd < 30) flags.push({ k: 'vitd', t: 'Витамин D ' + a.labs.vitd + ' нг/мл' });
      if (a.labs && a.labs.crp > 5) flags.push({ k: 'crp', t: 'СРБ ' + String(a.labs.crp).replace('.', ',') + ' мг/л' });

      var kinds = flags.map(function (f) { return f.k; });
      function has(k) { return kinds.indexOf(k) > -1; }
      if ((has('load') || has('hi')) && (has('hrv') || has('model'))) s.signal = 'Риск перегрузки';
      else if (has('sleep') && d.recovery < 70) s.signal = 'Недостаточное восстановление';
      else if (has('hrv')) s.signal = 'Снижение вариабельности пульса';
      else if (has('model')) s.signal = 'Повышенный риск травмы по модели';
      else if (has('crp')) s.signal = 'Признаки воспаления — нужна оценка врача';
      else if (has('vitd')) s.signal = 'Дефицит витамина D и низкий ферритин';
      else s.signal = null;

      var physio = flags.filter(function (f) { return ['load', 'hi', 'hrv', 'sleep', 'rhr'].indexOf(f.k) > -1; }).length;
      if ((d.rr != null && d.rr >= RR_HIGH) || d.readiness < 55 || physio >= 2) s.status = 'attention';
      else if (d.recovery < 64 || has('crp')) s.status = 'recovery';
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

  /* Объяснение прогноза риска: вклад признаков (по пути в деревьях), сортировка по силе влияния */
  function factorBreakdown(a, offset) {
    var d = a.days[a.days.length - 1 - offset];
    if (!d || !d.inj || !ML) return [];
    return ML.describeInjury(d.injX, d.inj.contrib).sort(function (p, q) { return Math.abs(q.c) - Math.abs(p.c); });
  }

  function build(options) {
    options = options || {};
    var today = options.today || new Date();
    var checkins = options.checkins || {};
    var athletes;
    if (options.pilot) {
      var recs = options.pilot.records || {};
      athletes = (options.pilot.athletes || []).map(function (p) { return buildPilotAthlete(p, today, recs); });
    } else {
      athletes = ROSTER.map(function (r, i) { return buildAthlete(r, i, today, checkins); });
      (options.custom || []).forEach(function (c, i) { athletes.push(buildCustom(c, i, today, checkins)); });
    }
    return { today: today, athletes: athletes, DAYS: DAYS, VISIBLE: VISIBLE, LABS: LABS, WEAR: WEAR, POS: POS, pilot: !!options.pilot, isoOf: isoOf };
  }

  global.ASPData = {
    build: build, snapshot: snapshot, RR_HIGH: RR_HIGH, RR_MID: RR_MID, factorBreakdown: factorBreakdown, seriesOf: seriesOf,
    fmtHours: fmtHours, mean: mean, median: median, clamp: clamp, round: round, POS: POS
  };
})(window);
