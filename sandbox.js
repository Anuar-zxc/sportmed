/* AI Sports — песочница «Попробуйте ИИ» на главной.
   Строит синтетического спортсмена: 9 недель обычной истории + последняя неделя по параметрам пользователя,
   и прогоняет через те же признаки и модели, что в кабинете (model.js + models.js). Ничего не отправляется. */
(function (global) {
  'use strict';

  var T = 63;                                    // дней истории; прогноз строится по последнему дню
  var WEEK = [1.0, 1.2, 0.8, 1.1, 0.9, 1.3, 0];  // обычная неделя: шесть тренировок и выходной
  var REST_ORDER = [6, 3, 0];                    // какие дни последней недели становятся отдыхом (вс, чт, пн)

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function wave(d, k) { return Math.sin(d * 1.7 + k) * 0.5 + Math.sin(d * 0.61 + k * 2) * 0.5; } // детерминированный «шум»

  /* p: { sleepH, sleepQ, fatigue, soreness, stress, mood (1–5, как в чек-ине: 1 — нет усталости / боли / стресса),
          load (0.5–2, объём недели к норме), rest (0–3 дня), rpe (1–10) }
     Самооценку готовности (0–10) спортсмен даёт сам; в демо она выводится из его же ответов. */
  function selfReadiness(p) {
    return clamp(7.1 + 0.5 * (p.sleepQ - 4) + 0.3 * (p.sleepH - 7.5) - 0.6 * (p.fatigue - 2) - 0.45 * (p.soreness - 2)
                 - 0.3 * (p.stress - 2) + 0.3 * (p.mood - 4), 0, 10);
  }

  // слагаемые самооценки относительно обычного дня: [усталость и боль, сон, стресс и настроение]
  function selfTerms(p) {
    return [-0.6 * (p.fatigue - 2) - 0.45 * (p.soreness - 2), 0.5 * (p.sleepQ - 4) + 0.3 * (p.sleepH - 7.5), -0.3 * (p.stress - 2) + 0.3 * (p.mood - 4)];
  }

  function athlete(p) {
    var selfR = selfReadiness(p);
    var s = { load: [], hi: [], sessions: [], strength: [], exertion: [], recovery: [],
              readiness: [], fatigue: [], mood: [], sleep_duration: [], sleep_quality: [], soreness: [], stress: [], srpe: [] };
    var lastWeek = T - 7, restSet = {};
    for (var r = 0; r < p.rest; r++) restSet[REST_ORDER[r]] = true;

    for (var d = 0; d < T; d++) {
      var dow = d % 7, inLast = d >= lastWeek;
      var base = WEEK[dow];
      if (inLast) base = restSet[dow] ? 0 : (WEEK[dow] || 1.0) * p.load;   // в последней неделе отдых — только по выбору
      var load = base > 0 ? 10 * base * (1 + 0.06 * wave(d, 1)) : 0;
      s.load.push(load);
      s.hi.push(load * 0.2 * (inLast ? (1 + 0.5 * (p.load - 1)) : 1));
      s.sessions.push(load > 0 ? 1 : 0);
      s.strength.push(load > 0 && dow === 2 ? 1 : 0);
      s.exertion.push(load > 0 ? clamp(inLast ? p.rpe / 10 : 0.5 + 0.2 * wave(d, 2), 0, 1) : NaN);
      var lastThree = d >= T - 3;
      s.recovery.push(clamp(lastThree ? 0.32 + 0.06 * (p.fatigue - 2) + 0.03 * (p.soreness - 2) + 0.02 * (7.5 - p.sleepH)
                                      : 0.32 + 0.16 * wave(d, 3), 0, 1));
      s.srpe.push(load * 40);
      // самочувствие (шкалы модели: 5 — свеж / нет боли / спокоен), последние три дня — по параметрам
      var cur = d >= T - 3;
      s.readiness.push(cur ? selfR : clamp(7.1 + 0.6 * wave(d, 4), 0, 10));
      s.fatigue.push(cur ? 6 - p.fatigue : 3 + Math.round(0.6 * wave(d, 5)));
      s.soreness.push(cur ? 6 - p.soreness : 3 + Math.round(0.6 * wave(d, 6)));
      s.stress.push(cur ? 6 - p.stress : 3 + Math.round(0.6 * wave(d, 7)));
      s.mood.push(cur ? p.mood : 3 + Math.round(0.6 * wave(d, 8)));
      s.sleep_quality.push(cur ? p.sleepQ : 3 + Math.round(0.6 * wave(d, 9)));
      s.sleep_duration.push(cur ? p.sleepH : 7.8 + 0.4 * wave(d, 10));
    }
    return s;
  }

  function raw(p) {
    var ML = global.ASPML;
    if (!ML || !ML.ready) return null;
    var s = athlete(p), t = T - 1;
    var xr = ML.readinessFeaturesAt(s, t);
    var rd = ML.predictReadiness(xr);
    // вклад по смысловым группам (та же линейная модель: w · (x − среднее по обучающим данным))
    var reg = ML.models.readiness.reg, names = ML.models.readiness.features, contrib = {};
    names.forEach(function (k, j) { var v = xr[j] === xr[j] ? xr[j] : reg.fill[j]; contrib[k] = reg.w[j] * (v - reg.mean[j]); });
    var groups = GROUPS.map(function (g) { return { name: g[0], v: g[1].reduce(function (a, k) { return a + (contrib[k] || 0); }, 0) }; });
    var x = ML.injuryFeaturesAt(s, T, ML.personalNorms(s, T));
    var inj = ML.predictInjury(x);
    var factors = ML.describeInjury(x, inj.contrib)
      .filter(function (f) { return f.value !== 'нет данных'; })
      .sort(function (a, b) { return Math.abs(b.c) - Math.abs(a.c); });
    return {
      readiness: { value: rd.value, lo: rd.lo, hi: rd.hi, pLow: rd.pLow, lowRate: rd.lowRate,
                   self: selfReadiness(p), groups: groups },
      injury: { week: inj.week, baseWeek: inj.baseWeek, rr: inj.rr, factors: factors }
    };
  }

  /* Вклад показываем относительно обычного дня этого же спортсмена: для линейной модели готовности
     разница прогнозов раскладывается по группам точно. Для риска — факторы, которые модель считает повышающими. */
  var baseCache = null;
  function compute(p) {
    var r = raw(p);
    if (!r) return null;
    if (!baseCache) baseCache = raw(PRESETS.normal);
    r.readiness.base = baseCache.readiness.value;
    var d = r.readiness.groups.map(function (g, i) { return g.v - baseCache.readiness.groups[i].v; });
    // самооценку спортсмен в демо «складывает» из своих же ответов — её вклад делим между ними пропорционально
    var terms = selfTerms(p), tot = terms[0] + terms[1] + terms[2], pool = d[0];
    var share = Math.abs(tot) > 1e-6 ? terms.map(function (t) { return t / tot; }) : [1, 0, 0];
    r.readiness.groups = GROUPS.slice(1).map(function (g, i) { return { name: g[0], v: d[i + 1] + (i < 3 ? pool * share[i] : 0) }; });
    r.injury.up = r.injury.factors.filter(function (f) { return f.c > 0.1; }).slice(0, 3);
    return r;
  }

  var GROUPS = [
    ['самооценка', ['readiness', 'readiness3', 'readiness_base']],
    ['Усталость и боль', ['fatigue', 'fatigue3', 'soreness', 'soreness3']],
    ['Сон', ['sleep_duration', 'sleep_quality']],
    ['Стресс и настроение', ['stress', 'mood']],
    ['Нагрузка', ['srpe_today', 'srpe7_rel', 'acwr_srpe', 'monotony7_srpe']]
  ];

  var PRESETS = {
    normal:   { sleepH: 7.5, sleepQ: 4, fatigue: 2, soreness: 2, stress: 2, mood: 4, load: 1.0, rest: 1, rpe: 5 },
    heavy:    { sleepH: 6.5, sleepQ: 3, fatigue: 4, soreness: 4, stress: 3, mood: 3, load: 1.6, rest: 0, rpe: 8 },
    poorSleep:{ sleepH: 5.0, sleepQ: 2, fatigue: 3, soreness: 2, stress: 3, mood: 3, load: 1.0, rest: 1, rpe: 5 },
    fresh:    { sleepH: 8.5, sleepQ: 5, fatigue: 1, soreness: 1, stress: 1, mood: 5, load: 0.75, rest: 2, rpe: 4 }
  };


  /* ---------- интерфейс на главной ---------- */
  var FIELDS = [
    ['sleepH', 'Сон', 4, 10, 0.5, function (v) { return fmt(v, v % 1 ? 1 : 0) + ' ч'; }],
    ['sleepQ', 'Качество сна', 1, 5, 1, words(['очень плохое', 'плохое', 'среднее', 'хорошее', 'отличное'])],
    ['fatigue', 'Усталость', 1, 5, 1, words(['нет', 'лёгкая', 'средняя', 'заметная', 'сильная'])],
    ['soreness', 'Мышечная боль', 1, 5, 1, words(['нет', 'лёгкая', 'средняя', 'заметная', 'сильная'])],
    ['stress', 'Стресс', 1, 5, 1, words(['нет', 'низкий', 'средний', 'высокий', 'очень высокий'])],
    ['mood', 'Настроение', 1, 5, 1, words(['плохое', 'ниже обычного', 'обычное', 'хорошее', 'отличное'])],
    ['load', 'Объём нагрузки', 0.5, 2, 0.05, function (v) { var d = Math.round((v - 1) * 100); return (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d) + '% к норме'; }],
    ['rest', 'Дней отдыха', 0, 3, 1, function (v) { return v === 0 ? 'ни одного' : String(v); }],
    ['rpe', 'Тяжесть тренировок', 1, 10, 1, function (v) { return v + ' из 10'; }]
  ];
  function words(list) { return function (v) { return list[Math.round(v) - 1] || String(v); }; }
  function fmt(v, d) { return Number(v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function sign(v, d) { var a = fmt(Math.abs(v), d); return (v > 0.005 ? '+' : v < -0.005 ? '−' : '') + a; }

  function mount(root) {
    if (!root || root.__mounted || !global.ASPML || !global.ASPML.ready) return false;
    root.__mounted = true;
    var state = Object.assign({}, PRESETS.normal);
    var q = function (sel) { return root.querySelector(sel); };
    var inputs = {};
    FIELDS.forEach(function (f) {
      var inp = root.querySelector('input[name="' + f[0] + '"]');
      if (!inp) return;
      inputs[f[0]] = inp;
      inp.addEventListener('input', function () { state[f[0]] = parseFloat(inp.value); markPreset(null); update(); });
    });
    root.querySelectorAll('[data-preset]').forEach(function (b) {
      b.addEventListener('click', function () { state = Object.assign({}, PRESETS[b.getAttribute('data-preset')]); markPreset(b.getAttribute('data-preset')); sync(); update(true); });
    });
    function markPreset(name) {
      root.querySelectorAll('[data-preset]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-preset') === name)); });
    }
    function sync() {
      FIELDS.forEach(function (f) { var inp = inputs[f[0]]; if (inp) inp.value = state[f[0]]; });
    }
    var liveTimer = null;
    function update(announce) {
      FIELDS.forEach(function (f) {
        var inp = inputs[f[0]]; if (!inp) return;
        var out = root.querySelector('output[for="' + inp.id + '"]');
        if (out) out.textContent = f[5](state[f[0]]);
        inp.style.setProperty('--v', ((state[f[0]] - f[2]) / (f[3] - f[2]) * 100).toFixed(1) + '%');
        inp.setAttribute('aria-valuetext', f[5](state[f[0]]));
      });
      var r = compute(state);
      if (!r) return;
      var R = r.readiness, I = r.injury;
      q('[data-o="ready"]').textContent = fmt(R.value, 1);
      q('[data-o="range"]').textContent = fmt(R.lo, 1) + '–' + fmt(R.hi, 1);
      var dv = R.value - R.base;
      var dEl = q('[data-o="delta"]');
      dEl.textContent = Math.abs(dv) < 0.05 ? 'как в обычный день' : sign(dv, 1) + ' к обычному дню';
      dEl.className = 'sbx-delta ' + (dv <= -0.3 ? 'down' : dv >= 0.3 ? 'up' : '');
      q('[data-o="self"]').textContent = fmt(R.self, 1);
      var ring = q('.sbx-ring-fill');
      if (ring) ring.style.strokeDashoffset = (100 - R.value / 10 * 75).toFixed(2);
      root.style.setProperty('--ready-hue', String(Math.round(10 + R.value * 11)));
      q('[data-o="risk"]').textContent = fmt(I.week * 100, 0) + '%';
      q('[data-o="rr"]').textContent = '×' + fmt(I.rr, 1);
      var rrEl = q('[data-o="rr"]');
      rrEl.className = 'sbx-rr ' + (I.rr >= 1.5 ? 'hi' : I.rr >= 1.1 ? 'mid' : 'ok');
      var meter = q('.sbx-meter i');
      if (meter) meter.style.transform = 'scaleX(' + Math.min(1, I.week / 0.4).toFixed(3) + ')';
      var avg = q('.sbx-meter b');
      if (avg) avg.style.left = (Math.min(1, I.baseWeek / 0.4) * 100).toFixed(1) + '%';
      // почему так
      var max = 2.5;
      q('[data-o="groups"]').innerHTML = R.groups.map(function (g) {
        var w = Math.min(1, Math.abs(g.v) / max) * 50;
        var cls = g.v <= -0.05 ? 'neg' : g.v >= 0.05 ? 'pos' : 'zero';
        return '<li class="' + cls + '"><span>' + g.name + '</span><i aria-hidden="true"><b style="' + (g.v < 0 ? 'right:50%' : 'left:50%') + ';width:' + w.toFixed(1) + '%"></b></i><em>' + (Math.abs(g.v) < 0.05 ? '0' : sign(g.v, 1)) + '</em></li>';
      }).join('');
      q('[data-o="factors"]').innerHTML = I.up.length
        ? I.up.map(function (f) { return '<li><svg class="icon-sm" aria-hidden="true"><use href="#i-alert"/></svg><span><b>' + f.name + '</b>' + f.value + '</span></li>'; }).join('')
        : '<li class="calm"><svg class="icon-sm" aria-hidden="true"><use href="#i-check"/></svg><span><b>Факторы риска не выделяются</b>нагрузка и восстановление в пределах личной нормы</span></li>';
      clearTimeout(liveTimer);
      liveTimer = setTimeout(function () {
        q('[data-o="live"]').textContent = 'Прогноз готовности на завтра ' + fmt(R.value, 1) + ' из 10, риск травмы за неделю ' + fmt(I.week * 100, 0) + ' процентов, ' + '×' + fmt(I.rr, 1) + ' к среднему.';
      }, announce ? 50 : 700);
    }
    sync(); update();
    root.classList.add('ready');
    return true;
  }

  global.ASPSandbox = { compute: compute, athlete: athlete, selfReadiness: selfReadiness, PRESETS: PRESETS, mount: mount };
  if (typeof document !== 'undefined') { var el = document.querySelector('[data-sandbox]'); if (el) mount(el); }
})(typeof window !== 'undefined' ? window : globalThis);
