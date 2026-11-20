/* Willow Pet Hotel service worker: offline app shell and read-only fallbacks for care rounds. */
importScripts('/hotel/sw-routes.js');

var SHELL_CACHE = 'willow-shell-v1';
var API_CACHE = 'willow-api-v1'; // cleared by the app on sign-out

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(SHELL_CACHE).then(function (cache) { return cache.add('/hotel/'); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== SHELL_CACHE && k !== API_CACHE; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

function store(cacheName, request, response) {
  if (response.ok) {
    var copy = response.clone();
    caches.open(cacheName).then(function (cache) { cache.put(request, copy); });
  }
  return response;
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  var strategy = self.hotelStrategyFor(request.url, request.method, request.mode);
  if (strategy === 'network-only') return;

  if (strategy === 'shell') {
    event.respondWith(
      fetch(request)
        .then(function (response) { return store(SHELL_CACHE, '/hotel/', response); })
        .catch(function () { return caches.match('/hotel/'); })
    );
  } else if (strategy === 'cache-first') {
    event.respondWith(
      caches.match(request).then(function (hit) {
        return hit || fetch(request).then(function (response) { return store(SHELL_CACHE, request, response); });
      })
    );
  } else if (strategy === 'network-first') {
    event.respondWith(
      fetch(request)
        .then(function (response) { return store(API_CACHE, request, response); })
        .catch(function () {
          return caches.match(request).then(function (hit) { return hit || Response.error(); });
        })
    );
  }
});
