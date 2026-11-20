// Renders src/ui/icon.svg into the desktop app icons Pake needs:
//   desktop/icons/icon.png  (Linux, 512 px)
//   desktop/icons/icon.ico  (Windows, PNG entries 16 to 256 px)
//   desktop/icons/icon.icns (macOS, PNG entries 16 to 1024 px)
// The desktop workflow runs this before packaging; run `bun run icons` locally only to preview them.
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const svg = readFileSync("src/ui/icon.svg", "utf8");
// macOS draws Dock icons inside a margin (about 80% of the canvas); a full-bleed icon would look oversized there.
const macSvg = svg.replace('viewBox="0 0 32 32"', 'viewBox="-3.2 -3.2 38.4 38.4"');
const png = (size: number, source = svg) =>
  new Uint8Array(new Resvg(source, { fitTo: { mode: "width", value: size } }).render().asPng());

export function ico(images: { size: number; data: Uint8Array }[]): Uint8Array {
  const header = 6 + 16 * images.length;
  const total = header + images.reduce((n, i) => n + i.data.length, 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint16(2, 1, true); // type: icon
  v.setUint16(4, images.length, true);
  let offset = header;
  images.forEach((img, k) => {
    const e = 6 + 16 * k;
    v.setUint8(e, img.size >= 256 ? 0 : img.size); // 0 means 256
    v.setUint8(e + 1, img.size >= 256 ? 0 : img.size);
    v.setUint16(e + 4, 1, true); // colour planes
    v.setUint16(e + 6, 32, true); // bits per pixel
    v.setUint32(e + 8, img.data.length, true);
    v.setUint32(e + 12, offset, true);
    out.set(img.data, offset);
    offset += img.data.length;
  });
  return out;
}

// ICNS types that hold PNG data, by pixel size.
const ICNS_TYPES: Record<number, string> = { 16: "icp4", 32: "icp5", 64: "icp6", 128: "ic07", 256: "ic08", 512: "ic09", 1024: "ic10" };

export function icns(images: { size: number; data: Uint8Array }[]): Uint8Array {
  const total = 8 + images.reduce((n, i) => n + 8 + i.data.length, 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  const tag = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  tag(0, "icns");
  v.setUint32(4, total); // big endian
  let offset = 8;
  for (const img of images) {
    const type = ICNS_TYPES[img.size];
    if (!type) throw new Error(`No ICNS type for ${img.size} px`);
    tag(offset, type);
    v.setUint32(offset + 4, 8 + img.data.length);
    out.set(img.data, offset + 8);
    offset += 8 + img.data.length;
  }
  return out;
}

if (import.meta.main) {
  mkdirSync("desktop/icons", { recursive: true });
  const render = (sizes: number[], source = svg) => sizes.map((size) => ({ size, data: png(size, source) }));
  writeFileSync("desktop/icons/icon.png", png(512));
  writeFileSync("desktop/icons/icon.ico", ico(render([16, 24, 32, 48, 64, 128, 256])));
  writeFileSync("desktop/icons/icon.icns", icns(render([16, 32, 64, 128, 256, 512, 1024], macSvg)));
  console.log("Wrote desktop/icons/icon.{png,ico,icns}");
}
