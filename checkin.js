/* Утренний чек-ин спортсмена: заполнение на телефоне и шифрованный ответ специалисту.
   Ничего не отправляется на сервер: ключ и ответ живут только в части ссылки после «#». */
(function () {
  'use strict';
  var C = window.ASPCrypto;
  var KEY = 'asp_ci_invite';
  var $ = function (s) { return document.querySelector(s); };
  var form = $('#ci-form'), done = $('#ci-done'), errBox = $('#ci-error');
  var okCrypto = !!(C && window.crypto && crypto.subtle);
  var inv = okCrypto ? C.parseInvite(location.hash) : null;
  if (inv) {
    // ссылка запоминается только на этом телефоне — чтобы открывать чек-ин с главного экрана
    try { localStorage.setItem(KEY, location.hash.replace(/^#/, '')); } catch (e) { /* noop */ }
    // убрать ключ из адресной строки и истории браузера после чтения
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* noop */ }
  } else if (okCrypto) {
    try { inv = C.parseInvite('#' + (localStorage.getItem(KEY) || '')); } catch (e) { inv = null; }
  }

  if (!inv) {
    errBox.hidden = false;
    if (!okCrypto) $('#ci-error-text').textContent = 'Браузер не поддерживает шифрование. Откройте ссылку в актуальном Chrome, Safari или Firefox.';
    return;
  }
  var forget = $('#ci-forget');
  if (forget) forget.addEventListener('click', function () {
    try { localStorage.removeItem(KEY); } catch (e) { /* noop */ }
    location.reload();
  });

  var hour = new Date().getHours();
  var greet = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  $('#ci-hello').textContent = greet + (inv.name ? ', ' + inv.name : '') + '!';
  form.hidden = false;

  var answers = {}, day = 0, replyUrl = '';
  form.querySelectorAll('[data-scale]').forEach(function (fs) {
    var key = fs.getAttribute('data-scale'), lo = +fs.getAttribute('data-min'), hi = +fs.getAttribute('data-max');
    var box = fs.querySelector('.ci-scale');
    for (var v = lo; v <= hi; v++) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = String(v);
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false'); b.dataset.v = String(v);
      box.appendChild(b);
    }
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      box.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); });
      answers[key] = +b.dataset.v;
    });
  });
  form.querySelectorAll('[data-day]').forEach(function (b) {
    b.addEventListener('click', function () {
      day = +b.dataset.day;
      form.querySelectorAll('[data-day]').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); });
    });
  });
  var rest = $('#ci-rest'), train = $('#ci-train');
  rest.addEventListener('change', function () { train.hidden = rest.checked; });

  function num(id, lo, hi, label) {
    var el = $(id), v = String(el.value).trim().replace(',', '.');
    if (v === '') { el.removeAttribute('aria-invalid'); return null; }
    var x = Number(v);
    if (!(x >= lo && x <= hi)) { el.setAttribute('aria-invalid', 'true'); el.focus(); throw new Error(label + ': от ' + lo + ' до ' + hi); }
    el.removeAttribute('aria-invalid'); return x;
  }
  function isoDay(offset) {
    var d = new Date(); d.setDate(d.getDate() - offset);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('#ci-err'); err.textContent = '';
    if (answers.readiness == null) { err.textContent = 'Отметьте готовность к тренировке — это главный вопрос.'; form.querySelector('[data-scale="readiness"] button').focus(); return; }
    var sleeph, rpe, dur;
    try {
      sleeph = num('#ci-sleeph', 0, 16, 'Сон');
      if (!rest.checked) { rpe = num('#ci-rpe', 0, 10, 'Тяжесть'); dur = num('#ci-dur', 0, 600, 'Минуты'); }
    } catch (ex) { err.textContent = 'Проверьте поле «' + ex.message + '».'; return; }
    if (!rest.checked && ((rpe == null) !== (dur == null))) { err.textContent = 'Для вчерашней тренировки укажите и тяжесть, и минуты — или отметьте «Был день отдыха».'; return; }
    var r = { readiness: answers.readiness };
    ['fatigue', 'soreness', 'sleepq', 'stress', 'mood'].forEach(function (k) { if (answers[k] != null) r[k] = answers[k]; });
    if (sleeph != null) r.sleeph = sleeph;
    if (rest.checked) { r.rpe = 0; r.dur = 0; } else if (dur != null) { r.rpe = rpe; r.dur = dur; }
    var note = $('#ci-note').value.trim().slice(0, 300);
    if (note) r.note = note;
    var payload = { v: 1, t: inv.teamId, a: inv.athleteId, d: isoDay(day), ts: Date.now(), r: r };
    var btn = $('#ci-submit'); btn.disabled = true;
    C.seal(inv.key, payload, C.aadFor(inv.teamId, inv.athleteId)).then(function (blob) {
      var base = location.origin + (/\.html$/.test(location.pathname) ? '/app.html' : '/app');
      replyUrl = base + '#ci=' + inv.teamId + '.' + inv.athleteId + '.' + blob;
      var text = 'Чек-ин' + (inv.name ? ' · ' + inv.name : '') + ' · ' + payload.d;
      $('#ci-tg').href = 'https://t.me/share/url?url=' + encodeURIComponent(replyUrl) + '&text=' + encodeURIComponent(text);
      $('#ci-wa').href = 'https://wa.me/?text=' + encodeURIComponent(text + '\n' + replyUrl);
      $('#ci-share').hidden = !navigator.share;
      form.hidden = true; done.hidden = false; btn.disabled = false;
      window.scrollTo(0, 0);
      var shareBtn = $('#ci-share');
      shareBtn.onclick = function () { navigator.share({ title: text, text: text, url: replyUrl }).catch(function () { /* отменено */ }); };
      $('#ci-copy').onclick = function () {
        (navigator.clipboard ? navigator.clipboard.writeText(replyUrl) : Promise.reject()).then(function () {
          $('#ci-copied').textContent = 'Скопировано. Вставьте в чат со специалистом.';
        }).catch(function () { window.prompt('Скопируйте ссылку-ответ:', replyUrl); });
      };
    }).catch(function () { btn.disabled = false; err.textContent = 'Не удалось зашифровать ответ. Обновите страницу и попробуйте ещё раз.'; });
  });
  $('#ci-again').addEventListener('click', function () { done.hidden = true; form.hidden = false; $('#ci-copied').textContent = ''; });
})();
