// Диагностика запуска. Обычный (не модульный) скрипт грузится раньше
// приложения и сообщает серверу, на каком шаге старт остановился: страница
// загрузилась → код приложения запустился → экран нарисован. Ошибки и то, что
// осталось от старого кэша, — туда же. Нужен, чтобы видеть запуск на чужом
// телефоне, а не гадать. Отчёт — картинка-пиксель /__diag: на сервере это
// просто строка в журнале, личных данных в ней нет.
(function () {
  var sent = 0;
  function send(stage, extra) {
    if (sent > 25) return;
    sent += 1;
    try {
      var q = 's=' + encodeURIComponent(stage) + '&t=' + Math.round(performance.now());
      if (extra) q += '&d=' + encodeURIComponent(String(extra).slice(0, 300));
      new Image().src = '/__diag?' + q + '&r=' + Math.random().toString(36).slice(2, 7);
    } catch (e) { /* диагностика не должна ломать запуск */ }
  }
  window.__cardDiag = send;

  var standalone = window.navigator.standalone === true;
  send('html', (standalone ? 'app' : 'tab') + ' ' + location.pathname + location.hash);

  window.addEventListener('error', function (event) {
    var target = event.target;
    if (target && target !== window && (target.src || target.href)) {
      send('load-fail', target.tagName + ' ' + (target.src || target.href));
    } else {
      send('js-error', (event.message || '') + ' @' + (event.filename || '').split('/').pop() + ':' + (event.lineno || ''));
    }
  }, true);
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    send('promise', reason && (reason.stack || reason.message) || String(reason));
  });

  setTimeout(function () {
    var info = [];
    try {
      info.push('boot=' + (window.__cardBoot || 'none'));
      info.push('splash=' + (document.querySelector('.ca-splash') ? 1 : 0));
      info.push('app=' + ((document.getElementById('app') || {}).innerHTML || '').length);
      info.push('bg=' + getComputedStyle(document.body).backgroundColor);
      info.push('ctrl=' + (navigator.serviceWorker && navigator.serviceWorker.controller ? 1 : 0));
      info.push('ob=' + (localStorage.getItem('eventory-card:onboarded') || '-'));
    } catch (e) { info.push('err=' + e.message); }
    var finish = function (extra) { send('state', info.concat(extra || []).join(' ')); };
    try {
      Promise.all([
        navigator.serviceWorker ? navigator.serviceWorker.getRegistrations() : Promise.resolve([]),
        window.caches ? caches.keys() : Promise.resolve([])
      ]).then(function (res) {
        finish(['sw=' + res[0].length, 'caches=' + res[1].join(',')]);
      }, function (e) { finish(['probe-err=' + e.message]); });
    } catch (e) { finish(['probe-err=' + e.message]); }
  }, 4000);
})();
