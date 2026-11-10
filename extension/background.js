// S&S Desk Companion — samples the active tab once a minute and records time on
// an explicit allowlist of WORK platforms into the Stats & Strats timesheet.
// Nothing else is observed: domains outside the list are ignored entirely, and
// only the hostname is inspected (never URLs, titles, or page content).
//
// Segments post to the same /api/store timeseg pipeline the in-app tracker
// uses; Cloudflare Access authenticates via the browser's existing cookie.
// Failed posts (expired session, offline) queue locally and retry, so no time
// is lost — it appears after the next SNS login.

const API = "https://sns.xtremeroi.com/api/store";

// PLATFORMS, DENY, vetClientSites() and platformOf() live in sites.js, shared
// with the toolbar popup so the list people see is the list in use.
importScripts("sites.js");

const SAMPLE_MIN = 1;          // sampling cadence (minutes)
const IDLE_SECONDS = 300;      // machine idle beyond this → not working
const FLUSH_EVERY = 3;         // flush queue every N samples

// Client storefront sites (which clients we work with) are NOT listed in this
// code: they're fetched from S&S after sign-in and cached locally, so this
// public source and the Chrome Web Store package name no clients. Refreshed
// every 6 hours; if S&S can't be reached the last good list is kept.
// Every entry must pass vetClientSites() (sites.js), so S&S can add a specific
// client site but never a personal or general-purpose one. Any change to the
// list is recorded and badged on the toolbar icon until the person opens the
// popup and sees it.
const SITES_TTL = 6 * 3600000;
async function clientSites() {
  const now = Date.now();
  const { clientSitesCache } = await chrome.storage.local.get("clientSitesCache");
  if (clientSitesCache && now - clientSitesCache.at < SITES_TTL) return clientSitesCache.sites;
  try {
    const res = await fetch(`${API}?extSites=1`, { credentials: "include" });
    const json = (res.headers.get("content-type") || "").includes("json") ? await res.json() : null;
    if (json && json.ok && Array.isArray(json.sites)) {
      const { ok, rejected } = vetClientSites(json.sites);
      if (clientSitesCache) {
        const before = new Map(clientSitesCache.sites.map(([h, n]) => [h, n]));
        const after = new Map(ok.map(([h, n]) => [h, n]));
        const added = ok.filter(([h]) => !before.has(h));
        const removed = clientSitesCache.sites.filter(([h]) => !after.has(h));
        if (added.length || removed.length) {
          await chrome.storage.local.set({ sitesChange: { at: now, added, removed, seen: false } });
          await showChangeBadge();
        }
      }
      await chrome.storage.local.set({ clientSitesCache: { at: now, sites: ok, rejected } });
      return ok;
    }
  } catch { /* keep the last good list */ }
  return clientSitesCache ? clientSitesCache.sites : [];
}

async function showChangeBadge() {
  const { sitesChange } = await chrome.storage.local.get("sitesChange");
  const unseen = !!(sitesChange && !sitesChange.seen);
  await chrome.action.setBadgeBackgroundColor({ color: "#d97706" });
  await chrome.action.setBadgeText({ text: unseen ? "!" : "" });
  await chrome.action.setTitle({ title: unseen ? "S&S Desk Companion: tracked sites changed, click to see" : "S&S Desk Companion" });
}

const localDate = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Worked spans from punch sessions: each session's In..Out (open = now) with
// every break cut out. A sample only counts if it falls inside one of these.
function workIntervals(days, now) {
  const out = [];
  for (const sessions of Object.values(days ?? {})) {
    for (const ps of sessions ?? []) {
      if (typeof ps.in !== "number") continue;
      const end = ps.out ?? now;
      const breaks = (ps.breaks ?? [])
        .map((b) => [b.s, b.e ?? now])
        .filter(([s, e]) => typeof s === "number" && e > s)
        .sort((a, b) => a[0] - b[0]);
      let cur = ps.in;
      for (const [s, e] of breaks) {
        if (s > cur) out.push([cur, Math.min(s, end)]);
        cur = Math.max(cur, e);
      }
      if (end > cur) out.push([cur, end]);
    }
  }
  return out.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
}

async function fetchPunch(fromMs, now) {
  const res = await fetch(`${API}?punch=me&from=${localDate(fromMs - 86400000)}&to=${localDate(now)}`, { credentials: "include" });
  const json = (res.headers.get("content-type") || "").includes("json") ? await res.json() : null;
  return json && json.ok ? json : null;
}

// "Clocked out means invisible": sampling happens only during an open punch
// session that isn't on a break, same promise as S&S Desk. Punch truth is
// re-checked before every sample; when it can't be confirmed (offline, session
// expired) nothing is recorded, fail closed. Any sample that still lands after
// a break starts or the clock stops is cut at flush time against the real
// punch record (see flush), so a break never shows up as tracked activity.
const PUNCH_TTL = 50000;
async function isPunchedIn() {
  const now = Date.now();
  const { punchCache } = await chrome.storage.local.get("punchCache");
  if (punchCache && now - punchCache.at < PUNCH_TTL) return punchCache.in;
  let isIn = false;
  let state = "signed-out";
  try {
    const json = await fetchPunch(now, now);
    if (json) {
      const open = Object.values(json.days ?? {}).flat().filter((ps) => ps.out == null);
      const onBreak = open.some((ps) => (ps.breaks ?? []).some((b) => b.e == null));
      isIn = open.length > 0 && !onBreak;
      state = onBreak ? "break" : isIn ? "in" : "out";
    }
  } catch { /* fail closed */ }
  await chrome.storage.local.set({ punchCache: { at: now, in: isIn, state } });
  return isIn;
}

async function sample() {
  if (!(await isPunchedIn())) return;
  const idle = await chrome.idle.queryState(IDLE_SECONDS);
  if (idle !== "active") return;
  // Chrome has to be the app in front. Chrome reports a window as focused
  // only while it holds OS focus, so when someone switches to another app
  // (where S&S Desk does the tracking) the last Chrome tab is not counted.
  const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] }).catch(() => null);
  if (!win || !win.focused) return;
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  if (!tab || !tab.url) return;
  const plat = platformOf(tab.url, await clientSites());
  if (!plat) return;
  const now = Date.now();
  const { samples = [] } = await chrome.storage.local.get("samples");
  samples.push({ t: now, c: plat.c, n: plat.n });
  await chrome.storage.local.set({ samples: samples.slice(-1000) });
}

// Coalesce minute samples into contiguous blocks per platform, then post.
// Each sample stands for the minute before it. Samples outside a worked span
// are dropped, and a block never crosses a break, a clock-out, or a day, so
// break time can't be absorbed into the activity on either side of it.
function toBlocks(samples, intervals) {
  const step = SAMPLE_MIN * 60000;
  const blocks = [];
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  for (const s of sorted) {
    const iv = intervals.findIndex(([a, b]) => s.t > a && s.t <= b);
    if (iv < 0) continue;
    const start = Math.max(s.t - step, intervals[iv][0]);
    const last = blocks[blocks.length - 1];
    if (last && last.c === s.c && last.iv === iv && s.t - last.e <= step * 2 && localDate(s.t) === localDate(last.s)) {
      last.e = s.t;
    } else {
      blocks.push({ s: start, e: s.t, c: s.c, n: s.n, iv });
    }
  }
  return blocks.map(({ iv, ...b }) => b);
}

async function flush() {
  const { samples = [], pending = [] } = await chrome.storage.local.get(["samples", "pending"]);
  let blocks = [];
  let keep = samples;
  if (samples.length) {
    const now = Date.now();
    const json = await fetchPunch(Math.min(...samples.map((s) => s.t)), now).catch(() => null);
    // No punch record (offline, signed out): hold the samples rather than
    // post anything that hasn't been checked against breaks.
    if (json) {
      blocks = toBlocks(samples, workIntervals(json.days, now));
      keep = [];
    }
  }
  const work = [...pending, ...blocks];
  await chrome.storage.local.set({ samples: keep, pending: [] });
  if (!work.length) return;
  const failed = [];
  for (const b of work) {
    try {
      const res = await fetch(API, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "timeseg", week: localDate(b.s), value: b }),
      });
      const json = await res.json().catch(() => null);
      if (!json || !json.ok) failed.push(b);
    } catch {
      failed.push(b);
    }
  }
  if (failed.length) {
    const { pending: cur = [] } = await chrome.storage.local.get("pending");
    await chrome.storage.local.set({ pending: [...cur, ...failed].slice(-200) });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("sns-sample", { periodInMinutes: SAMPLE_MIN });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("sns-sample", { periodInMinutes: SAMPLE_MIN });
  showChangeBadge();
});

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== "sns-sample") return;
  // lastSeen freezes when the machine sleeps (alarms stop firing), giving a
  // fallback "away since" timestamp when no lock event was delivered.
  await chrome.storage.local.set({ lastSeen: Date.now() });
  await sample();
  // Flush cadence must be PERSISTED: MV3 kills this service worker between
  // minute alarms, so an in-memory counter resets every wake and never hits
  // its modulus — that bug silently prevented ALL posting in ≤1.2.4.
  const { lastFlushAt = 0 } = await chrome.storage.local.get("lastFlushAt");
  if (Date.now() - lastFlushAt >= FLUSH_EVERY * 60000 - 5000) {
    await chrome.storage.local.set({ lastFlushAt: Date.now() });
    await flush();
  }
});

// --- Auto clock-out after a lock/sleep grace period -------------------------
// Closing the lid locks the screen; chrome.idle reports "locked". If the
// machine stays locked or asleep past the manager-set grace period while the
// user is clocked in, clock them out retroactively AT THE LOCK TIME and flag
// the session (auto) for correction in the Time day view. Short locks (calls,
// meetings) never trigger — the punch clock keeps running through those.

const LOCK_GRACE_DEFAULT = 45; // minutes; manager-configurable in SNS Setup

async function lockGraceMin() {
  try {
    const res = await fetch(API, { credentials: "include" });
    const json = await res.json();
    if (json && json.ok && typeof json.punchLockMin === "number") return json.punchLockMin;
  } catch { /* offline/expired: use default */ }
  return LOCK_GRACE_DEFAULT;
}

// Find the open punch session (bucketed under its start date, so check both
// the away-start day and the prior day) and close it at `atMs`.
async function autoClockOut(atMs) {
  const from = localDate(atMs - 86400000);
  const to = localDate(atMs);
  try {
    const res = await fetch(`${API}?punch=me&from=${from}&to=${to}`, { credentials: "include" });
    const json = await res.json();
    if (!json || !json.ok) return;
    for (const [date, sessions] of Object.entries(json.days ?? {})) {
      if ((sessions ?? []).some((ps) => ps.out == null)) {
        await fetch(API, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "punch", week: date, value: "outAt", actionId: String(atMs), client: "lock" }),
        });
        return;
      }
    }
  } catch { /* no session or offline: nothing to do */ }
}

chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === "locked") {
    await chrome.storage.local.set({ lockedAt: Date.now() });
  } else if (state === "active") {
    const { lockedAt = 0, lastSeen = 0 } = await chrome.storage.local.get(["lockedAt", "lastSeen"]);
    await chrome.storage.local.set({ lockedAt: 0 });
    const awaySince = lockedAt || lastSeen; // lock event, else sleep fallback
    if (!awaySince) return;
    const grace = await lockGraceMin();
    if (Date.now() - awaySince >= grace * 60000) await autoClockOut(awaySince);
  }
});
