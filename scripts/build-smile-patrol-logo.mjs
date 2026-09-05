import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Preserve the original gold geometry; the white regions become negative space.
const source = fileURLToPath(new URL("../src/app/icon.png", import.meta.url));
const target = fileURLToPath(new URL("../public/favicon/smile-patrol-logo-white.png", import.meta.url));
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
assert.equal(info.channels, 4);
let visiblePixels = 0;
let cutoutPixels = 0;
for (let offset = 0; offset < data.length; offset += 4) {
  const originalAlpha = data[offset + 3];
  const alpha = Math.round(originalAlpha * (255 - data[offset + 2]) / 255);
  if (originalAlpha === 255 && data[offset + 2] === 255) {
    assert.equal(alpha, 0);
    cutoutPixels++;
  }
  if (alpha === 255) visiblePixels++;
  data[offset] = data[offset + 1] = data[offset + 2] = 255;
  data[offset + 3] = alpha;
}
assert.ok(visiblePixels > 0 && cutoutPixels > 0, "The logo must retain both solid geometry and cutouts");
await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(target);
console.log(`Generated ${target}`);
