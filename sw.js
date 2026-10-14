// Retired. This worker belonged to the old Flux Wing 2 page (v2.html, registered by src/main.js) and answered
// offline navigations with v2.html. The live game (index.html) registers no worker, so this version only clears
// the caches the old one left and unregisters itself; browsers fetch it again on their next navigation.
// It does not reload open pages: v2.html would register it again and loop.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
  })());
});
