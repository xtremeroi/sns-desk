// Toolbar popup: shows exactly what the tracker uses (sites.js + the vetted
// client list cached by the background worker) and clears the change badge.

const $ = (id) => document.getElementById(id);
const when = (ms) => (ms ? new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "never");

function row(list, host, label, extra = "") {
  const li = document.createElement("li");
  const a = document.createElement("span");
  a.textContent = label;
  if (extra) { const t = document.createElement("span"); t.className = "tag"; t.textContent = extra; a.appendChild(t); }
  const b = document.createElement("span");
  b.textContent = host;
  li.append(a, b);
  list.appendChild(li);
}

(async () => {
  $("version").textContent = "Version " + chrome.runtime.getManifest().version;
  const { punchCache, clientSitesCache, sitesChange } = await chrome.storage.local.get(["punchCache", "clientSitesCache", "sitesChange"]);

  const state = punchCache?.state;
  const text = {
    in: "Clocked in. Recording work sites.",
    break: "On a break. Nothing is recorded.",
    out: "Clocked out. Nothing is recorded.",
    "signed-out": "Not signed in to sns.xtremeroi.com in this Chrome profile, so nothing is recorded.",
  }[state] ?? "Checking your clock status.";
  $("status").innerHTML = "";
  const dot = document.createElement("span");
  dot.className = "dot" + (state === "in" ? " on" : "");
  const msg = document.createElement("b");
  msg.textContent = text;
  $("status").append(dot, msg);
  if (state === "signed-out") {
    const p = document.createElement("div");
    p.className = "note";
    const link = document.createElement("a");
    link.href = "https://sns.xtremeroi.com/#v=time";
    link.target = "_blank";
    link.textContent = "Sign in to S&S";
    p.appendChild(link);
    $("status").appendChild(p);
  }

  const added = new Set();
  if (sitesChange && !sitesChange.seen) {
    const box = document.createElement("div");
    box.className = "change";
    const parts = [];
    if (sitesChange.added?.length) parts.push("added " + sitesChange.added.map(([h]) => h).join(", "));
    if (sitesChange.removed?.length) parts.push("removed " + sitesChange.removed.map(([h]) => h).join(", "));
    box.textContent = "Client sites changed on " + when(sitesChange.at) + ": " + parts.join("; ") + ".";
    $("change").appendChild(box);
    for (const [h] of sitesChange.added ?? []) added.add(h);
    await chrome.storage.local.set({ sitesChange: { ...sitesChange, seen: true } });
  }
  await chrome.action.setBadgeText({ text: "" });
  await chrome.action.setTitle({ title: "S&S Desk Companion" });

  for (const [h, n] of PLATFORMS) row($("builtin"), h, n);

  const sites = clientSitesCache?.sites ?? [];
  for (const [h, n] of sites) row($("client"), h, n, added.has(h) ? "new" : "");
  const rejected = clientSitesCache?.rejected ?? [];
  $("clientNote").textContent =
    (sites.length ? "" : "None yet. ") +
    "Managers add specific client storefronts in S&S. Updated " + when(clientSitesCache?.at) + "." +
    (rejected.length ? " Ignored " + rejected.length + " entr" + (rejected.length === 1 ? "y" : "ies") + " that aren't allowed: " + rejected.map((r) => r.host + " (" + r.why + ")").join(", ") + "." : "");

  for (const h of DENY) row($("deny"), h, h === "sns.xtremeroi.com" ? "S&S (tracks itself)" : "Sign-in page");
})();
