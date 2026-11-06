// Presence beacon: lets the S&S web app know the companion is installed so the
// Time page can swap the "install the browser tracker" prompt for an active
// state. Runs only on sns.xtremeroi.com (see manifest content_scripts).
// Reads and sends nothing — it only marks the page.
try {
  const version = chrome.runtime.getManifest().version;
  document.documentElement.setAttribute("data-sns-companion", version);
  window.dispatchEvent(new CustomEvent("sns-companion-ready", { detail: { version } }));
} catch (e) {
  /* ignore */
}
