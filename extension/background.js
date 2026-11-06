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

// hostname (suffix match) → platform label shown on the timesheet
const PLATFORMS = [
  // Order matters: first suffix match wins, so specific subdomains
  // (adsmanager.facebook.com, ads.tiktok.com) come before their parents.
  ["sellercentral.amazon.com", "Seller Central"],
  ["vendorcentral.amazon.com", "Vendor Central"],
  ["advertising.amazon.com", "Amazon Ads"],
  ["business.amazon.com", "Amazon Business"],
  ["perpetua.io", "Perpetua"],
  ["netsuite.com", "NetSuite"],
  ["adsmanager.facebook.com", "Meta Ads Manager"],
  ["business.facebook.com", "Meta Business Suite"],
  ["meta.com", "Meta"],
  // Instagram is deliberately broad: client reels are reviewed from the
  // audience view, not a business surface.
  ["instagram.com", "Instagram"],
  ["ads.google.com", "Google Ads"],
  ["mail.google.com", "Gmail"],
  ["meet.google.com", "Google Meet"],
  ["calendar.google.com", "Google Calendar"],
  ["google.com", "Google"],
  ["ads.tiktok.com", "TikTok Ads"],
  ["seller.tiktok.com", "TikTok Seller Center"],
  ["tiktok.com", "TikTok"],
  ["shopify.com", "Shopify"],
  ["helium10.com", "Helium 10"],
  ["datadive.tools", "Data Dive"],
  ["workmagic.io", "WorkMagic"],
  ["integrator.io", "Integrator.io"],
  ["zapier.com", "Zapier"],
  ["xtremeroi.com", "XtremeROI"],
  ["chatgpt.com", "ChatGPT"],
  ["claude.com", "Claude"],
  ["claude.ai", "Claude"],
  ["applovin.com", "AppLovin"],
  // Snapchat is deliberately narrow: bare snapchat.com is consumer use.
  ["business.snapchat.com", "Snapchat Ads"],
  ["slack.com", "Slack"],
  ["zoom.us", "Zoom"],
  ["zoom.com", "Zoom"],
  // Teams is narrow: bare microsoft.com would sweep in every MS property.
  ["teams.microsoft.com", "Microsoft Teams"],
  ["calendly.com", "Calendly"],
];
// Never tracked, even though a broad suffix above would match:
// sns.xtremeroi.com (the app tracks itself) and login.xtremeroi.com (auth redirect).
const DENY = ["sns.xtremeroi.com", "login.xtremeroi.com"];

const SAMPLE_MIN = 1;          // sampling cadence (minutes)
const IDLE_SECONDS = 300;      // machine idle beyond this → not working
const FLUSH_EVERY = 3;         // flush queue every N samples

// Client storefront sites (which clients we work with) are NOT listed in this
// code: they're fetched from S&S after sign-in and cached locally, so this
// public source and the Chrome Web Store package name no clients. Refreshed
// every 6 hours; if S&S can't be reached the last good list is kept.
const SITES_TTL = 6 * 3600000;
async function clientSites() {
  const now = Date.now();
  const { clientSitesCache } = await chrome.storage.local.get("clientSitesCache");
  if (clientSitesCache && now - clientSitesCache.at < SITES_TTL) return clientSitesCache.sites;
  try {
    const res = await fetch(`${API}?extSites=1`, { credentials: "include" });
    const json = (res.headers.get("content-type") || "").includes("json") ? await res.json() : null;
    if (json && json.ok && Array.isArray(json.sites)) {
      await chrome.storage.local.set({ clientSitesCache: { at: now, sites: json.sites } });
      return json.sites;
    }
  } catch { /* keep the last good list */ }
  return clientSitesCache ? clientSitesCache.sites : [];
}

function platformOf(url, extra = []) {
  try {
    const h = new URL(url).hostname;
    if (DENY.some((d) => h === d || h.endsWith("." + d))) return null;
    for (const [suffix, label] of [...extra, ...PLATFORMS]) {
      if (h === suffix || h.endsWith("." + suffix)) return { c: "ext:" + suffix, n: label };
    }
  } catch { /* ignore */ }
  return null;
}

const localDate = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// "Clocked out means invisible": sampling happens only during an open punch
// session, same promise as S&S Desk. Punch truth is re-checked at most every
// 2 minutes; when it can't be confirmed (offline, session expired) nothing is
// recorded — fail closed.
const PUNCH_TTL = 2 * 60000;
async function isPunchedIn() {
  const now = Date.now();
  const { punchCache } = await chrome.storage.local.get("punchCache");
  if (punchCache && now - punchCache.at < PUNCH_TTL) return punchCache.in;
  let isIn = false;
  try {
    const from = localDate(now - 86400000), to = localDate(now);
    const res = await fetch(`${API}?punch=me&from=${from}&to=${to}`, { credentials: "include" });
    const json = (res.headers.get("content-type") || "").includes("json") ? await res.json() : null;
    // Clocked in AND not on a break: a break is the person's own time, so
    // nothing is sampled during it (Randy, 2026-11-02), same as S&S Desk.
    if (json && json.ok) isIn = Object.values(json.days ?? {}).some((day) => day.some((ps) => ps.out == null && !(ps.breaks ?? []).some((b) => b.e == null)));
  } catch { /* fail closed */ }
  await chrome.storage.local.set({ punchCache: { at: now, in: isIn } });
  return isIn;
}

async function sample() {
  if (!(await isPunchedIn())) return;
  const idle = await chrome.idle.queryState(IDLE_SECONDS);
  if (idle !== "active") return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.url) return;
  const plat = platformOf(tab.url, await clientSites());
  if (!plat) return;
  const now = Date.now();
  const { samples = [] } = await chrome.storage.local.get("samples");
  samples.push({ t: now, c: plat.c, n: plat.n });
  await chrome.storage.local.set({ samples: samples.slice(-1000) });
}

// Coalesce minute samples into contiguous blocks per platform, then post.
function toBlocks(samples) {
  const blocks = [];
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  for (const s of sorted) {
    const last = blocks[blocks.length - 1];
    const step = SAMPLE_MIN * 60000;
    if (last && last.c === s.c && s.t - last.e <= step * 2 && localDate(s.t) === localDate(last.s)) {
      last.e = s.t;
    } else {
      blocks.push({ s: s.t - step, e: s.t, c: s.c, n: s.n });
    }
  }
  return blocks;
}

async function flush() {
  const { samples = [], pending = [] } = await chrome.storage.local.get(["samples", "pending"]);
  const work = [...pending, ...toBlocks(samples)];
  if (!work.length) return;
  await chrome.storage.local.set({ samples: [], pending: [] });
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
