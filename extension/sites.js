// What S&S Desk Companion is allowed to track. Shared by the background worker
// (importScripts) and the toolbar popup (<script>), so the list people can
// read in the popup is exactly the list the tracker uses.

// hostname (suffix match) → platform label shown on the timesheet
const PLATFORMS = [
  // Order matters: first suffix match wins, so specific subdomains
  // (adsmanager.facebook.com, ads.tiktok.com) come before their parents.
  ["sellercentral.amazon.com", "Seller Central"],
  ["vendorcentral.amazon.com", "Vendor Central"],
  ["advertising.amazon.com", "Amazon Ads"],
  ["business.amazon.com", "Amazon Business"],
  ["perpetua.io", "Perpetua"],
  ["netsuite.com", "NetSuite"],
  ["adsmanager.facebook.com", "Meta Ads Manager"],
  ["business.facebook.com", "Meta Business Suite"],
  ["meta.com", "Meta"],
  // Instagram is deliberately broad: client reels are reviewed from the
  // audience view, not a business surface.
  ["instagram.com", "Instagram"],
  ["ads.google.com", "Google Ads"],
  ["mail.google.com", "Gmail"],
  ["meet.google.com", "Google Meet"],
  ["calendar.google.com", "Google Calendar"],
  ["google.com", "Google"],
  ["ads.tiktok.com", "TikTok Ads"],
  ["seller.tiktok.com", "TikTok Seller Center"],
  ["tiktok.com", "TikTok"],
  ["shopify.com", "Shopify"],
  ["helium10.com", "Helium 10"],
  ["datadive.tools", "Data Dive"],
  ["workmagic.io", "WorkMagic"],
  ["integrator.io", "Integrator.io"],
  ["zapier.com", "Zapier"],
  ["xtremeroi.com", "XtremeROI"],
  ["chatgpt.com", "ChatGPT"],
  ["claude.com", "Claude"],
  ["claude.ai", "Claude"],
  ["applovin.com", "AppLovin"],
  // Snapchat is deliberately narrow: bare snapchat.com is consumer use.
  ["business.snapchat.com", "Snapchat Ads"],
  ["slack.com", "Slack"],
  ["zoom.us", "Zoom"],
  ["zoom.com", "Zoom"],
  // Teams is narrow: bare microsoft.com would sweep in every MS property.
  ["teams.microsoft.com", "Microsoft Teams"],
  ["calendly.com", "Calendly"],
];

// Never tracked, even though a broad suffix above would match:
// sns.xtremeroi.com (the app tracks itself) and login.xtremeroi.com (auth redirect).
const DENY = ["sns.xtremeroi.com", "login.xtremeroi.com"];

// Client storefront sites come from S&S (so this public code never names our
// clients), but S&S can only ADD a specific client site. These rules are
// enforced here, in the code people can read, so a remote list can never
// widen tracking to personal or general-purpose sites:
// 1. A plain hostname with at least two labels, nothing else.
const HOST_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
// 2. Not a bare country-code suffix like co.uk or com.au.
const BARE_SUFFIX_RE = /^(co|com|org|net|gov|edu|ac|ne|or)\.[a-z]{2}$/;
// 3. Not a personal or general-purpose site, or any page under one.
const NEVER_REMOTE = [
  "amazon.com", "facebook.com", "microsoft.com", "snapchat.com", "apple.com",
  "icloud.com", "youtube.com", "youtu.be", "reddit.com", "x.com", "twitter.com",
  "netflix.com", "hulu.com", "disneyplus.com", "max.com", "primevideo.com",
  "twitch.tv", "spotify.com", "pinterest.com", "ebay.com", "etsy.com",
  "walmart.com", "target.com", "wikipedia.org", "yahoo.com", "outlook.com",
  "live.com", "discord.com", "whatsapp.com", "messenger.com", "espn.com",
  "cnn.com", "foxnews.com", "nytimes.com",
];
// 4. Not a whole shared host: a client's own subdomain (brand.myshopify.com)
//    is fine, the platform root (myshopify.com) is not.
const SHARED_HOSTS = [
  "myshopify.com", "wixsite.com", "squarespace.com", "github.io", "vercel.app",
  "netlify.app", "pages.dev", "workers.dev", "blogspot.com", "wordpress.com",
  "amazonaws.com", "cloudfront.net", "appspot.com", "herokuapp.com",
];
// 5. Not already covered by, or a parent of, a built-in or never-tracked site.
const MAX_REMOTE = 100;

const under = (h, root) => h === root || h.endsWith("." + root);

/** Split an S&S-supplied list into the entries we'll use and the ones refused. */
function vetClientSites(list) {
  const ok = [], rejected = [];
  const seen = new Set();
  for (const x of Array.isArray(list) ? list : []) {
    const host = Array.isArray(x) && typeof x[0] === "string" ? x[0].trim().toLowerCase() : "";
    const label = Array.isArray(x) && typeof x[1] === "string" ? x[1].replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60) : "";
    let why = "";
    if (!HOST_RE.test(host)) why = "not a plain hostname";
    else if (BARE_SUFFIX_RE.test(host)) why = "too broad";
    else if (NEVER_REMOTE.some((r) => under(host, r))) why = "personal or general-purpose site";
    else if (SHARED_HOSTS.includes(host)) why = "whole shared host";
    else if (PLATFORMS.some(([p]) => under(host, p) || under(p, host)) || DENY.some((d) => under(host, d) || under(d, host)))
      why = "overlaps a built-in site";
    else if (!label) why = "missing label";
    else if (seen.has(host)) why = "duplicate";
    else if (ok.length >= MAX_REMOTE) why = "over the limit";
    if (why) rejected.push({ host: host || String(Array.isArray(x) ? x[0] : x), why });
    else { seen.add(host); ok.push([host, label]); }
  }
  return { ok, rejected };
}

/** Platform for a tab URL. Built-ins win over client sites; DENY wins over both. */
function platformOf(url, clientSites = []) {
  try {
    const h = new URL(url).hostname;
    if (DENY.some((d) => under(h, d))) return null;
    for (const [suffix, label] of [...PLATFORMS, ...clientSites]) {
      if (under(h, suffix)) return { c: "ext:" + suffix, n: label };
    }
  } catch { /* ignore */ }
  return null;
}
