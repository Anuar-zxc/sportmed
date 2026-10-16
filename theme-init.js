/* Применяет тему до отрисовки, чтобы не было вспышки. */
(function () {
  var t = 'dark', d = false;
  try {
    var s = JSON.parse(localStorage.getItem('asp_app_v1') || '{}');
    t = s.theme || 'dark';
    d = !!s.compact;
  } catch (e) { /* storage unavailable */ }
  if (t === 'system') t = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  if (d) document.documentElement.setAttribute('data-density', 'compact');
})();
