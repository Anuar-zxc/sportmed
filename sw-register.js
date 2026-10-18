/* Регистрация service worker (офлайн-режим и установка приложения). */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!secure) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () { /* без офлайн-режима сайт работает как обычно */ });
  });
})();
