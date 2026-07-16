# Changelog

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
