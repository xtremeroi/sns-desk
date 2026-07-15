// Desktop-wide activity tracking. Samples the frontmost application via
// lsappinfo (app NAME only — never window titles or content, matching the
// Chrome extension's privacy posture; lsappinfo needs no TCC grant), gates on
// system idle time, and coalesces samples into contiguous per-app blocks.
//
// Tracking runs ONLY while clocked in — off the clock nothing is observed or
// recorded, locally or otherwise. Blocks land in the local day log (the
// popup's personal view) and post to the S&S timesheet.

const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const SAMPLE_MS = 30_000;      // sampling cadence
const IDLE_GATE_S = 300;       // machine idle beyond this → not working
const GAP_MS = SAMPLE_MS * 2.5; // gap that closes a block
// The tracker never records itself ("Electron" is the dev-mode shell name).
const SELF_APPS = ["S&S Desk", "Electron"];

function frontApp() {
  return new Promise((resolve) => {
    execFile("lsappinfo", ["front"], { timeout: 3000 }, (err, out) => {
      const asn = (out ?? "").trim();
      if (err || !asn) return resolve(null);
      execFile("lsappinfo", ["info", "-only", "name", asn], { timeout: 3000 }, (err2, out2) => {
        if (err2) return resolve(null);
        const m = /"LSDisplayName"\s*=\s*"(.+)"/.exec(out2 ?? "");
        resolve(m ? m[1] : null);
      });
    });
  });
}

const localDate = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

class Tracker {
  /**
   * deps: {
   *   userData: string,                    // dir for local logs + pending queue
   *   getIdleSeconds: () => number,       // powerMonitor.getSystemIdleTime
   *   isPunchedIn: () => boolean,         // current punch state (for S&S posting)
   *   postSegment: (date, block) => Promise<{ok?, offline?, needsLogin?}>,
   *   excludeApps: () => string[],        // app names never recorded
   * }
   */
  constructor(deps) {
    this.deps = deps;
    this.seg = null; // { start, last, n, billed }
    this.timer = null;
    this.dir = path.join(deps.userData, "days");
    this.pendingFile = path.join(deps.userData, "pending.json");
    fs.mkdirSync(this.dir, { recursive: true });
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.sample().catch(() => {}), SAMPLE_MS);
    this.sample().catch(() => {});
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.flush();
  }

  async sample() {
    const now = Date.now();
    // Off the clock, NOTHING is observed or recorded — not even locally.
    // The punch clock is the explicit on/off switch for all tracking.
    if (!this.deps.isPunchedIn()) {
      if (this.seg) this.flush();
      return;
    }
    if (this.deps.getIdleSeconds() >= IDLE_GATE_S) {
      // Idle: close any running block at its last active moment.
      if (this.seg) this.flush();
      return;
    }
    const name = await frontApp();
    if (process.env.SNSDESK_DEBUG) console.log("[tracker] sample", { name, idle: this.deps.getIdleSeconds(), seg: this.seg?.n });
    if (!name || SELF_APPS.includes(name) || this.deps.excludeApps().includes(name)) {
      if (this.seg) this.flush();
      return;
    }
    const billed = this.deps.isPunchedIn();
    const seg = this.seg;
    if (!seg || seg.n !== name || seg.billed !== billed || now - seg.last > GAP_MS || localDate(now) !== localDate(seg.start)) {
      if (seg) this.flush();
      this.seg = { start: now, last: now, n: name, billed };
    } else {
      seg.last = now;
    }
  }

  /** Close the running block: write it locally, and queue it for S&S if billed. */
  flush() {
    const seg = this.seg;
    this.seg = null;
    if (!seg || seg.last - seg.start < 5000) return;
    const block = { s: seg.start, e: seg.last, c: `app:${seg.n}`, n: seg.n };
    const date = localDate(block.s);
    this.appendLocal(date, block);
    if (seg.billed) this.queue(date, block);
  }

  // ── Local day log (always on, personal) ──────────────────────────────────
  dayFile(date) {
    return path.join(this.dir, `${date}.json`);
  }

  appendLocal(date, block) {
    let blocks = [];
    try { blocks = JSON.parse(fs.readFileSync(this.dayFile(date), "utf8")); } catch { /* new day */ }
    const last = blocks[blocks.length - 1];
    if (last && last.n === block.n && block.s - last.e <= GAP_MS) last.e = Math.max(last.e, block.e);
    else blocks.push(block);
    try { fs.writeFileSync(this.dayFile(date), JSON.stringify(blocks.slice(-2000))); } catch { /* best effort */ }
  }

  /** Local blocks for a date, plus the live (unflushed) segment. */
  localDay(date) {
    let blocks = [];
    try { blocks = JSON.parse(fs.readFileSync(this.dayFile(date), "utf8")); } catch { /* none */ }
    const seg = this.seg;
    if (seg && localDate(seg.start) === date && seg.last - seg.start >= 5000) {
      blocks = [...blocks, { s: seg.start, e: seg.last, c: `app:${seg.n}`, n: seg.n, live: true }];
    }
    return blocks;
  }

  // ── S&S posting queue (billed blocks only) ───────────────────────────────
  readQueue() {
    try { return JSON.parse(fs.readFileSync(this.pendingFile, "utf8")); } catch { return []; }
  }

  writeQueue(q) {
    try { fs.writeFileSync(this.pendingFile, JSON.stringify(q.slice(-500))); } catch { /* best effort */ }
  }

  queue(date, block) {
    const q = this.readQueue();
    q.push({ date, block });
    this.writeQueue(q);
  }

  /** Try to send everything queued. Returns count left pending. */
  async drain() {
    const q = this.readQueue();
    if (!q.length) return 0;
    this.writeQueue([]);
    const failed = [];
    for (const it of q) {
      const res = await this.deps.postSegment(it.date, it.block);
      if (!res.ok) failed.push(it);
    }
    if (failed.length) {
      // Preserve anything queued while we were sending.
      this.writeQueue([...failed, ...this.readQueue()]);
    }
    const sent = q.length - failed.length;
    if (sent) console.log(`[sns-desk] posted ${sent} activity block(s) to S&S`);
    return failed.length;
  }

  pendingCount() {
    return this.readQueue().length;
  }
}

module.exports = { Tracker, SAMPLE_MS, localDate };
