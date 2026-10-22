const VERSION = "20261022172214";
const CACHE = `pyl2-mobile-${VERSION}`;

const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./css/app.css",
  "./css/mobile.css",
  "./vendor/codemirror/lib/codemirror.css",
  "./vendor/codemirror/lib/codemirror.js",
  "./vendor/codemirror/mode/python/python.js",
  "./js/app.js",
  "./js/api.js",
  "./js/ui.js",
  "./js/runner.js",
  "./js/pyodide-worker.js",
  "./js/views/home.js",
  "./js/views/learn.js",
  "./js/views/chapter.js",
  "./js/views/practice.js",
  "./js/views/wrongbook.js",
  "./js/views/exam.js",
  "./js/views/code.js",
  "./js/views/stats.js",
  "./js/views/cheatsheet.js",
  "./js/views/settings.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html").then((cached) => cached || fetch(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          if (request.destination === "document") return caches.match("./index.html");
          throw new Error("offline");
        });
    })
  );
});
