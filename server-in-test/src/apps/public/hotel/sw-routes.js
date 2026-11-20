/* Which caching strategy the service worker uses for a request. Classic script: loaded with importScripts(). */
self.hotelStrategyFor = function (url, method, mode) {
  var path = new URL(url).pathname;
  if (method !== 'GET') return 'network-only';
  if (mode === 'navigate') return path === '/hotel' || path.indexOf('/hotel/') === 0 ? 'shell' : 'network-only';
  if (path.indexOf('/assets/') === 0) return 'cache-first';
  // What a carer reads on their rounds, kept as a fallback for weak Wi-Fi. Never photos, audit or live events.
  if (/^\/api\/hotel\/(auth\/me|tasks\/mine|tasks\/[\w-]+|pets\/[\w-]+|pets\/[\w-]+\/notes)$/.test(path)) return 'network-first';
  return 'network-only';
};
