# S&S Desk Companion extension

Records time on work platforms (Seller Central, Vendor Central, Amazon Ads,
Perpetua, and the other sites in `PLATFORMS` in background.js) into the
Stats & Strats timesheet, plus client storefront sites, which S&S supplies
after you sign in so they never appear in this code.

What it reads and when:
- Only the hostname of your active tab, once a minute. Never URLs, page
  titles, or page content. Sites not on the list are ignored entirely.
- Only while you're clocked in to S&S and not on a break. Clocked out or on
  a break, nothing is sampled, and any sample that lands in the minute a
  break starts or the clock stops is cut against the punch record before it
  uploads. Activity blocks never span a break or a clock-out.
- Only while Chrome is the app in front. Switch to another app and Chrome
  stops counting (S&S Desk tracks the other app).
- Only while your computer is active (idle over 5 minutes stops sampling).

What it tracks is visible: click the extension icon to see every work
platform, every client site S&S has supplied, and what's never tracked. The
built-in list is in `sites.js`. S&S can add specific client storefronts, but
`vetClientSites()` refuses anything personal or general-purpose (YouTube,
Amazon.com shopping, whole shared hosts like myshopify.com, and so on), and
any change to the client list shows a "!" badge on the icon until you open it.

## Install
From the Chrome Web Store (recommended):
https://chromewebstore.google.com/detail/gnnbdcclnjelekfhafggkighoemcdeli

Or from this source:
1. Download this `extension/` folder.
2. Open chrome://extensions and turn on "Developer mode" (top right).
3. Click "Load unpacked" and select the folder.

Either way, sign in at https://sns.xtremeroi.com in the same Chrome profile.
The extension posts using that sign-in, and records nothing when you're
signed out. Time shows on the Time page as platform-labeled blocks inside
your clocked hours; if your session expires, blocks queue locally and upload
after your next sign-in.
