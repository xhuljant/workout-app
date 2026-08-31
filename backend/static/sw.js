/* Service worker for Workout Log.
 *
 * Push-only for now (no offline caching): its whole job is to show a
 * notification when the backend sends a "rest timer done" Web Push while the
 * app isn't in the foreground. If a window is already visible and focused, the
 * in-app countdown handled it, so we stay quiet.
 */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = {};
  }
  const title = payload.title || "Rest over";
  const body = payload.body || "Time for your next set.";
  const tag = payload.tag || "rest-timer";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const focused = clientList.some(
        (c) => c.visibilityState === "visible" && c.focused,
      );
      if (focused) return; // the open app already beeped/vibrated

      await self.registration.showNotification(title, {
        body,
        tag,
        renotify: true,
        vibrate: [200, 100, 200],
        silent: false,
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const c of clientList) {
        if ("focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })(),
  );
});
