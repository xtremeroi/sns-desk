# S&S Desk Companion extension

Records time on work platforms (Seller Central, Vendor Central, Amazon Ads,
Perpetua, and the other sites in `PLATFORMS` in background.js) into the
Stats & Strats timesheet, plus client storefront sites, which S&S supplies
after you sign in so they never appear in this code.

What it reads and when:
- Only the hostname of your active tab, once a minute. Never URLs, page
  titles, or page content. Sites not on the list are ignored entirely.
- Only while you're clocked in to S&S and not on a break. Clocked out or on
  a break, nothing is sampled.
- Only while your computer is active (idle over 5 minutes stops sampling).

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
