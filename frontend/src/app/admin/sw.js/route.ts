const ADMIN_CACHE = "lakodi-admin-shell-v1";
const ADMIN_OFFLINE_ROUTES = ["/admin/login", "/admin/"];

const script = `
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("${ADMIN_CACHE}").then((cache) => cache.addAll(${JSON.stringify(ADMIN_OFFLINE_ROUTES)})),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key === "${ADMIN_CACHE}") {
            return Promise.resolve(false);
          }
          if (!key.startsWith("lakodi-admin-shell-")) {
            return Promise.resolve(false);
          }
          return caches.delete(key);
        }),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (!url.pathname.startsWith("/admin/")) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }

        const responseToCache = response.clone();
        caches.open("${ADMIN_CACHE}").then((cache) => cache.put(request, responseToCache));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) {
          return cached;
        }
        const loginFallback = await caches.match("/admin/login");
        if (loginFallback) {
          return loginFallback;
        }
        throw new Error("offline");
      }),
  );
});
`;

export function GET() {
  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
