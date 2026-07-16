// Punch clock mirror. The server (KV punch:<email>:<date>) is the source of
// truth; this holds the last-known sessions for today+yesterday, derives the
// pill state, and queues failed actions with their REAL timestamps for
// ordered replay — the server accepts a bounded `at` up to 36h back, same
// contract the web app's punch-pending-q uses.

const fs = require("fs");
const path = require("path");
const api = require("./api");

function prevDate(date) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

class Punch {
  constructor(userData, onChange) {
    this.file = path.join(userData, "punch-pending.json");
    this.days = {}; // date → sessions[]
    this.onChange = onChange ?? (() => {});
    this.needsLogin = false;
    this.lastSync = 0;
  }

  readQueue() {
    try { return JSON.parse(fs.readFileSync(this.file, "utf8")); } catch { return []; }
  }

  writeQueue(q) {
    try { fs.writeFileSync(this.file, JSON.stringify(q.slice(-100))); } catch { /* best effort */ }
  }

  pendingCount() {
    return this.readQueue().length;
  }

  /** Open session across today/yesterday buckets, or null. */
  openSession() {
    const today = api.localDate();
    for (const date of [today, prevDate(today)]) {
      const open = (this.days[date] ?? []).find((ps) => ps.out == null);
      if (open) return { ...open, date };
    }
    return null;
  }

  /** Pill state: out | in | break, plus timing + client for the ticker. */
  state() {
    const open = this.openSession();
    if (!open) return { status: "out" };
    const onBreak = open.breaks.some((b) => b.e == null);
    return {
      status: onBreak ? "break" : "in",
      in: open.in,
      breaks: open.breaks,
      note: open.note ?? null,
      client: open.client ?? null,
      project: open.project ?? null,
      date: open.date,
    };
  }

  /** Current session ms (open session: in → now, minus breaks). Resets on
   *  clock-in and on client switch (a switch starts a new session). */
  sessionMs(now = Date.now()) {
    const open = this.openSession();
    if (!open) return 0;
    let ms = now - open.in;
    for (const b of open.breaks) ms -= (b.e ?? now) - b.s;
    return Math.max(0, ms);
  }

  /** Per-client worked ms today — the billing view. Groups sessions by their
   *  client attribution (unattributed = General), midnight-clipped like
   *  workedMsToday. `live` marks the client of the currently open session. */
  clientTotalsToday(now = Date.now()) {
    const midnight = new Date(now).setHours(0, 0, 0, 0);
    const open = this.openSession();
    const totals = new Map();
    for (const ps of Object.values(this.days).flat()) {
      const s0 = Math.max(ps.in, midnight);
      const e0 = ps.out ?? now;
      if (e0 <= s0) continue;
      let w = e0 - s0;
      for (const b of ps.breaks) w -= Math.max(0, Math.min(b.e ?? now, e0) - Math.max(b.s, s0));
      const n = ps.client?.n ?? "General";
      totals.set(n, (totals.get(n) ?? 0) + Math.max(0, w));
    }
    const liveN = open ? (open.client?.n ?? "General") : null;
    return [...totals.entries()]
      .map(([n, ms]) => ({ n, ms, live: n === liveN }))
      .sort((a, b) => b.ms - a.ms);
  }

  /** Total worked ms TODAY across every session — continuous across client
   *  switches. Mirrors the web pill's todayMin: only the portion after local
   *  midnight counts (an overnight session doesn't inflate today). */
  workedMsToday(now = Date.now()) {
    const midnight = new Date(now).setHours(0, 0, 0, 0);
    let ms = 0;
    for (const ps of Object.values(this.days).flat()) {
      const s0 = Math.max(ps.in, midnight);
      const e0 = ps.out ?? now;
      if (e0 <= s0) continue;
      let w = e0 - s0;
      for (const b of ps.breaks) w -= Math.max(0, Math.min(b.e ?? now, e0) - Math.max(b.s, s0));
      ms += Math.max(0, w);
    }
    return ms;
  }

  async sync() {
    const today = api.localDate();
    const res = await api.getPunch(prevDate(today), today);
    if (res.ok) {
      this.days = res.body.days ?? {};
      this.needsLogin = false;
      this.lastSync = Date.now();
      this.onChange();
    } else if (res.needsLogin) {
      this.needsLogin = true;
      this.onChange();
    }
    return res;
  }

  /**
   * Fire a punch action. Optimistically updates local state; on network/auth
   * failure the action queues with its real timestamp and state stays
   * optimistic so the pill keeps making sense offline.
   */
  async act(action, opts = {}) {
    const now = Date.now();
    const date = api.localDate(now);
    this.applyLocal(action, opts, now);
    this.onChange();
    const res = await api.punch(date, action, opts);
    if (res.ok) {
      this.days[res.body.date] = res.body.sessions;
      this.needsLogin = false;
      this.onChange();
      return { ok: true };
    }
    if (res.needsLogin) this.needsLogin = true;
    const q = this.readQueue();
    q.push({ date, action, opts: { ...opts, at: now } });
    this.writeQueue(q);
    this.onChange();
    return { queued: true, needsLogin: !!res.needsLogin };
  }

  /** Optimistic local mutation mirroring the server state machine (subset). */
  applyLocal(action, opts, now) {
    const date = api.localDate(now);
    const open = this.openSession();
    if (action === "in") {
      if (open) {
        const day = this.days[open.date] ?? [];
        const real = day.find((ps) => ps.out == null);
        if (real) { real.out = now; real.auto = true; }
      }
      this.days[date] = [...(this.days[date] ?? []), {
        in: now, out: null, breaks: [],
        ...(opts.note ? { note: opts.note } : {}),
        ...(opts.client?.id ? { client: opts.client } : {}),
        ...(opts.project ? { project: opts.project } : {}),
      }];
      return;
    }
    if (!open) return;
    const day = this.days[open.date] ?? [];
    const real = day.find((ps) => ps.out == null);
    if (!real) return;
    if (action === "break") {
      if (!real.breaks.some((b) => b.e == null)) real.breaks.push({ s: now, e: null });
    } else if (action === "resume") {
      const b = real.breaks.find((x) => x.e == null);
      if (b) b.e = now;
    } else if (action === "out") {
      for (const b of real.breaks) if (b.e == null) b.e = now;
      real.out = now;
    } else if (action === "outAt") {
      const at = Math.min(now, Math.max(real.in, Number(opts.outAtMs) || now));
      for (const b of real.breaks) if (b.e == null || b.e > at) b.e = Math.min(b.e ?? at, at);
      real.out = at;
      if (opts.lock) real.auto = true;
    } else if (action === "note") {
      if (opts.note) real.note = opts.note; else delete real.note;
    } else if (action === "switch") {
      // Note stays on the segment it described; the new segment starts blank.
      // opts.general = de-attribute. Split on CLIENT *or* PROJECT change, so
      // the local view matches the server's per-project billing split.
      const desiredClientId = opts.general ? null : (opts.client?.id ?? null);
      const openClientId = real.client?.id ?? null;
      const desiredProject = opts.project ?? null;
      const openProject = real.project ?? null;
      const validTarget = !!opts.client?.id || opts.general;
      if (validTarget && (desiredClientId !== openClientId || desiredProject !== openProject)) {
        for (const b of real.breaks) if (b.e == null) b.e = now;
        real.out = now;
        day.push({ in: now, out: null, breaks: [], ...(opts.client?.id ? { client: opts.client } : {}), ...(opts.project ? { project: opts.project } : {}) });
      }
    }
  }

  /** Newest punch activity timestamp in the synced server state. */
  latestServerActivity() {
    let latest = 0;
    for (const ps of Object.values(this.days).flat()) {
      latest = Math.max(latest, ps.in, ps.out ?? 0);
      for (const b of ps.breaks) latest = Math.max(latest, b.s, b.e ?? 0);
    }
    return latest;
  }

  /** Replay queued punches in order; stops at first failure to keep ordering.
   *  Server truth wins over a stale queue: actions queued BEFORE the latest
   *  server-side punch activity are dropped, not replayed — otherwise a
   *  clock-in queued on an offline machine an hour ago would stomp the live
   *  session you started from another device in the meantime. */
  async drain() {
    let q = this.readQueue();
    if (!q.length) return 0;
    const synced = await this.sync();
    if (!synced.ok) return q.length;
    const latest = this.latestServerActivity();
    const fresh = q.filter((it) => (it.opts?.at ?? 0) > latest);
    if (fresh.length < q.length) {
      console.log(`[sns-desk] dropped ${q.length - fresh.length} stale queued punch(es) — server state is newer`);
      this.writeQueue(fresh);
      q = fresh;
      if (!q.length) { this.onChange(); return 0; }
    }
    let i = 0;
    for (; i < q.length; i++) {
      const it = q[i];
      const res = await api.punch(it.date, it.action, it.opts);
      if (!res.ok) {
        if (res.needsLogin) this.needsLogin = true;
        break;
      }
    }
    this.writeQueue(q.slice(i));
    if (i > 0) await this.sync();
    return q.length - i;
  }
}

module.exports = { Punch, prevDate };
