/* Background Sync handler (Req 16.8). Progressive enhancement only: correctness never
 * depends on it. Identical copy lives in apps/order-awaaz/public/sw-sync.js.
 * On an `awaaz-sync` event, ask an open client to run its Sync_Engine. With no open
 * client we resolve quietly; the next launch/online/visibility trigger syncs instead. */
self.addEventListener('sync', function (event) {
  if (event.tag !== 'awaaz-sync') return;
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clients) {
        clients.forEach(function (client) {
          client.postMessage({ type: 'awaaz-sync' });
        });
      })
      .catch(function () {
        /* never fail the event; in-app triggers cover correctness */
      }),
  );
});
