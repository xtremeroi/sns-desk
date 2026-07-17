// Bridge from Desk (Electron) to the native WidgetKit widgets.
//
// Desk is the source of truth for punch state; the widget extension is a
// sandboxed process that can't reach Desk's IPC or the S&S API. We share a
// tiny JSON snapshot through the App Group container both sides agree on:
//   ~/Library/Group Containers/29528WCWRA.com.xtremeroi.snsdesk/widget-state.json
// Desk (non-sandboxed) writes the literal path; the sandboxed widget reads the
// same directory via containerURL(forSecurityApplicationGroupIdentifier:).
const fs = require("fs");
const os = require("os");
const path = require("path");

const APP_GROUP = "29528WCWRA.com.xtremeroi.snsdesk";
const dir = path.join(os.homedir(), "Library", "Group Containers", APP_GROUP);
const file = path.join(dir, "widget-state.json");

let lastJson = null; // skip redundant writes (pushState fires often)

function write(snapshot) {
  try {
    const json = JSON.stringify(snapshot);
    if (json === lastJson) return;
    lastJson = json;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, json);
  } catch {
    /* best effort — the widget just shows its last snapshot */
  }
}

module.exports = { write, APP_GROUP, file };
