/* Применяет тему до отрисовки, чтобы не было вспышки. По умолчанию — светлая (молочно-белая).
   ui: 2 — новая версия оформления: сохранённая ранее тёмная тема один раз сбрасывается на светлую. */
(function () {
  var t = 'light', d = false;
  try {
    var s = JSON.parse(localStorage.getItem('asp_app_v1') || '{}');
    if (s.ui === 2 && s.theme) t = s.theme;
    d = !!s.compact;
  } catch (e) { /* storage unavailable */ }
  if (t === 'system') t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  if (d) document.documentElement.setAttribute('data-density', 'compact');
})();
