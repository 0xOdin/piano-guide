// The site offline (registered by main.js). It keeps the site's own files on this device, in the browser's cache, so
// pages open without the internet:
//  - pages come from the network when there is one, so they are always up to date, and a copy is kept; offline, the
//    copy is used without trying the network at all (an iPhone in Airplane Mode would pop up a message for the try),
//    and on a network too slow to answer within a few seconds, a page already kept opens from its copy
//  - everything else (styles, scripts, fonts, the piano sound, pictures) comes from the copy once one is kept,
//    otherwise from the network, and is kept
// When it is installed it keeps the core of the site: the styles, the scripts and the pages other than the key pages.
// Once the site is added to the home screen (the page then says "save-all"), it keeps every file: the key pages and
// the piano sound too, about 6 MB, so all of it works offline. It only ever asks this site for its own files, and
// sends nothing anywhere.
//
// scripts/build.js writes it into dist/ with VERSION (made from the site's files, so every change is a new version,
// which a phone then picks up) and the lists of files, as paths from the site's folder ("" is the homepage). The piano
// recordings, the fonts and VexFlow never change, so they are kept apart, across versions, and fetched only once.

const VERSION = "__VERSION__";
const CORE = __CORE__;
const ALL = __ALL__;
const CACHE = `pianoguide-${VERSION}`;
const LASTING = "pianoguide-lasting";

const scope = self.registration.scope; // https://…/piano-guide/
const urlOf = (path) => new URL(path, scope).href;
const lasting = (path) => /^(assets\/piano|assets\/fonts|js\/vendor)\//.test(path);
const cacheFor = (path) => caches.open(lasting(path) ? LASTING : CACHE);

// Safari won't open a page from the cache if fetching it was redirected: keep the page itself
const unredirected = (response) => (response.redirected
  ? new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers })
  : response);

async function keep(path) {
  const cache = await cacheFor(path);
  if (await cache.match(urlOf(path))) return;
  const response = await fetch(urlOf(path));
  if (response.ok) await cache.put(urlOf(path), unredirected(response));
}

// four at a time; one that fails is tried again next time
async function keepAll(paths) {
  const queue = [...paths];
  const worker = async () => {
    while (queue.length) {
      try {
        await keep(queue.shift());
      } catch (e) {
        // offline, or the network dropped: left for next time
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(keepAll(CORE).then(() => self.skipWaiting()));
});

// a new version takes over at once, and lets go of the files kept by older ones
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((names) => Promise.all(names
      .filter((name) => name.startsWith("pianoguide-") && name !== CACHE && name !== LASTING)
      .map((name) => caches.delete(name))))
    .then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data === "save-all") event.waitUntil(keepAll(ALL));
});

// a page that isn't kept yet, offline
const OFFLINE_PAGE = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline | PianoGuide</title><style>body{margin:0;padding:48px 24px;font:17px/1.6 system-ui,sans-serif;background:#fafaf9;color:#1c1917}
@media(prefers-color-scheme:dark){body{background:#141210;color:#ede9e4}a{color:#e8a39f}}a{color:#962622;font-weight:700}</style></head>
<body><h1>You're offline</h1><p>This page hasn't been saved on this device yet. It will be next time you open it with the internet.</p>
<p><a href="${scope}">Go to the homepage</a></p></body></html>`;

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(scope)) return;
  const url = new URL(request.url);
  if (url.pathname.endsWith("/__reload")) return; // the dev server's live reload
  const path = url.href.slice(scope.length).split(/[?#]/)[0]; // the same page with any ?settings

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const kept = await caches.match(urlOf(path));
      const offlinePage = () => new Response(OFFLINE_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      if (self.navigator.onLine === false) return kept || offlinePage();
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = unredirected(response.clone());
          return cacheFor(path).then((cache) => cache.put(urlOf(path), copy)).then(() => response);
        }
        return response;
      });
      event.waitUntil(network.catch(() => {})); // keeps the fresh copy even if the kept one was shown
      if (!kept) return network.catch(offlinePage);
      const slow = new Promise((resolve) => { setTimeout(() => resolve(kept), 4000); });
      return Promise.race([network, slow]).catch(() => kept);
    })());
    return;
  }

  event.respondWith(caches.match(urlOf(path)).then((kept) => kept || fetch(request).then((response) => {
    if (response.ok && response.type === "basic") {
      const copy = response.clone();
      event.waitUntil(cacheFor(path).then((cache) => cache.put(urlOf(path), copy)));
    }
    return response;
  })));
});
