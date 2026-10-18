/* AI Sports — service worker: работа без сети и установка на телефон/компьютер.
   Всегда сначала сеть (чтобы после релиза сразу была новая версия), кэш — только когда сети нет.
   Шрифты /gf/ неизменяемые — из кэша. Данные пользователя здесь не хранятся: они в localStorage. */
var CACHE = 'asp-shell-v6';
var SHELL = [
  '/', '/app', '/checkin', '/privacy', '/terms', '/cookies', '/consent',
  '/styles.css', '/app.css', '/landing.css', '/checkin.css', '/fonts.css',
  '/theme-init.js', '/main.js', '/app.js', '/data.js', '/model.js', '/models.js',
  '/asp-crypto.js', '/checkin.js', '/vendor/qrcode.js', '/sw-register.js',
  '/fonts/inter-latin.woff2', '/fonts/inter-cyrillic.woff2', '/favicon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () { /* в локальной разработке части путей нет */ }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('asp-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/gf/') === 0 || url.pathname.indexOf('/fonts/') === 0) {
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      });
    }));
    return;
  }
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      if (req.mode === 'navigate') {
        var p = url.pathname.replace(/\.html$/, '');
        return caches.match(p === '' ? '/' : p).then(function (h2) { return h2 || caches.match('/app'); });
      }
      return Response.error();
    });
  }));
});
