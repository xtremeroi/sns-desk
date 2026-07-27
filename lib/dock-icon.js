// Dock tile renderer: HUD-style 7-segment time digits on a dark plate.
// macOS silently refuses dock BADGES for menu-bar apps promoted into the Dock
// (setBadge lands, nothing renders), so Dock mode draws the time into the
// icon itself — which also matches the HUD skin. Pure pixel pushing, same
// raw-RGBA + addRepresentation approach as tray-icon.js.

// Segment layout on a 10 x 17 unit digit box, thickness t.
const T = 2.6;
const SEGS = {
  A: [1.2, 0, 7.6, T],
  B: [10 - T, 1.0, T, 6.6],
  C: [10 - T, 9.4, T, 6.6],
  D: [1.2, 17 - T, 7.6, T],
  E: [0, 9.4, T, 6.6],
  F: [0, 1.0, T, 6.6],
  G: [1.2, 8.5 - T / 2, 7.6, T],
};
const DIGITS = {
  0: "ABCDEF", 1: "BC", 2: "ABGED", 3: "ABGCD", 4: "FGBC",
  5: "AFGCD", 6: "AFGEDC", 7: "ABC", 8: "ABCDEFG", 9: "ABCFGD",
};
const DIGIT_W = 10, DIGIT_H = 17, COLON_W = 4, GAP = 2;

function unitsWide(str) {
  let u = 0;
  for (const ch of str) u += (ch === ":" ? COLON_W : DIGIT_W) + GAP;
  return u - GAP;
}

function dockIcon(nativeImage, timeStr, col) {
  const img = nativeImage.createEmpty();
  for (const scale of [1, 2]) {
    const size = 256, px = size * scale;
    const data = Buffer.alloc(px * px * 4);
    const put = (x, y, r, g, b, a) => {
      if (x < 0 || y < 0 || x >= px || y >= px) return;
      const i = (y * px + x) * 4;
      // BGRA, like tray-icon.js — macOS raw representations are NOT RGBA
      // (green survives the swap, amber renders pale blue — it happened).
      data[i] = b; data[i + 1] = g; data[i + 2] = r; data[i + 3] = a;
    };
    // Dark rounded plate with a thin state-colored ring.
    const inset = 14 * scale, rad = 58 * scale, ring = 5 * scale;
    const lo = inset, hi = px - inset;
    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        if (x < lo || x >= hi || y < lo || y >= hi) continue;
        const cx = Math.max(0, Math.max(lo + rad - x, x - (hi - rad)));
        const cy = Math.max(0, Math.max(lo + rad - y, y - (hi - rad)));
        const d = Math.sqrt(cx * cx + cy * cy);
        if (d > rad) continue;
        if (d > rad - ring || x < lo + ring || x >= hi - ring || y < lo + ring || y >= hi - ring) {
          if (d > rad - ring && d <= rad) put(x, y, col.r, col.g, col.b, 255);
          else if (cx === 0 || cy === 0) put(x, y, col.r, col.g, col.b, 255);
          else put(x, y, 12, 18, 32, 255);
        } else put(x, y, 12, 18, 32, 255);
      }
    }
    // Time digits, centered, scaled to fit.
    const uw = unitsWide(timeStr);
    const s = Math.min(((size - 2 * 34) * scale) / uw, (96 * scale) / DIGIT_H);
    const x0 = Math.round((px - uw * s) / 2);
    const y0 = Math.round((px - DIGIT_H * s) / 2);
    const fill = (ux, uy, uw2, uh2, ox) => {
      const xs = Math.round(x0 + (ox + ux) * s), xe = Math.round(x0 + (ox + ux + uw2) * s);
      const ys = Math.round(y0 + uy * s), ye = Math.round(y0 + (uy + uh2) * s);
      for (let y = ys; y < ye; y++) for (let x = xs; x < xe; x++) put(x, y, col.r, col.g, col.b, 255);
    };
    let ox = 0;
    for (const ch of timeStr) {
      if (ch === ":") {
        fill(0.7, 4.6, T, T, ox);
        fill(0.7, 10.2, T, T, ox);
        ox += COLON_W + GAP;
      } else {
        for (const seg of DIGITS[ch] ?? "") {
          const [ux, uy, w, h] = SEGS[seg];
          fill(ux, uy, w, h, ox);
        }
        ox += DIGIT_W + GAP;
      }
    }
    img.addRepresentation({ width: size, height: size, scaleFactor: scale, buffer: data });
  }
  return img;
}

module.exports = { dockIcon };
