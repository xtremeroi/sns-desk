// S&S ligature mark rendered as a macOS template tray icon.
//
// The mark is seven pill bars on a fixed grid (two bar-chart S glyphs sharing
// the long bars). Template images only use alpha, so we rasterize coverage
// into a BGRA buffer at 2x and let macOS tint it black/white with the menu bar.
"use strict";

// Pill geometry in glyph space (90 x 89): x, y, width; height 13, radius 6.5.
const BARS = [
  [0, 0, 90], [0, 19, 22], [34, 19, 22],
  [0, 38, 90], [34, 57, 22], [68, 57, 22],
  [0, 76, 90],
];
const GLYPH_W = 90, GLYPH_H = 89, PILL_H = 13, PILL_R = 6.5;

function inPill(px, py) {
  for (const [bx, by, bw] of BARS) {
    if (py < by - 1 || py > by + PILL_H + 1) continue;
    const cy = by + PILL_R;
    const cx = Math.min(Math.max(px, bx + PILL_R), bx + bw - PILL_R);
    const dx = px - cx, dy = py - cy;
    if (dx * dx + dy * dy <= PILL_R * PILL_R) return true;
  }
  return false;
}

/**
 * Rasterize the mark: logical `size` pt at `scaleFactor`, BGRA premultiplied.
 * Returns { width, height, scaleFactor, data: Buffer }.
 */
function rasterize(size = 16, scaleFactor = 2, color = null) {
  const px = size * scaleFactor;
  const glyphPx = px - 2 * scaleFactor; // 1pt padding each side
  const s = glyphPx / GLYPH_W;
  const ox = (px - GLYPH_W * s) / 2;
  const oy = (px - GLYPH_H * s) / 2;
  const SS = 3;
  const data = Buffer.alloc(px * px * 4);
  for (let j = 0; j < px; j++) {
    for (let i = 0; i < px; i++) {
      let hit = 0;
      for (let sj = 0; sj < SS; sj++) {
        for (let si = 0; si < SS; si++) {
          const gx = (i + (si + 0.5) / SS - ox) / s;
          const gy = (j + (sj + 0.5) / SS - oy) / s;
          if (inPill(gx, gy)) hit++;
        }
      }
      // Alpha = coverage. Template icons stay premultiplied black (zeros +
      // alpha); colored state icons premultiply the given BGR fill.
      const a = Math.round((hit / (SS * SS)) * 255);
      const o = (j * px + i) * 4;
      data[o + 3] = a;
      if (color && a > 0) {
        data[o] = Math.round((color.b * a) / 255);
        data[o + 1] = Math.round((color.g * a) / 255);
        data[o + 2] = Math.round((color.r * a) / 255);
      }
    }
  }
  return { width: px, height: px, scaleFactor, data };
}

/**
 * Build the tray NativeImage. Pass Electron's nativeImage module in.
 * With no color: a template image (macOS tints it black/white with the bar).
 * With {r,g,b}: a colored state icon (green = clocked in, etc.).
 */
function trayIcon(nativeImage, size = 16, color = null) {
  const { width, height, scaleFactor, data } = rasterize(size, 2, color);
  const img = nativeImage.createEmpty();
  img.addRepresentation({ width, height, scaleFactor, buffer: data });
  img.setTemplateImage(!color);
  return img;
}

module.exports = { trayIcon, rasterize };
