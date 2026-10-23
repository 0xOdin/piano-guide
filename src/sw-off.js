// Offline use is turned off (OFFLINE in scripts/build.js). On every device that had the service worker, the browser
// fetches this in its place the next time the site is opened online: it deletes the copy of the site kept there,
// removes itself, and loads the open pages again, now straight from the site.

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith("pianoguide-")) await caches.delete(name);
    }
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
  })());
});
