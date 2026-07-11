const CACHE_NAME = "amc-console-v6";

function scopeBasePath() {
  const scope = new URL(self.registration.scope);
  const clean = scope.pathname.endsWith("/") ? scope.pathname.slice(0, -1) : scope.pathname;
  return clean || "/console";
}

function assetPath(path) {
  const clean = path.startsWith("/") ? path.slice(1) : path;
  return `${scopeBasePath()}/${clean}`;
}

function staticAssets() {
  return [
    assetPath(""),
    assetPath("home"),
    assetPath("login"),
    assetPath("agent"),
    assetPath("evidence"),
    assetPath("fleet"),
    assetPath("runtime"),
    assetPath("firewall"),
    assetPath("equalizer"),
    assetPath("governor"),
    assetPath("toolhub"),
    assetPath("approvals"),
    assetPath("users"),
    assetPath("leases"),
    assetPath("budgets"),
    assetPath("drift"),
    assetPath("benchmarks"),
    assetPath("workorders"),
    assetPath("transparency"),
    assetPath("policypacks"),
    assetPath("northstar"),
    assetPath("assets/app.js"),
    assetPath("assets/api.js"),
    assetPath("assets/charts.js"),
    assetPath("assets/northstar.js"),
    assetPath("assets/components/promptViewer.js"),
    assetPath("assets/components/promptStatusChip.js"),
    assetPath("assets/components/promptDiffViewer.js"),
    assetPath("assets/qr.js"),
    assetPath("assets/styles.css"),
    assetPath("assets/manifest.json"),
    assetPath("assets/icons/compass.svg")
  ];
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(staticAssets());
      try {
        const snapshotPath = assetPath("snapshot");
        const snapshot = await fetch(snapshotPath);
        if (snapshot.ok) {
          await cache.put(snapshotPath, snapshot.clone());
        }
      } catch {
        // Snapshot can be absent on first run.
      }
      await self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") {
    return;
  }
  const url = new URL(req.url);
  const base = scopeBasePath();
  if (!url.pathname.startsWith(`${base}/`) && url.pathname !== base) {
    return;
  }

  const snapshotPath = assetPath("snapshot");

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(req, response.clone());
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          const fallback = await caches.match(assetPath("home"));
          return cached || fallback || new Response("offline", { status: 503 });
        })
    );
    return;
  }

  if (url.pathname === snapshotPath) {
    event.respondWith(
      fetch(req)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(snapshotPath, response.clone());
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(snapshotPath);
          return cached || new Response(JSON.stringify({ error: "offline snapshot unavailable" }), { status: 503 });
        })
    );
    return;
  }

  if (!url.pathname.includes("/assets/")) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(req, response.clone());
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(req) || await caches.match(url.pathname);
        return cached || new Response("offline", { status: 503 });
      })
  );
});
