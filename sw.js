/* =====================================================================
   우리팀 허브 — 서비스 워커 (오프라인 캐시)
   · GitHub Pages 하위 경로(/team-hub/)에서도 동작하도록 모든 경로는 ./ 상대경로
   · 앱(index.html)은 '캐시 먼저 → 뒤에서 새 버전 확인' 방식:
     - 섬·출장지에서 전파가 약해도 화면이 바로 뜹니다(수십 ms).
     - 새 배포가 있으면 백그라운드에서 캐시를 갱신하고, 열려 있는 앱에
       '새 버전이 있어요' 신호를 보냅니다(앱 상단 배너 → 새로고침).
   · 아이콘·매니페스트는 거의 안 바뀌므로 캐시 우선.
   · Firebase·기상청 API·카카오 등 외부 주소는 절대 건드리지 않습니다(그대로 네트워크).
   · SW 로직이나 캐시 목록을 바꾸면 SW_VERSION 을 올려 주세요.
   ===================================================================== */
const SW_VERSION = "th-2026-11-27-6";
const CACHE = "teamhub-" + SW_VERSION;
const SCOPE_PATH = new URL(self.registration.scope).pathname;   /* 예: /team-hub/ */
const SHELL_INDEX = new URL("./index.html", self.location.href).href;
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];
const HTML_HEAD = { "Content-Type": "text/html; charset=utf-8" };
/* 이 워커가 화면(index.html) 캐시를 마지막으로 새로 받은 시각.
   화면이 늦게 뜨면서 알림을 놓치는 경우가 있어, 앱이 따로 물어볼 수 있게 합니다(th-check). */
let shellUpdatedAt = 0;

/* 앱이 열려 있으면 새 버전/새 내용을 알려 줍니다 */
function tellClients(type, extra) {
  return self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then(list => {
    list.forEach(c => { try { c.postMessage(Object.assign({ type: type, version: SW_VERSION }, extra || {})); } catch (e) {} });
  });
}

/* ---------- 🔔 웹 푸시 알림 ----------
   Worker(teamhub-push)가 보낸 암호화 페이로드를 브라우저가 복호화해 push 이벤트로 전달합니다.
   { title, body, url, type, tag } — url 은 앱 안의 화면(#notices·#duty)까지 지정합니다. */
self.addEventListener("push", event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) {
    try { d = { title: "우리팀 허브", body: event.data ? event.data.text() : "" }; } catch (e2) { d = {}; }
  }
  const title = d.title || "우리팀 허브";
  const body = d.body || "새 소식이 있어요";
  const url = d.url || "./#notices";
  const opts = {
    body: body,
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: d.tag || ("th-" + (d.type || "notice")),
    renotify: true,
    requireInteraction: false,
    data: { url: url, type: d.type || "notice", at: Date.now() },
    vibrate: [80, 40, 80],
    timestamp: Date.now()
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

/* 알림을 누르면 — 열려 있는 앱이 있으면 그 창을 띄우고 해당 화면으로, 없으면 새로 엽니다 */
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const data = event.notification.data || {};
  const raw = data.url || "./#notices";
  let target = self.registration.scope;
  let hash = "";
  try {
    const u = new URL(raw, self.location.href);
    target = u.href;
    hash = u.hash || "";
  } catch (e) {}
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (list && list.length) {
      const c = list[0];
      try { await c.focus(); } catch (e) {}
      try { c.postMessage({ type: "th-open", hash: hash, url: target }); } catch (e) {}
      /* 앱 화면이 아닌 다른 페이지를 보고 있을 때만 이동 (같은 앱이면 탭만 전환) */
      try {
        const same = c.url && c.url.split("#")[0] === target.split("#")[0];
        if (!same && c.navigate) await c.navigate(target);
      } catch (e) {}
      return;
    }
    try { await self.clients.openWindow(target); } catch (e) {}
  })());
});

/* 구독이 브라우저 쪽에서 갱신되면 앱에 알려 다시 등록하게 합니다 */
self.addEventListener("pushsubscriptionchange", event => {
  event.waitUntil(tellClients("th-push-changed"));
});

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(u => cache.add(new Request(u, { cache: "reload" })).catch(() => {})));
    /* 새 워커가 대기하지 않고 바로 활성화 — 배포 즉시 반영 */
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.indexOf("teamhub-") === 0 && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    await tellClients("th-sw-activated");
  })());
});

/* 앱이 '이 화면보다 새 화면이 있나?' 물어보면 답합니다 */
self.addEventListener("message", event => {
  const d = event.data || {};
  if (d.type === "th-check" && event.ports && event.ports[0]) {
    try { event.ports[0].postMessage({ type: "th-check-ok", version: SW_VERSION, shellUpdatedAt: shellUpdatedAt }); } catch (e) {}
  }
});

/* ---------- 화면(HTML): 캐시 먼저 + 백그라운드 갱신 ----------
   fetch 핸들러가 끝나도 워커가 곧바로 잠들 수 있으므로,
   새 화면을 받아 비교·저장하는 일은 event.waitUntil 로 붙잡아 둡니다. */
async function revalidateDocument(request) {
  let res = null;
  /* 주의 1: 탐색(navigate) 요청 객체는 그대로 fetch() 할 수 없어(브라우저 제한)
     캐시 키와 같은 주소로 새 요청을 만들어 씨 네트워크의 최신 화면을 받습니다.
     주의 2: 화면에 보낼 응답과 같은 Response 객체를 두 번 읽으면 'body already used'가
     납니다. 그래서 예전 화면은 캐시를 한 번 더 읽어(별도 Response) 비교합니다. */
  try { res = await fetch(new Request(SHELL_INDEX, { cache: "no-store", credentials: "same-origin" })); } catch (e) { return null; }
  if (!res || !res.ok || res.type === "opaque") return res;
  try {
    const fresh = await res.clone().text();
    const oldRes = await caches.match(SHELL_INDEX);
    const old = oldRes ? await oldRes.text() : "";
    if (fresh !== old) {
      const cache = await caches.open(CACHE);
      await cache.put(SHELL_INDEX, new Response(fresh, { headers: HTML_HEAD }));
      shellUpdatedAt = Date.now();
      if (old) await tellClients("th-shell-updated");
    }
  } catch (e) { /* 본문을 못 읽어도 응답은 그대로 돌려 줍니다 */ }
  return res;
}

function offlinePage() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>우리팀 허브</title><div style="font-family:-apple-system,sans-serif;padding:40px 22px;text-align:center;color:#141a24">' +
    '<div style="font-size:40px">📡</div><h2 style="margin:12px 0 6px;font-size:17px">연결이 잠시 끊겼어요</h2>' +
    '<p style="font-size:13px;color:#5c6577;line-height:1.6">네트워크가 돌아오면 다시 열어 주세요.<br>한 번이라도 열었던 앱은 캐시에서 바로 뜹니다.</p>' +
    '<button onclick="location.reload()" style="margin-top:16px;padding:11px 20px;border:0;border-radius:12px;background:#2f6bf6;color:#fff;font-size:14px;font-weight:700">다시 시도</button></div>',
    { headers: HTML_HEAD }
  );
}

/* ---------- 아이콘·매니페스트 등: 캐시 우선 ---------- */
async function handleAsset(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res && res.ok) { try { await cache.put(request, res.clone()); } catch (e) {} }
    return res;
  } catch (e) {
    return new Response("", { status: 504, statusText: "offline" });
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;                 /* 대화 전송 등은 그대로 네트워크 */
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;      /* Firebase·기상청·카카오·지도는 손대지 않음 */
  if (url.pathname.indexOf(SCOPE_PATH) !== 0) return;   /* /team-hub/ 밖은 그대로 */

  const isDoc = request.mode === "navigate" ||
    (request.headers.get("accept") || "").indexOf("text/html") >= 0;

  if (isDoc) {
    const cachedP = caches.match(SHELL_INDEX);
    const freshP = revalidateDocument(request).catch(() => null);
    event.waitUntil(freshP);
    event.respondWith((async () => {
      const cached = await cachedP;
      if (cached) return cached;                        /* 전파 약해도 즉시 표시 */
      const res = await freshP;
      return (res && res.ok) ? res : offlinePage();
    })());
    return;
  }
  event.respondWith(handleAsset(request));
});
