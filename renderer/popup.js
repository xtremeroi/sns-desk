/* global sns */
let state = null;
let tickBase = null; // ticker base for the local 1s updates

const $ = (id) => document.getElementById(id);
const fmtHMS = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const fmtDur = (ms) => {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
};

function act(action, opts) {
  sns.punch(action, opts).then(() => {});
}

function selectedClient() {
  const sel = $("client");
  const opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.value) return null;
  return { id: opt.value, n: opt.dataset.n };
}
function selectedProject() {
  return $("project").value || null;
}
// Billable projects for a client: the employee's ALLOCATED projects when they
// have any (only bill what management gave you hours on); otherwise the full
// client registry, so unallocated-but-legit work isn't dead-ended.
// Managers see the FULL registry (they're exempt from assignment rules), plus
// any allocated names that aren't registered — mirrors the client-list rule.
function clientProjects(clientId) {
  if (!clientId || !state) return [];
  const allocated = (state.allocProjects ?? {})[clientId] ?? [];
  const registry = (state.clientProjects ?? {})[clientId] ?? [];
  if (state.isManager) return [...new Set([...registry, ...allocated])];
  if (allocated.length) return [...new Set(allocated)];
  return registry;
}
// Fill the project dropdown from the selected client's registry. Hidden when
// the client (or General) has no projects defined. keepValue preserves the
// current selection across a re-render.
// Projects are REQUIRED when the client defines any: no generic "No project"
// bucket for those clients — a disabled placeholder forces an explicit pick
// before clock-in or switch, so time can't bill to the bare client name.
function populateProjects(clientId, keepValue) {
  const psel = $("project");
  const prev = keepValue ? psel.value : "";
  const projects = clientProjects(clientId);
  psel.innerHTML = "";
  const first = document.createElement("option");
  first.value = "";
  if (projects.length) {
    first.textContent = "— pick a project —";
    first.disabled = true;
  } else {
    first.textContent = "No project";
  }
  psel.appendChild(first);
  for (const name of projects) {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    psel.appendChild(o);
  }
  psel.style.display = projects.length ? "" : "none";
  psel.value = prev && projects.includes(prev) ? prev : "";
}

function render() {
  if (!state) return;
  const p = state.punch;

  $("ver").textContent = state.version ? `v${state.version}` : "";

  // Auto-clock-out banner: shown while clocked out with an unacknowledged
  // automatic clock-out; states when + why, one click clocks back in.
  const ao = state.autoOut;
  $("autoout").style.display = ao && p.status === "out" ? "flex" : "none";
  if (ao) $("autooutMsg").textContent = aoMessage(ao);
  $("pin").classList.toggle("on", !!state.pinned);
  $("pin").title = state.pinned ? "Unpin (stop floating above other windows)" : "Pin on top of other windows";
  $("who").textContent = state.actor ?? "";
  $("banner").style.display = state.needsLogin ? "flex" : "none";

  // Roster select (keep selection stable across pushes). Employees only see
  // clients they're ASSIGNED to (any budget line); managers see everything.
  // assignedClients === null means budgets haven't loaded yet — show the full
  // roster for that moment; the server rejects unassigned punches regardless.
  const sel = $("client");
  const cur = sel.value;
  sel.innerHTML = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "No client (General)";
  sel.appendChild(none);
  const assigned = state.isManager || state.assignedClients == null ? null : new Set(state.assignedClients);
  let visible = (state.roster ?? []).filter((c) => !assigned || assigned.has(c.id));
  // An open session on a now-unassigned client stays visible so the panel
  // tells the truth and the person can switch away.
  if (p.status !== "out" && p.client && !visible.some((c) => c.id === p.client.id)) {
    visible = [...visible, { id: p.client.id, name: p.client.n }];
  }
  for (const c of visible) {
    const o = document.createElement("option");
    o.value = c.id;
    o.dataset.n = c.name;
    o.textContent = c.name;
    sel.appendChild(o);
  }
  if (p.status !== "out" && p.client) sel.value = p.client.id;
  else if (cur) sel.value = cur;

  // Project select follows the chosen client; reflects the open session's
  // project. A project-less open session on a client WITH projects (legacy or
  // pre-registry) keeps the disabled placeholder — picking one switches.
  populateProjects(sel.value, true);
  if (p.status !== "out" && p.project) $("project").value = p.project;

  // Ticker (DAY total — continuous across client switches) + session subline.
  const t = $("ticker");
  if (p.status === "out") {
    t.className = "ticker out";
    t.textContent = "Clocked out";
    tickBase = null;
    $("sub").textContent = state.workedMsToday >= 60000 ? `Worked today ${fmtDur(state.workedMsToday)}` : "";
    $("note").style.display = "";
  } else {
    t.className = `ticker ${p.status}`;
    tickBase = { todayMs: state.workedMsToday, sessionMs: state.sessionMs, at: Date.now(), frozen: p.status === "break" };
    t.textContent = fmtHMS(state.workedMsToday);
    renderSub(state.workedMsToday, state.sessionMs);
    // Always editable while clocked in — change what you're working on anytime,
    // no client/project switch needed. Sync the field to the saved note only
    // when you're not actively typing in it, so pushes don't clobber your edit.
    $("note").style.display = "";
    if (document.activeElement !== $("note")) $("note").value = p.note ?? "";
  }

  // Action buttons.
  const A = $("actions");
  A.innerHTML = "";
  const mk = (label, cls, fn) => {
    const b = document.createElement("button");
    b.className = `btn ${cls}`;
    b.textContent = label;
    b.onclick = fn;
    A.appendChild(b);
  };
  if (p.status === "out") {
    mk("Clock in", "primary", () => {
      const c = selectedClient();
      if (c && clientProjects(c.id).length && !selectedProject()) {
        showUpdMsg("pick a project first", true);
        $("project").focus();
        return;
      }
      act("in", { client: c, project: selectedProject() || undefined, note: $("note").value.trim() || undefined });
      $("note").value = "";
    });
  } else {
    if (p.status === "in") mk("Break", "warn", () => act("break"));
    else mk("Resume", "primary", () => act("resume"));
    mk("Clock out", "stop", () => act("out"));
  }

  $("pend").style.display = state.pending ? "" : "none";
  $("pend").textContent = state.pending ? `offline · ${state.pending} pending` : "";

  // Clocked-today billing view: accumulated punch time per client, synced
  // from the server sessions (so it matches the Time page, not this Mac only).
  const ct = state.clientsToday ?? [];
  $("clientsect").style.display = ct.length ? "" : "none";
  if (ct.length) {
    $("clienttotal").textContent = fmtDur(ct.reduce((s, c) => s + c.ms, 0));
    const cmax = ct[0].ms || 1;
    const box = $("clients");
    box.innerHTML = "";
    for (const c of ct) {
      const row = document.createElement("div");
      row.className = "app";
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.style.width = `${Math.max(2, (c.ms / cmax) * 100)}%`;
      const nm = document.createElement("span");
      nm.className = "nm";
      nm.textContent = c.n;
      const dur = document.createElement("span");
      dur.className = "dur";
      dur.textContent = fmtDur(c.ms);
      row.appendChild(bar);
      row.appendChild(nm);
      if (c.live) {
        const dot = document.createElement("span");
        dot.className = "live";
        row.appendChild(dot);
      }
      row.appendChild(dur);
      box.appendChild(row);
    }
  }

  // Local day rollup.
  const byApp = new Map();
  let total = 0;
  let liveApp = null;
  for (const b of state.localDay ?? []) {
    const ms = b.e - b.s;
    total += ms;
    byApp.set(b.n, (byApp.get(b.n) ?? 0) + ms);
    if (b.live) liveApp = b.n;
  }
  $("total").textContent = total ? fmtDur(total) : "—";
  const rows = [...byApp.entries()].sort((a, b) => b[1] - a[1]);
  const max = rows.length ? rows[0][1] : 1;
  const apps = $("apps");
  apps.innerHTML = "";
  for (const [name, ms] of rows.slice(0, 60)) {
    const row = document.createElement("div");
    row.className = "app";
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.width = `${Math.max(2, (ms / max) * 100)}%`;
    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = name;
    const dur = document.createElement("span");
    dur.className = "dur";
    dur.textContent = fmtDur(ms);
    row.appendChild(bar);
    row.appendChild(nm);
    if (name === liveApp) {
      const dot = document.createElement("span");
      dot.className = "live";
      row.appendChild(dot);
    }
    row.appendChild(dur);
    const mute = document.createElement("button");
    mute.className = "iconbtn mute";
    mute.title = `Stop tracking ${name}`;
    mute.textContent = "⊘";
    mute.onclick = () => sns.setExclude([...(state.excludeApps ?? []), name]);
    row.appendChild(mute);
    apps.appendChild(row);
  }
  const ex = state.excludeApps ?? [];
  const mn = $("mutednote");
  if (ex.length) {
    mn.style.display = "";
    mn.textContent = `Not tracked: ${ex.join(", ")} `;
    const undo = document.createElement("button");
    undo.className = "link";
    undo.textContent = "reset";
    undo.onclick = () => sns.setExclude([]);
    mn.appendChild(undo);
  } else {
    mn.style.display = "none";
  }
}

function renderSub(todayMs, sessionMs) {
  const p = state.punch;
  // An unsynced clock can silently fork from the server (offline queue or
  // expired session) — say so right where the numbers are.
  const unsynced = state.needsLogin || state.pending ? "not synced · " : "";
  $("sub").textContent =
    unsynced +
    (p.status === "break" ? "On break · " : "") +
    `Session ${fmtHMS(sessionMs)} · ` +
    (p.client ? p.client.n : "General") +
    (p.project ? ` / ${p.project}` : "") +
    (p.note ? ` — ${p.note}` : "");
  $("sub").style.color = unsynced ? "var(--amber)" : "";
}

// Local 1s ticker between state pushes (day total up top, session below).
setInterval(() => {
  if (!tickBase || tickBase.frozen) return;
  const d = Date.now() - tickBase.at;
  $("ticker").textContent = fmtHMS(tickBase.todayMs + d);
  renderSub(tickBase.todayMs + d, tickBase.sessionMs + d);
}, 1000);

// "3:42 PM", plus a weekday when it wasn't today ("6:15 PM Mon").
function fmtClock(ms) {
  const d = new Date(ms);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const day = new Date().toDateString() === d.toDateString() ? "" : ` ${d.toLocaleDateString(undefined, { weekday: "short" })}`;
  return `${h}:${m} ${ap}${day}`;
}
function aoMessage(ao) {
  const t = fmtClock(ao.outAt);
  const mins = ao.minutes ? ` for ${ao.minutes} minutes` : "";
  if (ao.reason === "idle") return `Clocked out at ${t} — idle${mins}.`;
  if (ao.reason === "away") return `Clocked out at ${t}, when this Mac locked — away${mins}.`;
  if (ao.reason === "offline") return `Clocked out at ${t} — this Mac went offline while clocked in.`;
  return `Clocked out at ${t} — S&S closed the session after this Mac stopped responding.`;
}
$("autooutIn").onclick = () => {
  const ao = state?.autoOut;
  if (!ao) return;
  act("in", { client: ao.client ?? undefined, project: ao.project ?? undefined });
};
$("autooutX").onclick = () => sns.autoOutDismiss();

// After a client/project switch, clear the field and focus it for a fresh note.
function promptNote() {
  const n = $("note");
  n.value = "";
  n.focus();
}

// Client switch while clocked in → split the running segment server-side,
// then ask what this new segment is about (every switch, fresh note).
// A client that requires a project HOLDS the switch until one is picked (the
// project-change handler fires it); billing stays on the old client meanwhile
// and the subline keeps showing the truth.
$("client").addEventListener("change", () => {
  populateProjects(selectedClient()?.id ?? "", false); // new client → fresh project list, reset selection
  if (!state) return;
  const c = selectedClient();
  const needsProject = c && clientProjects(c.id).length && !selectedProject();
  if (state.punch.status === "out") {
    if (needsProject) $("project").focus();
    return;
  }
  if (needsProject) {
    showUpdMsg("pick a project to switch", true);
    $("project").focus();
    return;
  }
  if (c) act("switch", { client: c, project: selectedProject() || undefined });
  else if (state.punch.client) act("switch", { general: true }); // client → General splits too
  else return; // General → General: nothing changed
  promptNote();
});

// Project switch while clocked in → split too (projects are billing buckets).
$("project").addEventListener("change", () => {
  if (!state || state.punch.status === "out") return; // clocked out: applied on clock-in
  const c = selectedClient();
  if (!c) return; // General has no projects
  act("switch", { client: c, project: selectedProject() || undefined });
  promptNote();
});

// While clocked in, the note field attaches to the open segment. It's always
// editable — Enter or clicking away commits (blank clears it); Esc reverts.
$("note").addEventListener("keydown", (e) => {
  if (!state || state.punch.status === "out") return;
  if (e.key === "Enter") {
    $("note").blur(); // commit via the blur handler
  } else if (e.key === "Escape") {
    $("note").value = state.punch.note ?? "";
    $("note").blur();
  }
});
$("note").addEventListener("blur", () => {
  if (!state || state.punch.status === "out") return; // clocked out: field is the pending clock-in note
  const v = $("note").value.trim();
  if (v !== (state.punch.note ?? "")) act("note", { note: v });
});

// Manual window drag: mousedown on the header (not its buttons) starts it,
// mouseup anywhere ends it. The main process moves the window with the cursor.
document.querySelector(".hdr").addEventListener("mousedown", (e) => {
  if (e.button !== 0 || e.target.closest("button")) return;
  sns.dragStart();
});
// Double-click the header: collapse to the mini timer / expand back.
document.querySelector(".hdr").addEventListener("dblclick", (e) => {
  if (e.target.closest("button")) return;
  sns.toggleMini();
});
window.addEventListener("mouseup", () => sns.dragEnd());
window.addEventListener("blur", () => sns.dragEnd());

// Sync button: spin while forcing a server sync + queue drain, then show a
// short verdict so a healthy no-op click still visibly did something.
let syncMsgTimer = null;
$("refresh").onclick = async () => {
  const btn = $("refresh");
  if (btn.classList.contains("spin")) return;
  btn.classList.add("spin");
  const msg = $("syncmsg");
  msg.textContent = "";
  const started = Date.now();
  let res = null;
  try { res = await sns.refresh(); } catch { /* verdict below */ }
  // Let the spin be perceivable even when the sync is instant.
  await new Promise((r) => setTimeout(r, Math.max(0, 500 - (Date.now() - started))));
  btn.classList.remove("spin");
  const text = !res ? "sync failed"
    : res.needsLogin ? "sign in needed"
    : res.pending ? `offline · ${res.pending} queued`
    : "up to date";
  msg.textContent = text;
  msg.classList.toggle("warn", !res || !!res.needsLogin || !!res.pending);
  clearTimeout(syncMsgTimer);
  syncMsgTimer = setTimeout(() => { msg.textContent = ""; }, 2500);
};
// Version badge = manual update check. The verdict lands in the header msg line
// (main pushes update-status), so the click always visibly resolves even if
// macOS notifications are muted. Show an instant "checking…" so it never feels dead.
let updMsgTimer = null;
function showUpdMsg(text, warn, persist) {
  const msg = $("syncmsg");
  msg.textContent = text;
  msg.classList.toggle("warn", !!warn);
  clearTimeout(updMsgTimer);
  if (!persist) updMsgTimer = setTimeout(() => { msg.textContent = ""; msg.classList.remove("warn"); }, 3000);
}
$("ver").onclick = () => { showUpdMsg("checking…", false, true); sns.checkUpdate(); };
sns.onUpdateStatus((d) => showUpdMsg(d.text, d.tone === "warn", d.persist));
$("pin").onclick = () => sns.togglePin();
$("close").onclick = () => sns.hidePopup();
$("quit").onclick = () => sns.quit();
$("loginBtn").onclick = () => sns.login();
$("timepage").onclick = () => sns.openTimePage();

sns.onState((s) => { state = s; render(); });
sns.refresh();
