# Changelog

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
