import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectFile = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const logo = projectFile("public/favicon/smile-patrol-logo-white.png");
const emblemGold = "#F4B600";

// Use the same 180 px composition grid for every output size.
async function renderIcon({ logoSize, logoTop }) {
  const emblem = await sharp(logo).resize(logoSize * 4).png().toBuffer();
  return sharp({ create: { width: 720, height: 720, channels: 3, background: emblemGold } })
    .composite([{ input: emblem, left: (180 - logoSize) * 2, top: Math.round(logoTop * 4) }])
    .png().toBuffer();
}

async function writeIcon(image, size, path) {
  await sharp(image).resize(size, size).removeAlpha().png().toFile(projectFile(path));
}

const standard = await renderIcon({ logoSize: 150, logoTop: 11.5 });
await writeIcon(standard, 180, "src/app/apple-icon.png");
await writeIcon(standard, 192, "public/favicon/home-screen-192.png");
await writeIcon(standard, 512, "public/favicon/home-screen-512.png");

// Keep the entire emblem inside Android's 80%-diameter safe circle.
const maskable = await renderIcon({ logoSize: 120, logoTop: 27.25 });
await writeIcon(maskable, 512, "public/favicon/home-screen-maskable-512.png");
