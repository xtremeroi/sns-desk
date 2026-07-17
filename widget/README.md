# S&S Desk Widgets (macOS desktop widgets)

Native WidgetKit widgets for the desktop, fed live by S&S Desk. Three tiles:

| Widget | Sizes | Shows |
| --- | --- | --- |
| **Today** | small (1‑block), medium (2‑block) | Time worked today (counts up live while clocked in), clock status, current client |
| **Current Session** | small, medium | The running session counting up live, client / project, note |
| **Today by Client** | medium | Today's time split across clients — the billing view |

## How the data flows

S&S Desk (Electron) is the source of truth. It can't render a WidgetKit widget, and
the widget (a sandboxed extension) can't reach Desk's IPC or the S&S API. They share
one small JSON snapshot through an **App Group** container:

```
Desk (lib/widget-bridge.js)  ──writes──▶  ~/Library/Group Containers/group.com.xtremeroi.snsdesk/widget-state.json
Widget (WidgetState.load)    ──reads───▶  same file (via containerURL)
```

Desk rewrites it on every state change. The current session/day counters keep
ticking on‑screen between refreshes via SwiftUI's `.timer` text style (no extension
wake). Client names, per‑client totals, and clock state refresh every ~5 minutes.

## Prerequisites (one‑time)

1. **Install full Xcode** (the Mac App Store build, not just Command Line Tools),
   then point the toolchain at it:
   ```
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   ```
2. **Register the App Group** in your Apple Developer account:
   developer.apple.com/account → Certificates, Identifiers & Profiles → Identifiers →
   **App Groups** → **＋** → id `group.com.xtremeroi.snsdesk`. (Automatic signing in
   Xcode will attach it to both targets once it exists.)
3. **XcodeGen is optional.** `SNSDeskWidgets.xcodeproj` is already generated and
   committed, so you can open it directly. You only need XcodeGen (`brew install
   xcodegen`) if you edit `project.yml` and want to regenerate.

## Build & run

```
cd widget
open SNSDeskWidgets.xcodeproj      # already generated; no XcodeGen needed
# (only if you changed project.yml:  xcodegen generate)
```

In Xcode: select the **SNSDeskWidgets** scheme → **Run** once (this registers the
widgets with the system). Then right‑click the desktop → **Edit Widgets** → search
**S&S Desk** → drag the tiles you want.

To see live data, have S&S Desk running and clock in — the tiles update within a few
minutes (the live session counter is immediate).

## Deep link (optional follow‑up)

Each tile opens `snsdesk://open` when clicked. For that to focus Desk, Desk needs to
register the `snsdesk` URL scheme:
- add `"protocols": [{ "name": "S&S Desk", "schemes": ["snsdesk"] }]` to `build` in
  `package.json`, and
- handle `app.on("open-url", …)` in `main.js` to show the panel.
Until then the click is a harmless no‑op.

## Next step: fold into the Desk bundle

Right now this is a separate companion app (fastest path to working tiles). The
end‑state is to embed `SNSDeskWidgetsExtension.appex` into the Desk `.app` bundle via
an electron‑builder `afterSign` hook (copy into `Contents/PlugIns/`, re‑sign with the
Developer ID, keep the App Group entitlement) so there's a single installed app. That
integration is deferred until the widgets themselves are dialed in.
