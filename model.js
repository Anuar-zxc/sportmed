/* AI Sports — инференс обученных моделей в браузере.
   Признаки повторяют ml/features.py один в один (проверка: ml/verify_js.py).
   Данные никуда не отправляются: все расчёты выполняются на устройстве пользователя. */
(function (global) {
  'use strict';

  var M = global.ASPModels;
  var NaN_ = NaN;

  /* ---------- утилиты с семантикой numpy ---------- */
  function isNum(v) { return typeof v === 'number' && v === v; }
  function nanmean(a) { var s = 0, n = 0; for (var i = 0; i < a.length; i++) if (isNum(a[i])) { s += a[i]; n++; } return n ? s / n : NaN_; }
  function nanstd(a) { // СКО генеральной совокупности (ddof = 0), как np.std
    var m = nanmean(a), s = 0, n = 0;
    for (var i = 0; i < a.length; i++) if (isNum(a[i])) { s += (a[i] - m) * (a[i] - m); n++; }
    return n > 1 ? Math.sqrt(s / n) : NaN_;
  }
  function nansum(a) { var s = 0; for (var i = 0; i < a.length; i++) if (isNum(a[i])) s += a[i]; return s; }
  function nanmax(a) { var m = -Infinity; for (var i = 0; i < a.length; i++) if (isNum(a[i]) && a[i] > m) m = a[i]; return m === -Infinity ? NaN_ : m; }
  function count(a) { var n = 0; for (var i = 0; i < a.length; i++) if (isNum(a[i])) n++; return n; }
  function slice(a, from, to) { return a.slice(Math.max(0, from), to); }
  function ratio(a, b) { return (isNum(a) && isNum(b) && b > 0) ? a / b : NaN_; }
  function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

  /* ---------- признаки модели риска травмы ---------- */
  var INJ = M ? M.injury.features : [];

  function daysSinceRest(l7) {
    for (var k = 1; k <= 7; k++) {
      var v = l7[l7.length - k];
      if (!isNum(v)) return NaN_;
      if (v === 0) return k - 1;
    }
    return 7;
  }

  function personalNorms(s, t) {
    var end = Math.max(0, t - 7);
    var load = slice(s.load, 0, end), p = {};
    var known = [], hi = [], ses = [], str = [];
    for (var i = 0; i < load.length; i++) if (isNum(load[i])) { known.push(load[i]); hi.push(s.hi[i]); ses.push(s.sessions[i]); str.push(s.strength[i]); }
    if (known.length >= 28) {
      p.day_load = nanmean(known);
      var tr = known.filter(function (v) { return v > 0; });
      if (tr.length) p.train_day_load = nanmean(tr);
      p.day_hi = nanmean(hi);
      var tot = nansum(known);
      p.hi_share = tot > 0 ? nansum(hi) / tot : NaN_;
      p.day_sessions = nanmean(ses);
      p.day_strength = nanmean(str);
    }
    var ex = slice(s.exertion, 0, end);
    if (count(ex) >= 14) { p.exert_mean = nanmean(ex); p.exert_std = nanstd(ex); }
    var rc = slice(s.recovery, 0, end);
    if (count(rc) >= 14) { p.recov_mean = nanmean(rc); p.recov_std = nanstd(rc); }
    return p;
  }

  function injuryFeaturesAt(s, t, p) {
    var f = {};
    if (t < 7) return INJ.map(function () { return NaN_; });
    var l7 = slice(s.load, t - 7, t), n7 = count(l7), ok = n7 >= 5;
    var m7 = ok ? nanmean(l7) : NaN_;
    f.load7_rel = ratio(m7, p.day_load);
    var s7 = ok ? nanstd(l7) : NaN_;
    f.monotony7 = (isNum(s7) && s7 > 0) ? Math.min(m7 / s7, 10) : ((isNum(m7) && m7 > 0) ? 10 : NaN_);
    f.rest7 = ok ? l7.filter(function (v) { return v === 0; }).length : NaN_;
    var h7 = slice(s.hi, t - 7, t), hs = nansum(h7), ls = nansum(l7);
    f.hi7_rel = ok ? ratio(hs / n7, p.day_hi) : NaN_;
    var share = ok ? (ls > 0 ? hs / ls : 0) : NaN_;
    f.hi_share7_rel = ratio(share, p.hi_share);
    f.spike7 = ok ? ratio(nanmax(l7), p.train_day_load) : NaN_;
    var ma = nanmean(l7.slice(4)), mb = nanmean(l7.slice(0, 4));
    f.trend3 = (isNum(mb) && mb > 0 && isNum(ma)) ? Math.min(ma / mb, 10) : ((isNum(ma) && ma > 0 && mb === 0) ? 10 : NaN_);
    f.sessions7_rel = ok ? ratio(nansum(slice(s.sessions, t - 7, t)) / n7, p.day_sessions) : NaN_;
    f.strength7_rel = ok ? ratio(nansum(slice(s.strength, t - 7, t)) / n7, p.day_strength) : NaN_;
    f.days_since_rest = daysSinceRest(l7);
    var e7 = nanmean(slice(s.exertion, t - 7, t));
    f.exert_z = (isNum(e7) && isNum(p.exert_mean) && isNum(p.exert_std) && p.exert_std > 0) ? (e7 - p.exert_mean) / p.exert_std : NaN_;
    var r3 = nanmean(slice(s.recovery, t - 3, t));
    f.recov_z = (isNum(r3) && isNum(p.recov_mean) && isNum(p.recov_std) && p.recov_std > 0) ? (r3 - p.recov_mean) / p.recov_std : NaN_;
    return INJ.map(function (k) { return f[k]; });
  }

  /* ---------- признаки модели готовности ---------- */
  var RDY = M ? M.readiness.features : [];
  var WELL = ['fatigue', 'mood', 'readiness', 'sleep_duration', 'sleep_quality', 'soreness', 'stress'];

  function readinessFeaturesAt(s, t) {
    var f = {};
    WELL.forEach(function (k) { var v = s[k][t]; f[k] = isNum(v) ? v : NaN_; });
    var w3 = function (k) { return nanmean(slice(s[k], t - 2, t + 1)); };
    f.readiness3 = w3('readiness'); f.fatigue3 = w3('fatigue'); f.soreness3 = w3('soreness');
    var past = slice(s.readiness, 0, t);
    f.readiness_base = count(past) >= 7 ? nanmean(past) : NaN_;
    var sr = s.srpe;
    f.srpe_today = isNum(sr[t]) ? sr[t] : NaN_;
    var s7 = slice(sr, t - 6, t + 1), s28 = slice(sr, t - 27, t + 1);
    var n7 = count(s7), n28 = count(s28);
    var m7 = n7 >= 4 ? nanmean(s7) : NaN_, m28 = n28 >= 14 ? nanmean(s28) : NaN_;
    var allp = slice(sr, 0, t + 1), pm = count(allp) >= 14 ? nanmean(allp) : NaN_;
    f.srpe7_rel = ratio(m7, pm);
    f.acwr_srpe = ratio(m7, m28);
    var sd7 = n7 >= 4 ? nanstd(s7) : NaN_;
    f.monotony7_srpe = (isNum(sd7) && sd7 > 0) ? Math.min(m7 / sd7, 10) : ((isNum(m7) && m7 > 0) ? 10 : NaN_);
    return RDY.map(function (k) { return f[k]; });
  }

  /* ---------- деревья, калибровка, объяснения ---------- */
  function leaf(tr, x) {
    var k = 0;
    while (tr.f[k] !== -1) {
      var v = x[tr.f[k]];
      k = !isNum(v) ? (tr.m[k] ? tr.l[k] : tr.r[k]) : (v <= tr.t[k] ? tr.l[k] : tr.r[k]);
    }
    return k;
  }
  function rawPredict(ex, x) {
    var out = ex.base;
    for (var i = 0; i < ex.trees.length; i++) { var tr = ex.trees[i]; out += tr.v[leaf(tr, x)]; }
    return out;
  }
  function contributions(ex, x) { // Saabas: изменение значения узла на каждом сплите пути
    var c = x.map(function () { return 0; });
    for (var i = 0; i < ex.trees.length; i++) {
      var tr = ex.trees[i], k = 0;
      while (tr.f[k] !== -1) {
        var v = x[tr.f[k]];
        var nk = !isNum(v) ? (tr.m[k] ? tr.l[k] : tr.r[k]) : (v <= tr.t[k] ? tr.l[k] : tr.r[k]);
        c[tr.f[k]] += tr.v[nk] - tr.v[k];
        k = nk;
      }
    }
    return c;
  }
  function calibrate(cal, raw) { // калибровка Платта поверх логарифма шансов модели
    return sigmoid(cal.a * raw + cal.b);
  }

  /* ---------- публичные предсказания ---------- */
  function predictInjury(x) {
    var m = M.injury;
    var raw = rawPredict(m.hgb, x);
    var p = calibrate(m.calibration, raw);
    var base = m.base_rate_daily;
    return {
      raw: raw, daily: p,
      week: 1 - Math.pow(1 - p, 7),             // оценка на 7 дней при неизменных условиях
      baseWeek: 1 - Math.pow(1 - base, 7),
      rr: p / base,                               // во сколько раз выше среднего уровня в обучающих данных
      contrib: contributions(m.hgb, x)            // в логарифме шансов, по признакам
    };
  }

  var R_GROUPS = [
    ['Самооценка готовности', ['readiness', 'readiness3', 'readiness_base']],
    ['Усталость и болезненность', ['fatigue', 'fatigue3', 'soreness', 'soreness3']],
    ['Сон', ['sleep_duration', 'sleep_quality']],
    ['Стресс и настроение', ['stress', 'mood']],
    ['Тренировочная нагрузка', ['srpe_today', 'srpe7_rel', 'acwr_srpe', 'monotony7_srpe']]
  ];
  function predictReadiness(x) {
    var m = M.readiness, r = m.reg;
    var y = r.intercept, contrib = {};
    for (var j = 0; j < x.length; j++) {
      var v = isNum(x[j]) ? x[j] : r.fill[j];
      y += r.w[j] * v;
      contrib[RDY[j]] = r.w[j] * (v - r.mean[j]);   // относительно среднего игрока в обучающих данных
    }
    var groups = R_GROUPS.map(function (g) { return { name: g[0], v: g[1].reduce(function (s, k) { return s + (contrib[k] || 0); }, 0) }; });
    var pLow = calibrate(m.clf_calibration, rawPredict(m.clf, x));
    var val = Math.max(0, Math.min(10, y));
    return {
      value: val, raw: y,
      lo: Math.max(0, Math.min(10, y + m.pi80_residual[0])), hi: Math.max(0, Math.min(10, y + m.pi80_residual[1])),
      pLow: pLow, lowRate: m.low_rate, groups: groups
    };
  }

  /* ---------- человекочитаемые описания признаков ---------- */
  var INJ_LABELS = {
    load7_rel: ['Нагрузка за 7 дней', function (v) { return pct(v) + ' к личной норме'; }],
    monotony7: ['Монотонность нагрузки', function (v) { return 'индекс ' + dec(v, 1); }],
    rest7: ['Дни отдыха за неделю', function (v) { return String(v); }],
    hi7_rel: ['Интенсивная нагрузка', function (v) { return pct(v) + ' к личной норме'; }],
    hi_share7_rel: ['Доля интенсивной работы', function (v) { return pct(v) + ' к обычной'; }],
    spike7: ['Пиковый день недели', function (v) { return '×' + dec(v, 2) + ' к обычной тренировке'; }],
    trend3: ['Рост нагрузки за 3 дня', function (v) { return '×' + dec(v, 2) + ' к предыдущим 4'; }],
    sessions7_rel: ['Число тренировок', function (v) { return pct(v) + ' к норме'; }],
    strength7_rel: ['Силовые тренировки', function (v) { return pct(v) + ' к норме'; }],
    days_since_rest: ['Дней без отдыха подряд', function (v) { return String(v); }],
    exert_z: ['Субъективная тяжесть (RPE)', function (v) { return z(v); }],
    recov_z: ['Потребность в восстановлении', function (v) { return z(v); }]
  };
  function dec(v, d) { return Number(v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function pct(v) { var p = Math.round((v - 1) * 100); return (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p) + '%'; }
  function z(v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + dec(Math.abs(v), 1) + ' СКО к личной норме'; }
  function describeInjury(x, contrib) {
    return INJ.map(function (k, j) {
      var L = INJ_LABELS[k] || [k, String];
      return { key: k, name: L[0], value: isNum(x[j]) ? L[1](x[j]) : 'нет данных', c: contrib[j], odds: Math.exp(contrib[j]) - 1 };
    });
  }

  global.ASPML = {
    ready: !!M,
    models: M,
    personalNorms: personalNorms,
    injuryFeaturesAt: injuryFeaturesAt,
    readinessFeaturesAt: readinessFeaturesAt,
    predictInjury: predictInjury,
    predictReadiness: predictReadiness,
    describeInjury: describeInjury,
    rawPredict: rawPredict,
    calibrate: calibrate,
    sigmoid: sigmoid,
    INJ_LABELS: INJ_LABELS
  };
})(typeof window !== 'undefined' ? window : globalThis);
