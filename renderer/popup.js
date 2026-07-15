/* global sns */
let state = null;
let tickBase = null; // ticker base for the local 1s updates
let noteAsk = false; // client switch happened → ask "what are you working on"

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

function render() {
  if (!state) return;
  const p = state.punch;

  $("ver").textContent = state.version ? `v${state.version}` : "";
  $("pin").classList.toggle("on", !!state.pinned);
  $("pin").title = state.pinned ? "Unpin (stop floating above other windows)" : "Pin on top of other windows";
  $("who").textContent = state.actor ?? "";
  $("banner").style.display = state.needsLogin ? "flex" : "none";

  // Roster select (keep selection stable across pushes).
  const sel = $("client");
  const cur = sel.value;
  sel.innerHTML = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "No client (General)";
  sel.appendChild(none);
  for (const c of state.roster ?? []) {
    const o = document.createElement("option");
    o.value = c.id;
    o.dataset.n = c.name;
    o.textContent = c.name;
    sel.appendChild(o);
  }
  if (p.status !== "out" && p.client) sel.value = p.client.id;
  else if (cur) sel.value = cur;

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
    // Hidden while clocked in — except right after a client switch, when a
    // fresh segment wants a fresh note (Enter saves, Esc skips).
    $("note").style.display = noteAsk ? "" : "none";
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
      act("in", { client: selectedClient(), note: $("note").value.trim() || undefined });
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

// Client switch while clocked in → split the running segment server-side,
// then ask what this new segment is about (every switch, fresh note).
$("client").addEventListener("change", () => {
  if (!state || state.punch.status === "out") return;
  const c = selectedClient();
  if (c) act("switch", { client: c });
  else if (state.punch.client) act("switch", { general: true }); // client → General splits too
  else return; // General → General: nothing changed
  noteAsk = true;
  const n = $("note");
  n.value = "";
  n.style.display = "";
  n.focus();
});

// While clocked in, the note field attaches to the open segment.
$("note").addEventListener("keydown", (e) => {
  if (!state || state.punch.status === "out") return;
  if (e.key === "Enter") {
    const v = $("note").value.trim();
    if (v) act("note", { note: v });
    noteAsk = false;
    $("note").value = "";
    $("note").style.display = "none";
  } else if (e.key === "Escape") {
    noteAsk = false;
    $("note").value = "";
    $("note").style.display = "none";
  }
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
$("pin").onclick = () => sns.togglePin();
$("close").onclick = () => sns.hidePopup();
$("quit").onclick = () => sns.quit();
$("loginBtn").onclick = () => sns.login();
$("timepage").onclick = () => sns.openTimePage();

sns.onState((s) => { state = s; render(); });
sns.refresh();
