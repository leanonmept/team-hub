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
const SW_VERSION = "th-2026-11-26-1";
const CACHE = "teamhub-" + SW_VERSION;
const SCOPE_PATH = new URL(self.registration.scope).pathname;   // 예: /team-hub/
const SHELL_INDEX = new URL("./index.html", self.location.href).href;
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

/* 앱이 열려 있으면 새 버전/새 내용을 알려 줍니다 */
function tellClients(type, extra) {
  return self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then(list => {
    list.forEach(c => { try { c.postMessage(Object.assign({ type: type, version: SW_VERSION }, extra || {})); } catch (e) {} });
  });
}

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

/* ---------- 캐시 키: ?demo=1 같은 쿼리는 무시하고 같은 파일로 봅니다 ---------- */
function cacheKeyFor(request) {
  const url = new URL(request.url);
  url.search = "";
  return url.href;
}

/* ---------- 화면(HTML): 캐시 먼저 + 백그라운드 갱신 ---------- */
async function handleDocument(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(SHELL_INDEX);
  const revalidate = fetch(request, { cache: "no-store" }).then(async res => {
    if (!res || !res.ok) return res;
    if (res.type === "opaque") return res;
    const fresh = await res.clone().text();
    let old = "";
    if (cached) { try { old = await cached.clone().text(); } catch (e) { old = ""; } }
    if (fresh !== old) {
      try {
        await cache.put(SHELL_INDEX, new Response(fresh, {
          headers: { "Content-Type": "text/html; charset=utf-8", "X-Cached-At": String(Date.now()) }
        }));
      } catch (e) {}
      /* 앱이 이미 열려 있으면 '새 버전 있어요' 안내 */
      if (old) tellClients("th-shell-updated");
    }
    return res;
  }).catch(() => null);

  if (cached) return cached;             /* 전파 약해도 즉시 표시 */
  const res = await revalidate;
  if (res && res.ok) return res;
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>우리팀 허브</title><div style="font-family:-apple-system,sans-serif;padding:40px 22px;text-align:center;color:#141a24">' +
    '<div style="font-size:40px">📡</div><h2 style="margin:12px 0 6px;font-size:17px">연결이 잠시 끊겼어요</h2>' +
    '<p style="font-size:13px;color:#5c6577;line-height:1.6">네트워크가 돌아오면 다시 열어 주세요.<br>한 번이라도 열었던 앱은 캐시에서 바로 뜹니다.</p>' +
    '<button onclick="location.reload()" style="margin-top:16px;padding:11px 20px;border:0;border-radius:12px;background:#2f6bf6;color:#fff;font-size:14px;font-weight:700">다시 시도</button></div>',
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

/* ---------- 아이콘·매니페스트 등: 캐시 우선 ---------- */
async function handleAsset(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res && res.ok) { try { await cache.put(request, res.clone()); } catch (e) {} }
    return res;
  } catch (e) {
    const key = cacheKeyFor(request);
    const alt = await caches.match(key);
    return alt || new Response("", { status: 504, statusText: "offline" });
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

  if (isDoc) { event.respondWith(handleDocument(request)); return; }
  event.respondWith(handleAsset(request));
});
