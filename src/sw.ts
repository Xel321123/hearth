/// <reference lib="webworker" />
/**
 * Hearth service worker (injectManifest — bundled by vite-plugin-pwa).
 *
 * Responsibilities:
 *  1. Precache the app shell + built assets → the app loads fully offline.
 *  2. Network-first runtime caching for API GETs → offline you still see the
 *     last loaded data; writes are queued client-side (src/lib/offline.ts).
 *  3. Web Push: display incoming push notifications and route taps back into
 *     the app.
 */
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { ExpirationPlugin } from "workbox-expiration";
import { NetworkFirst } from "workbox-strategies";

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// API reads: network-first with a 4s timeout; cache fallback when offline.
registerRoute(
  ({ url, request }) =>
    request.method === "GET" &&
    (url.pathname.startsWith("/functions/v1/") || url.pathname.startsWith("/rest/v1/")),
  new NetworkFirst({
    cacheName: "hearth-api",
    networkTimeoutSeconds: 4,
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 })],
  }),
);

// SPA navigation: network first, precached shell as offline fallback.
// Paths resolve against the SW scope so this works at a Pages subpath too.
registerRoute(({ request }) => request.mode === "navigate", async ({ request }) => {
  try {
    return await fetch(request);
  } catch {
    const shellPath = new URL("index.html", self.registration.scope).pathname;
    const cached = (await caches.match(shellPath)) ?? (await caches.match("/index.html"));
    if (cached) return cached;
    return new Response("Offline — reconnect to load Hearth.", { status: 503 });
  }
});

// ── Web Push ──────────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let payload: { title?: unknown; body?: unknown; data?: Record<string, unknown> } = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Non-JSON payloads (e.g. test pings) still show a generic notification.
  }
  const title = typeof payload.title === "string" ? payload.title : "Hearth";
  const body = typeof payload.body === "string" ? payload.body : "Something needs your attention.";
  // Resolve icons against the SW scope — works at a Pages subpath.
  const icon = new URL("icons/icon-192.png", self.registration.scope).href;
  const options: NotificationOptions = {
    body,
    icon,
    badge: icon,
    data: payload.data ?? {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const scope = self.registration.scope;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        for (const win of windows) {
          if ("focus" in win) {
            win.focus();
            win.navigate(scope);
            return;
          }
        }
        return self.clients.openWindow(scope);
      }),
  );
});

// autoUpdate: activate new SW versions immediately when the page signals it.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
