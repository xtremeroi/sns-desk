// Leave-decision notifier. The server (KV leave:<email>) is where a manager
// approves or denies PTO; there's no push channel, so Desk polls the employee's
// OWN leave list on its existing sync cadence and fires a native notification
// the moment a request flips to approved or denied.
//
// First run seeds the seen-status map WITHOUT notifying, so pre-existing
// decisions made before Desk was installed don't fire a burst of stale alerts.

const fs = require("fs");
const path = require("path");
const api = require("./api");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return iso ?? "";
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
}
function dateRange(l) {
  return l.endDate && l.endDate !== l.date ? `${fmtDate(l.date)}–${fmtDate(l.endDate)}` : fmtDate(l.date);
}

class LeaveWatch {
  /** notify: (title, body) => void */
  constructor(userData, notify) {
    this.file = path.join(userData, "leave-seen.json");
    this.notify = notify;
  }

  readSeen() {
    try { return JSON.parse(fs.readFileSync(this.file, "utf8")); } catch { return null; }
  }

  writeSeen(map) {
    try { fs.writeFileSync(this.file, JSON.stringify(map)); } catch { /* best effort */ }
  }

  async poll() {
    const res = await api.getLeave();
    if (!res.ok) return; // offline or needs-login — try again next tick
    const list = Array.isArray(res.body.list) ? res.body.list : [];
    const prior = this.readSeen();
    const firstRun = prior == null; // no file yet → seed silently
    const seen = prior ?? {};
    for (const l of list) {
      if (!l || !l.id) continue;
      const was = seen[l.id];
      if (was === l.status) continue;
      // Only PTO gets a manager decision; sick time is auto-recorded.
      if (!firstRun && l.type === "pto" && (l.status === "approved" || l.status === "denied")) {
        this.notify(
          l.status === "approved" ? "Time off approved" : "Time off denied",
          `Your PTO for ${dateRange(l)} was ${l.status}.`
        );
      }
      seen[l.id] = l.status;
    }
    // Drop ids no longer present so the map can't grow unbounded.
    const live = new Set(list.map((l) => l && l.id).filter(Boolean));
    for (const id of Object.keys(seen)) if (!live.has(id)) delete seen[id];
    this.writeSeen(seen);
  }
}

module.exports = { LeaveWatch };
