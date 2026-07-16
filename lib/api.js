// S&S API client. All calls ride Electron's default session cookie jar, so the
// CF_Authorization cookie captured by the login window authenticates every
// request exactly like a browser tab would. An Access-expired session returns
// the Access login HTML (or a redirect) instead of JSON — that surfaces here
// as { needsLogin: true } rather than an exception, and the caller decides
// whether to prompt for re-login or queue the write.

const { net } = require("electron");

const BASE = "https://sns.xtremeroi.com";
const STORE = `${BASE}/api/store`;

async function call(url, init = {}) {
  let res;
  try {
    res = await net.fetch(url, {
      credentials: "include",
      redirect: "manual",
      ...init,
      headers: { accept: "application/json", ...(init.headers ?? {}) },
    });
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    // Electron's net.fetch rejects manual redirects with "Redirect was
    // cancelled" — for our API the only redirect is Access's login bounce, so
    // this IS the definitive expired-session signal.
    if (/redirect/i.test(msg)) return { needsLogin: true };
    return { offline: true, error: msg };
  }
  if (process.env.SNSDESK_DEBUG) console.log("[api]", init.method ?? "GET", url, "->", res.status, res.headers.get("content-type"));
  // Expiry ALWAYS arrives as a redirect (302) to the Access login — either the
  // thrown "redirect cancelled" above or a 3xx status here. Only those flip the
  // ⚠ badge.
  if (res.status >= 300 && res.status < 400) return { needsLogin: true };
  const ctype = res.headers.get("content-type") ?? "";
  // A NON-redirect, non-JSON body is a transient edge/server hiccup (a
  // Cloudflare 5xx error page, a challenge, a blip) — NOT an expired session.
  // Treat it as a temporary failure so a one-off glitch never falsely trips
  // "sign in needed"; the caller keeps its state and retries next cycle.
  if (!ctype.includes("application/json")) return { offline: true, error: `unexpected non-JSON (${res.status})` };
  let body;
  try {
    body = await res.json();
  } catch {
    return { offline: true, error: "invalid JSON response" };
  }
  if (!res.ok) return { error: body?.error ?? `HTTP ${res.status}`, status: res.status, body };
  return { ok: true, body };
}

/** Global state: actor email, team/manager flags, roster, idle + lock thresholds. */
function getGlobal() {
  return call(STORE);
}

/** Own punch sessions for a local-date range (YYYY-MM-DD). */
function getPunch(from, to) {
  return call(`${STORE}?punch=me&from=${from}&to=${to ?? from}`);
}

/** Own activity blocks for a local-date range. */
function getTime(from, to) {
  return call(`${STORE}?time=me&from=${from}&to=${to ?? from}`);
}

/** Own leave requests (PTO / sick), each { id, type, date, endDate?, status }. */
function getLeave() {
  return call(`${STORE}?leave=me`);
}

/** Per-client project registry: { [clientId]: string[] } (team-readable). */
function getClientProjects() {
  return call(`${STORE}?clientProjects=1`);
}

function post(payload) {
  return call(STORE, { method: "POST", body: JSON.stringify(payload), headers: { "content-type": "application/json" } });
}

/**
 * Punch action. action: in|break|resume|out|outAt|note|switch
 * opts: { client: {id,n} | "lock", note, at (real ms for offline replays), outAtMs }
 */
function punch(dateLocal, action, opts = {}) {
  const payload = { kind: "punch", week: dateLocal, value: action };
  if (opts.at) payload.at = opts.at;
  if (action === "outAt") {
    payload.actionId = String(opts.outAtMs ?? "");
    if (opts.lock) payload.client = "lock";
  } else if (opts.note != null) {
    payload.actionId = String(opts.note).slice(0, 80);
  }
  if (opts.client && opts.client.id) payload.client = `${opts.client.id}|${opts.client.n}`;
  else if (opts.general) payload.client = "general"; // switch to the neutral bucket
  if (opts.project) payload.project = String(opts.project).slice(0, 60);
  return post(payload);
}

/** Activity block {s,e,c,n} for a local date. Server merges within idle threshold. */
function putTimeSegment(dateLocal, block) {
  return post({ kind: "timeseg", week: dateLocal, value: block });
}

const localDate = (ms) => {
  const d = new Date(ms ?? Date.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

module.exports = { BASE, getGlobal, getPunch, getTime, getLeave, getClientProjects, punch, putTimeSegment, localDate };
