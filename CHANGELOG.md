# Changelog

## 0.1.27 — 2026-07-17

- **Projects are now required where they exist.** If a client has projects
  defined in S&S, you must pick one — the generic "No project" option is gone
  for those clients, clock-in asks you to pick a project first, and switching
  to such a client waits until you've chosen (billing stays on your previous
  client until then). Clients without projects work exactly as before.

## 0.1.26 — 2026-07-16

- **Idle cutoff now follows the S&S setting — with unpredictable grace.**
  Activity recording previously stopped after a hardcoded 5 idle minutes;
  it now uses the manager-set S&S idle allowance as a guaranteed minimum,
  plus a random 0–40% grace on top, re-rolled every idle episode. You always
  get at least the configured allowance; the exact cutoff past it varies.

## 0.1.25 — 2026-07-16

- **Quitting now always clocks you out.** Desk can't track activity while it
  isn't running, so staying clocked in after quitting would leave billed time
  with nothing behind it. The quit dialog is now "Clock Out & Quit" or Cancel.
  Restarting to apply an update still keeps you clocked in.

## 0.1.24 — 2026-07-16

- **Fixes widgets lagging behind the real clock state.** Desk was asking macOS
  to refresh the widgets every few minutes as the weekly hours drifted, which
  exhausted the system's daily widget-refresh allowance — after that, macOS
  defers refreshes and the tiles fall minutes behind on break/resume/switch.
  Desk now only nudges on real transitions (clock state, client, project,
  note); the weekly progress bars update on the normal timeline instead.

## 0.1.23 — 2026-07-16

- **Edit "what you're working on" anytime.** The note field now stays visible and
  editable while you're clocked in — update it whenever, no client or project
  switch needed. Enter or click away to save; blank clears it.

## 0.1.22 — 2026-07-16

- **New "Weekly Progress by Project" widget.** The same worked-vs-allocated
  progress bars, broken out per project (Client · Project) instead of rolled up.
  "Weekly Progress" now aggregates each client's project lines into one client
  row; add the by-project widget for the detail. Medium and large.

## 0.1.21 — 2026-07-16

- **Widgets update instantly.** Clock in/out, break, or switch client and the
  tiles now refresh right away instead of waiting on macOS's slow widget timer
  (Desk nudges WidgetKit to reload on every change).
- **New "Weekly Progress" widget.** Hours worked vs. what management allocated
  this week, per client, as progress bars with a percentage — behind (blue),
  on-track (green), over (red). Medium and large sizes.
- **"Today by client" gains a large (4-block) size** for a longer list.
- **Logo polish.** The S&S mark now appears on the small tiles too, and hides
  automatically whenever it would overlap content instead of sitting on top of it.

## 0.1.20 — 2026-07-16

- **Widgets now show live data.** The desktop widgets were stuck on placeholder
  because macOS blocks a sandboxed widget from a shared container unless the
  group name is prefixed with the developer Team ID. Renamed the App Group so
  the widgets can read Desk's live snapshot. After updating, remove and re-add
  the tiles once.
- **Menu-bar icon matches the widget.** The tray mark now keeps its three long
  bars white and tints only the small stubs with your clock state
  (green / amber / red), instead of coloring the whole mark.

## 0.1.19 — 2026-07-16

- **Desktop widgets.** S&S Desk now ships native macOS widgets you can add to your
  desktop (right-click → Edit Widgets → S&S Desk). Three tiles: **Today** (time
  worked today + clock status), **Current Session** (what you're on right now,
  counting up live), and **Today by Client** (the billing split). They read live
  from Desk, so keep it running and clocked in. The logo mark in the corner turns
  green / amber / red with your clock state, matching the menu-bar icon.

## 0.1.18 — 2026-07-16

- **Syncs the final clock action before quitting.** Clocking out and quitting
  immediately could kill the sync mid-flight, leaving your session open (and
  still counting time) on your phone or the web until Desk next launched.
  Quitting now waits for the last clock action to reach S&S first — bounded so a
  dropped connection can't hang the quit, with the existing replay-on-relaunch
  as the backstop.
- **Update check now confirms in the panel.** Clicking the version number (or
  the tray "Check for Updates…") shows the result right in the popup header —
  "checking…", then "software is up to date", "downloading v…", or "ready to
  restart". Previously the only feedback was a macOS notification, so with
  notifications muted the click looked like it did nothing.

## 0.1.17 — 2026-07-16

- **Projects.** When you pick a client that has projects defined in S&S, a
  project dropdown appears — attribute your time to a specific project under
  that client. Switching project splits the billing segment (like switching
  client) and asks for a fresh note. Projects sync live from S&S; managers
  define them per client on the Time page.
- **Force an update.** Don't want to wait for the automatic check? Right-click
  the menu bar icon → "Check for Updates…", or click the version number in the
  popup header. You'll get a notification whether it's up to date, downloading,
  or ready to restart.

## 0.1.16 — 2026-07-16

- **Auto-update.** S&S Desk now updates itself from GitHub Releases. New
  versions download quietly in the background and apply the next time you
  quit — or right-click the menu bar icon and choose "Restart to update."
  Restarting for an update keeps you clocked in. **This is the last version
  anyone installs by hand;** everything after updates automatically.

## 0.1.15 — 2026-07-15

- **Signed and notarized.** Builds are now code-signed with XTREME ROI's Apple
  Developer ID and notarized by Apple, so the app opens on any Mac with no
  Gatekeeper warning — no more right-click-Open or Privacy & Security override.

## 0.1.14 — 2026-07-15

- **The ⚠ badge no longer cries wolf.** "Sign in needed" now shows only for a
  genuine expired session (the Access login redirect). A transient Cloudflare
  or edge hiccup (a brief 5xx / non-JSON response) is treated as a temporary
  failure that retries and shows "offline · pending" instead of a false
  sign-in prompt.

## 0.1.13 — 2026-07-15

- **Time-off decision notifications:** when a manager approves or denies your
  PTO on the S&S Time page, Desk fires a native macOS notification within a
  minute ("Your PTO for Aug 3 was approved"). Clicking it opens the Time page.
  No more checking the site to find out. Sick time (auto-recorded) never
  notifies, and pre-existing decisions don't fire on first launch.

## 0.1.12 — 2026-07-15

- **The sync button talks back:** it spins while forcing a server sync and
  queue drain, then shows a verdict — green "up to date", or amber
  "sign in needed" / "offline · N queued" / "sync failed" — so a healthy
  click is distinguishable from a dead button.

## 0.1.11 — 2026-07-15

- **Double-click the header to collapse into a mini timer:** just the day
  ticker and the session · client line, in a tiny glass card. Double-click
  again to restore the previous size (kept on screen).
- **The menu bar mark is now a state light:** green while clocked in, amber
  on break, red when clocked out — visible at a glance even with the panel
  closed.
- **S&S glass look:** the panel now wears the S&S dark navy, translucent so
  the desktop blurs through, and the clock card gets an Apple-glass
  treatment.

## 0.1.10 — 2026-07-15

- **Compact widget mode:** shrink the panel (drag the bottom edge) below list
  height and it becomes a live ticker card — clock, session, client picker,
  punch buttons — like a desktop widget. Stretch it back for the full view.
- **Pin on top:** new pin button in the header floats the panel above other
  windows; state is remembered.
- **Launch at login:** on by default for installed builds (toggle in the menu
  bar right-click menu), so the clock is always there after a restart.

## 0.1.9 — 2026-07-15

- **One-time purge of old local logs:** "Today on this Mac" was still showing
  app usage recorded by versions before the clocked-in-only gate (0.1.8
  stopped new off-clock recording but didn't erase history). First launch of
  0.1.9 clears the local day logs once, so the view honors "clocked out means
  invisible" retroactively. Billed time on the server is untouched.
- **System surfaces never tracked:** the macOS lock screen ("loginwindow"),
  screensaver, and security prompts are excluded from tracking entirely.

## 0.1.8 — 2026-07-15

- **Fix: window dragging no longer dies after closing and reopening the
  panel** (0.1.7 could leave the window stranded wherever it was last
  dragged). Dragging is now handled by the app itself instead of the CSS
  drag region, which breaks on transparent windows after hide/show.
- **Off-screen protection:** if a remembered position would open the panel
  outside the visible screen, it snaps back into view.
- **Tracking only while clocked in:** the activity tracker now runs solely
  between clock-in and clock-out. Off the clock, S&S Desk observes and records
  nothing — not even to the local "Today on this Mac" view. The punch clock is
  the on/off switch for all tracking.

## 0.1.7 — 2026-07-15

- **Floating panel:** the popup is now a real window — drag it anywhere by its
  header, resize it vertically (width stays fixed), and it remembers its
  position and size. It no longer closes when you click elsewhere; the menu
  bar icon or ✕ closes it. Taller panel = more of the day lists visible.
- **Icon-only tray when clocked out:** just the S&S mark — text appears only
  when it means something (running ticker, break, ⚠ needs sign-in, ⇡ pending).

## 0.1.6 — 2026-07-15

- **S&S Ligature mark everywhere:** menu bar icon (template image, adapts to
  light/dark menu bars), popup header, and a new app icon — the brand tile
  (violet gradient, white bars, lavender stubs) replacing the placeholder.

## 0.1.5 — 2026-07-14

- **Fix: switching to "No client (General)" now works like any client switch**
  — it splits the running segment (previously your time silently kept billing
  the prior client) and opens the "What are you working on?" prompt.
  Requires the matching server update (deployed).

## 0.1.4 — 2026-07-14

- **Fresh note per client switch:** selecting a client while clocked in now
  opens the "What are you working on?" field (Enter saves, Esc skips), and the
  previous segment's note no longer carries over — each billed segment gets its
  own note. (Server-side note-carry removed in the same deploy.)

## 0.1.3 — 2026-07-14

- **Version badge:** the app version now shows in the popup header (e.g.
  `v0.1.3`) so you always know which release you're running. Every revision
  bumps the version from here on.
- Companion release to the S&S web deploy that makes the clock Desk-only:
  the web pill is now a display-only mirror (status, session, day total,
  client) and web client selection no longer switches billing attribution.

## 0.1.2 — 2026-07-14

- **"Clocked today" section:** accumulated punch time per client for the day
  (green bars, live dot on the current session's client), synced from the
  server sessions so it matches the Time page's billing view — not just this
  Mac. Sits above the per-app "Today on this Mac" list.

## 0.1.1 — 2026-07-14

- **Stale-queue guard:** punches queued while offline/signed-out are dropped on
  reconnect if the server has newer punch activity — an old queued clock-in can
  no longer stomp a live session started from another device. Server truth wins.
- **"not synced" marker:** when the session is expired or actions are queued,
  the ticker subline says so in amber instead of looking identical to synced state.
- **No self-tracking:** S&S Desk no longer records its own foreground time.
- **Cleaner footer:** icon buttons (open Time page ↗, quit ⏻) with tooltips
  replace the text links. Quit still prompts to clock out if you're clocked in.

## 0.1.0 — 2026-07-14

Initial release: menu bar punch clock (day-total ticker, session + client +
note subline, client switching), desktop-wide frontmost-app tracking (app names
only, idle-gated, billed time syncs only while clocked in, per-app opt-out),
offline queues with ordered replay, lock/sleep auto clock-out, embedded
Access/Auth0 sign-in, explicit quit with clock-out prompt.
