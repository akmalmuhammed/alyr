// QR codes for the shop's counter and tables (ALY-112). Drawn in the browser from a link,
// with `qrcode-generator` (MIT, no dependencies; the choice is in the pull request and
// `docs/stack.md`). This file turns its matrix into what a shop needs: an SVG to download or
// print, and pixels for a PNG.
//
// Rules from the print skill (`alyr-print`): dark modules on a light ground (never inverted,
// never Volt, never a logo over the middle), error correction M, and a quiet zone of four
// modules on every side. The links it is given are plain ASCII (an Arabic category is
// percent-encoded by `new URL`), which the library's byte mode carries exactly; the decode
// test (`qr.test.mjs`) reads every code back with an independent decoder.

import qrcode from "qrcode-generator";

export const QUIET = 4;

/** Dark and light, as #rrggbb: always ink on paper (the design tokens' carbon and white), whatever the screen's theme. */
export type Colours = { dark: string; light: string };

export type Matrix = { size: number; dark: (row: number, col: number) => boolean };

/** "#15171a" as [21, 23, 26]. */
function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The link as the code carries it: ASCII only, whatever was typed. */
export function ascii(link: string): string {
  return new URL(link).href;
}

export function encode(link: string): Matrix {
  const code = qrcode(0, "M");
  code.addData(ascii(link));
  code.make();
  return { size: code.getModuleCount(), dark: (r, c) => code.isDark(r, c) };
}

/** One SVG, scalable, with its quiet zone and a white ground. */
export function svg(link: string, colours: Colours): string {
  const m = encode(link);
  const total = m.size + QUIET * 2;
  let path = "";
  for (let r = 0; r < m.size; r++) {
    // A run of dark modules in a row is one rectangle, so the file stays small.
    let c = 0;
    while (c < m.size) {
      if (!m.dark(r, c)) { c++; continue; }
      let end = c;
      while (end < m.size && m.dark(r, end)) end++;
      path += `M${c + QUIET} ${r + QUIET}h${end - c}v1h${c - end}z`;
      c = end;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img">` +
    `<rect width="${total}" height="${total}" fill="${colours.light}"/>` +
    `<path fill="${colours.dark}" d="${path}"/></svg>`
  );
}

/** The code as pixels (RGBA, one scale of modules per side), for a PNG or for a test. */
export function pixels(link: string, scale: number, colours: Colours): { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> } {
  const m = encode(link);
  const modules = m.size + QUIET * 2;
  const width = modules * scale;
  const ink = rgb(colours.dark);
  const paper = rgb(colours.light);
  const data = new Uint8ClampedArray(new ArrayBuffer(width * width * 4)).fill(255);
  for (let i = 0; i < width * width; i++) { data[i * 4] = paper[0]; data[i * 4 + 1] = paper[1]; data[i * 4 + 2] = paper[2]; }
  for (let y = 0; y < width; y++) {
    const r = Math.floor(y / scale) - QUIET;
    if (r < 0 || r >= m.size) continue;
    for (let x = 0; x < width; x++) {
      const c = Math.floor(x / scale) - QUIET;
      if (c < 0 || c >= m.size || !m.dark(r, c)) continue;
      const i = (y * width + x) * 4;
      data[i] = ink[0]; data[i + 1] = ink[1]; data[i + 2] = ink[2];
    }
  }
  return { width, height: width, data };
}

/** A PNG of the code, about `size` pixels a side (a whole number of pixels per module). */
export async function png(link: string, colours: Colours, size = 1024): Promise<Blob> {
  const m = encode(link);
  const scale = Math.max(2, Math.floor(size / (m.size + QUIET * 2)));
  const { width, height, data } = pixels(link, scale, colours);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");
  context.putImageData(new ImageData(data, width, height), 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no png"))), "image/png"));
}
