/* eslint-disable no-restricted-globals */
self.addEventListener("push", (event) => {
  let title = "Ken Workspace";
  let body = "";
  let url = "/calendar";
  let tag = "ken-calendar";
  try {
    if (event.data) {
      const j = event.data.json();
      if (j && typeof j === "object") {
        if (typeof j.title === "string") title = j.title;
        if (typeof j.body === "string") body = j.body;
        if (typeof j.url === "string") url = j.url;
        if (typeof j.tag === "string") tag = j.tag;
      }
    }
  } catch {
    /* ignore */
  }
  const icon = "/pwa/icon-192.png";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body || "Calendar",
      icon,
      badge: icon,
      data: { url },
      tag,
      // Stays until dismissed; stronger on desktop than auto-hiding banners.
      requireInteraction: true,
      silent: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data?.url || "/calendar";
  const origin = new URL(self.registration.scope).origin;
  const full = raw.startsWith("http") ? raw : `${origin}${raw.startsWith("/") ? raw : `/${raw}`}`;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(origin) && "focus" in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(full);
    }),
  );
});

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
