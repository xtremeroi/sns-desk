// S&S Desk — menu bar companion for Stats & Strats (sns.xtremeroi.com).
// Punch clock in the tray + desktop-wide activity tracking. Auth is the real
// browser flow: a login window completes Auth0 + Cloudflare Access once, and
// the persisted CF_Authorization cookie (24h) authenticates API calls.

const { app, Tray, BrowserWindow, ipcMain, nativeImage, powerMonitor, session, Notification, shell, Menu, dialog, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const api = require("./lib/api");
const { Tracker } = require("./lib/tracker");
const { Punch } = require("./lib/punch");
const { LeaveWatch } = require("./lib/leave");
const { autoUpdater } = require("electron-updater");

// Google blocks sign-in inside webviews that identify as Electron, and a
// Chrome UA fails its client-hints cross-check ("this browser or app may not
// be secure" at the password step). A Firefox UA carries no client hints to
// contradict, so Google treats the login window as a real browser.
const CHROME_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FIREFOX_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0";

let tray = null;
let popup = null;
let loginWin = null;
let punch = null;
let tracker = null;
let leaveWatch = null;
let globalState = { actor: null, isTeam: false, roster: [], clientProjects: {}, punchLockMin: 45, timeIdleMin: 10 };
let needsLogin = false;
let lockedAt = null;
let updateReady = null; // version string once an update is downloaded and staged
let manualUpdateCheck = false; // true while a user-triggered "check now" is in flight

// User-triggered update check (tray menu / version badge). Gives feedback the
// silent background check doesn't: "up to date", "downloading", or an error.
function checkForUpdatesNow() {
  if (!app.isPackaged) { new Notification({ title: "S&S Desk", body: "Update checks run only in the installed app." }).show(); return; }
  if (updateReady) { new Notification({ title: "Update ready", body: `Version ${updateReady} is downloaded — right-click the menu bar icon and choose Restart to update.` }).show(); return; }
  manualUpdateCheck = true;
  autoUpdater.checkForUpdates().catch(() => { manualUpdateCheck = false; });
}

const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), "utf8")); } catch { return {}; }
}
function writeSettings(s) {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(s)); } catch { /* best effort */ }
}

// ── Tray ────────────────────────────────────────────────────────────────────
function fmtTicker(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

// The mark in the menu bar is the state light: green clocked in, amber on
// break, red clocked out (macOS won't let us color the title text itself).
const TRAY_COLORS = {
  in: { r: 0x34, g: 0xd3, b: 0x99 },
  break: { r: 0xfb, g: 0xbf, b: 0x24 },
  out: { r: 0xf8, g: 0x71, b: 0x71 },
};
const trayIcons = {};
function trayIconFor(status) {
  if (!trayIcons[status]) {
    trayIcons[status] = require("./lib/tray-icon.js").trayIcon(nativeImage, 16, TRAY_COLORS[status] ?? null);
  }
  return trayIcons[status];
}

let trayStatus = null;
function updateTray() {
  if (!tray) return;
  const st = punch.state();
  if (st.status !== trayStatus) {
    trayStatus = st.status;
    tray.setImage(trayIconFor(st.status));
  }
  const pend = punch.pendingCount() + tracker.pendingCount();
  const flag = pend ? " ⇡" : needsLogin || punch.needsLogin ? " ⚠" : "";
  // Tray shows the DAY total, so a client switch never resets the ticker.
  // Clocked out = mark only (no wordmark text), plus any status glyph.
  if (st.status === "in") tray.setTitle(`▶ ${fmtTicker(punch.workedMsToday())}${flag}`);
  else if (st.status === "break") tray.setTitle(`❚❚ ${fmtTicker(punch.workedMsToday())}${flag}`);
  else tray.setTitle(flag.trim());
}

function togglePopup() {
  if (!popup) return;
  if (popup.isVisible()) return popup.hide();
  // First open drops under the tray; after that the window opens wherever
  // the user last moved/resized it (persisted in settings), clamped so a
  // stale saved position can never strand it off-screen.
  if (!readSettings().popupBounds) {
    const b = tray.getBounds();
    const { width } = popup.getBounds();
    popup.setPosition(Math.round(b.x + b.width / 2 - width / 2), Math.round(b.y + b.height + 4), false);
  } else {
    const b = popup.getBounds();
    const wa = screen.getDisplayMatching(b).workArea;
    popup.setBounds({
      x: Math.min(Math.max(b.x, wa.x), wa.x + wa.width - b.width),
      y: Math.min(Math.max(b.y, wa.y), wa.y + wa.height - Math.min(b.height, wa.height)),
      width: b.width,
      height: Math.min(b.height, wa.height),
    });
  }
  popup.show();
  pushState();
}

// Manual header drag: CSS app-region hit-testing dies on transparent windows
// after hide/show, so the renderer signals drag start/end and we move the
// window with the cursor from here.
let dragTimer = null;
let dragOffset = null;
function endDrag() {
  if (!dragTimer) return;
  clearInterval(dragTimer);
  dragTimer = null;
  dragOffset = null;
  if (popup && !popup.isDestroyed()) {
    const s = readSettings();
    s.popupBounds = popup.getBounds();
    writeSettings(s);
  }
}
ipcMain.handle("drag-start", () => {
  if (!popup || popup.isDestroyed() || !popup.isVisible()) return;
  const pt = screen.getCursorScreenPoint();
  const [wx, wy] = popup.getPosition();
  dragOffset = { x: pt.x - wx, y: pt.y - wy };
  clearInterval(dragTimer);
  dragTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint();
    popup.setPosition(p.x - dragOffset.x, p.y - dragOffset.y);
  }, 16);
});
ipcMain.handle("drag-end", () => endDrag());

// ── Windows ─────────────────────────────────────────────────────────────────
function createPopup() {
  // Floating panel, not a tray flyout: draggable by its header, resizable in
  // height (width is fixed), position/size remembered, and it stays put on
  // blur — the tray click or ✕ closes it.
  const saved = readSettings().popupBounds;
  popup = new BrowserWindow({
    width: 360,
    height: saved?.height ?? 584,
    ...(saved && Number.isFinite(saved.x) ? { x: saved.x, y: saved.y } : {}),
    minWidth: 360,
    maxWidth: 360,
    minHeight: 160, // small enough for mini timer mode (ticker + session line)
    show: false,
    frame: false,
    resizable: true,
    fullscreenable: false,
    skipTaskbar: true,
    transparent: true,
    vibrancy: "under-window",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });
  popup.loadFile(path.join(__dirname, "renderer", "popup.html"));
  if (readSettings().pinnedOnTop) popup.setAlwaysOnTop(true, "floating");
  const saveBounds = () => {
    const s = readSettings();
    s.popupBounds = popup.getBounds();
    writeSettings(s);
  };
  popup.on("moved", saveBounds);
  popup.on("resized", saveBounds);
}

function openLogin() {
  if (loginWin && !loginWin.isDestroyed()) { loginWin.focus(); return; }
  loginWin = new BrowserWindow({
    width: 900,
    height: 720,
    title: "Sign in to S&S",
    webPreferences: { partition: undefined }, // default session = shared cookie jar
  });
  loginWin.webContents.setUserAgent(FIREFOX_UA);
  loginWin.loadURL(api.BASE);
  // After every navigation, probe the API; once it answers JSON we're in.
  const probe = async () => {
    const res = await api.getGlobal();
    if (res.ok) {
      onAuthed(res.body);
      if (loginWin && !loginWin.isDestroyed()) loginWin.close();
    }
  };
  loginWin.webContents.on("did-navigate", probe);
  loginWin.webContents.on("did-navigate-in-page", probe);
  loginWin.on("closed", () => { loginWin = null; });
}

function onAuthed(body) {
  needsLogin = false;
  punch.needsLogin = false;
  globalState = {
    actor: body.actor ?? null,
    isTeam: !!body.isTeam,
    roster: body.roster ?? [],
    punchLockMin: body.punchLockMin ?? 45,
    timeIdleMin: body.timeIdleMin ?? 10,
  };
  punch.sync().then(() => drainAll());
  if (leaveWatch) leaveWatch.poll();
  // Per-client project registry (managers define it in S&S) — powers the
  // project picker. Refreshed on each auth so new projects appear live.
  api.getClientProjects().then((r) => { if (r.ok) { globalState.clientProjects = r.body.projects ?? {}; pushState(); } });
  pushState();
}

// ── State push to popup ─────────────────────────────────────────────────────
function pushState() {
  updateTray();
  if (!popup || popup.isDestroyed() || !popup.isVisible()) return;
  const today = api.localDate();
  popup.webContents.send("state", {
    version: app.getVersion(),
    pinned: !!(popup && !popup.isDestroyed() && popup.isAlwaysOnTop()),
    needsLogin: needsLogin || punch.needsLogin,
    actor: globalState.actor,
    roster: globalState.roster,
    clientProjects: globalState.clientProjects,
    punch: punch.state(),
    workedMsToday: punch.workedMsToday(),
    sessionMs: punch.sessionMs(),
    clientsToday: punch.clientTotalsToday(),
    pending: punch.pendingCount() + tracker.pendingCount(),
    localDay: tracker.localDay(today),
    excludeApps: readSettings().excludeApps ?? [],
  });
}

// ── Sync / drain loops ──────────────────────────────────────────────────────
async function syncGlobal() {
  const res = await api.getGlobal();
  console.log("[sns-desk] syncGlobal:", JSON.stringify({ ok: res.ok, needsLogin: res.needsLogin, offline: res.offline, error: res.error }));
  if (res.ok) onAuthed(res.body);
  else if (res.needsLogin) { needsLogin = true; pushState(); }
}

async function drainAll() {
  const p = await punch.drain();
  const t = await tracker.drain();
  if (p || t || punch.pendingCount() || tracker.pendingCount())
    console.log("[sns-desk] drain: punch left", p, "seg left", t);
  pushState();
}

// ── App lifecycle ───────────────────────────────────────────────────────────
// Stable data location for dev (`electron .` would otherwise use "Electron")
// and packaged builds alike.
app.setPath("userData", path.join(app.getPath("appData"), "sns-desk"));

app.whenReady().then(() => {
  if (app.dock) app.dock.hide();
  session.defaultSession.setUserAgent(CHROME_UA);
  console.log("[sns-desk] userData:", app.getPath("userData"));

  // One-time migration (0.1.9): purge local day logs written before the
  // "clocked out means invisible" gate existed — they contain off-clock app
  // usage from older versions that the promise says should never persist.
  // Billed data is untouched (it lives on the server); only the local
  // "Today on this Mac" history resets once.
  {
    const s = readSettings();
    if (!s.localLogPurgedV019) {
      try {
        const daysDir = path.join(app.getPath("userData"), "days");
        for (const f of fs.readdirSync(daysDir)) fs.unlinkSync(path.join(daysDir, f));
      } catch { /* nothing to purge */ }
      s.localLogPurgedV019 = true;
      writeSettings(s);
    }
  }

  punch = new Punch(app.getPath("userData"), () => updateTray());
  // Notify the employee when a manager approves or denies their PTO. Clicking
  // the notification opens the Time page.
  leaveWatch = new LeaveWatch(app.getPath("userData"), (title, body) => {
    const n = new Notification({ title, body });
    n.on("click", () => shell.openExternal(`${api.BASE}/#v=time`));
    n.show();
  });
  tracker = new Tracker({
    userData: app.getPath("userData"),
    getIdleSeconds: () => powerMonitor.getSystemIdleTime(),
    isPunchedIn: () => punch.state().status !== "out",
    postSegment: (date, block) => api.putTimeSegment(date, block),
    excludeApps: () => readSettings().excludeApps ?? [],
  });

  // Ligature mark as a template icon: macOS flips it black/white with the bar.
  tray = new Tray(require("./lib/tray-icon.js").trayIcon(nativeImage));
  tray.setTitle("S&S");
  tray.on("click", togglePopup);
  // Right-click = the conventional menu-bar-app menu, with an unambiguous Quit.
  tray.on("right-click", () => {
    tray.popUpContextMenu(Menu.buildFromTemplate([
      { label: "Open S&S Desk", click: () => { if (!popup.isVisible()) togglePopup(); } },
      // Restarting for an update keeps the punch session running (it lives on
      // the server) — no clock-out prompt, unlike a normal Quit.
      ...(updateReady
        ? [{ label: `Restart to update to ${updateReady}`, click: () => { tracker.stop(); autoUpdater.quitAndInstall(); } }]
        : [{ label: "Check for Updates…", enabled: app.isPackaged, click: () => checkForUpdatesNow() }]),
      {
        label: "Launch at Login",
        type: "checkbox",
        enabled: app.isPackaged,
        checked: app.isPackaged && app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
      },
      { type: "separator" },
      { label: "Quit S&S Desk (stop tracking)", click: () => quitFlow() },
    ]));
  });
  createPopup();

  // Launch at login, on by default for installed builds (first run only —
  // if someone removes it in System Settings we don't fight them). The tray
  // menu has the toggle.
  if (app.isPackaged) {
    const s = readSettings();
    if (!s.loginItemInitialized) {
      app.setLoginItemSettings({ openAtLogin: true });
      s.loginItemInitialized = true;
      writeSettings(s);
    }
  }

  tracker.start();

  // Auto-update from GitHub Releases (packaged builds only; needs the Developer
  // ID signature Squirrel validates). Non-disruptive: download in the
  // background and apply on the NEXT quit — never yank the app out from under a
  // running shift. The tray menu offers an explicit "Restart to update" too.
  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("update-available", (info) => {
      if (manualUpdateCheck) new Notification({ title: "Update available", body: `Downloading S&S Desk ${info.version}…` }).show();
    });
    autoUpdater.on("update-not-available", () => {
      if (manualUpdateCheck) new Notification({ title: "S&S Desk is up to date", body: `You're on the latest version (${app.getVersion()}).` }).show();
      manualUpdateCheck = false;
    });
    autoUpdater.on("update-downloaded", (info) => {
      updateReady = info.version;
      updateTray();
      new Notification({
        title: "S&S Desk update ready",
        body: `Version ${info.version} installs the next time you quit — or right-click the menu bar icon and choose Restart to update.`,
      }).show();
      manualUpdateCheck = false;
    });
    autoUpdater.on("error", (e) => {
      console.log("[updater] error:", e && e.message ? e.message : e);
      if (manualUpdateCheck) new Notification({ title: "Update check failed", body: "Couldn't reach the update server — try again in a bit." }).show();
      manualUpdateCheck = false;
    });
    const check = () => autoUpdater.checkForUpdates().catch(() => {});
    check();
    setInterval(check, 6 * 3600_000);
  }
  // The persisted cookie store loads asynchronously; a fetch fired straight
  // from whenReady races it and sees no CF_Authorization (spurious ⚠ at every
  // launch). cookies.get queues on the store, so awaiting it first guarantees
  // the initial sync runs with cookies available.
  session.defaultSession.cookies.get({ url: api.BASE }).then((cookies) => {
    console.log("[sns-desk] cookies for", api.BASE, cookies.map((c) => `${c.name} exp=${c.expirationDate} session=${c.session}`));
    syncGlobal();
  });
  setInterval(() => { syncGlobal(); }, 60_000); // onAuthed chains punch.sync + drain + leaveWatch
  setInterval(() => { drainAll(); }, 60_000);
  setInterval(() => { updateTray(); }, 1_000);
  setInterval(() => { pushState(); }, 15_000);

  // Lock / sleep safety net: away longer than the manager-set grace while
  // clocked in → retroactive clock-out at the moment the machine locked,
  // flagged auto (same `outAt` + "lock" contract as the Chrome extension).
  const onAway = () => { lockedAt = Date.now(); tracker.flush(); };
  const onReturn = () => {
    const away = lockedAt ? Date.now() - lockedAt : 0;
    lockedAt = null;
    if (away > globalState.punchLockMin * 60_000 && punch.state().status !== "out") {
      const at = Date.now() - away;
      punch.act("outAt", { outAtMs: at, lock: true }).then(() => {
        new Notification({
          title: "S&S Desk clocked you out",
          body: `Away ${Math.round(away / 60000)} min — clocked out retroactively at lock time. Fix it on the Time page if that's wrong.`,
        }).show();
        pushState();
      });
    }
    punch.sync();
  };
  powerMonitor.on("lock-screen", onAway);
  powerMonitor.on("suspend", onAway);
  powerMonitor.on("unlock-screen", onReturn);
  powerMonitor.on("resume", onReturn);

  app.on("before-quit", () => tracker.stop());
  // SIGTERM (pkill, shutdown) doesn't reliably reach before-quit — flush the
  // running segment to the disk queue so it survives to the next launch.
  for (const sig of ["SIGTERM", "SIGINT"]) {
    process.on(sig, () => { try { tracker.stop(); } catch { /* exiting */ } app.quit(); });
  }
});

app.on("window-all-closed", () => { /* menu bar app — stay alive */ });

// Quitting stops ALL tracking on this machine. The punch clock lives on the
// server though — quitting while clocked in would leave the person clocked in
// with nothing watching, so offer the clock-out explicitly.
async function quitFlow() {
  if (punch.state().status !== "out") {
    const { response } = await dialog.showMessageBox({
      type: "question",
      message: "You're still clocked in",
      detail: "Quitting stops activity tracking on this Mac, but your punch clock keeps running on the server.",
      buttons: ["Clock Out & Quit", "Quit (stay clocked in)", "Cancel"],
      defaultId: 0,
      cancelId: 2,
    });
    if (response === 2) return;
    if (response === 0) await punch.act("out").catch(() => {});
  }
  tracker.stop();
  app.quit();
}

// ── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.handle("punch", async (_e, action, opts) => {
  const res = await punch.act(action, opts ?? {});
  pushState();
  return res;
});
ipcMain.handle("refresh", async () => {
  await syncGlobal();
  await drainAll();
  // Report the outcome so the sync button can show a verdict.
  return {
    needsLogin: needsLogin || punch.needsLogin,
    pending: punch.pendingCount() + tracker.pendingCount(),
  };
});
ipcMain.handle("login", () => openLogin());
ipcMain.handle("open-time-page", () => shell.openExternal(`${api.BASE}/#v=time`));
ipcMain.handle("set-exclude", (_e, apps) => {
  const s = readSettings();
  s.excludeApps = Array.isArray(apps) ? apps.slice(0, 50) : [];
  writeSettings(s);
  pushState();
});
ipcMain.handle("hide-popup", () => { if (popup && !popup.isDestroyed()) popup.hide(); });
ipcMain.handle("check-update", () => checkForUpdatesNow());
// Double-clicking the header collapses the panel into a mini timer (day
// ticker + session line) and back to the previous height.
const MINI_HEIGHT = 172;
ipcMain.handle("toggle-mini", () => {
  if (!popup || popup.isDestroyed()) return;
  const b = popup.getBounds();
  const s = readSettings();
  if (b.height > 230) {
    s.preMiniHeight = b.height;
    writeSettings(s);
    popup.setBounds({ ...b, height: MINI_HEIGHT });
  } else {
    // Expand, clamped so the taller panel stays on screen.
    const wa = screen.getDisplayMatching(b).workArea;
    const height = Math.min(Math.max(s.preMiniHeight ?? 584, 440), wa.height);
    const y = Math.min(Math.max(b.y, wa.y), wa.y + wa.height - height);
    popup.setBounds({ x: b.x, y, width: b.width, height });
  }
});
ipcMain.handle("toggle-pin", () => {
  if (!popup || popup.isDestroyed()) return false;
  const next = !popup.isAlwaysOnTop();
  popup.setAlwaysOnTop(next, "floating");
  const s = readSettings();
  s.pinnedOnTop = next;
  writeSettings(s);
  pushState();
  return next;
});
ipcMain.handle("quit", () => quitFlow());
