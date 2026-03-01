#!/usr/bin/env node
// Generates resources/icon.png — a 1024x1024 PNG app icon for Floating Notes.
// Uses only Node.js built-ins (no extra packages needed).
// Run with: node scripts/make-icon.js

const fs = require('fs');
const path = require('path');

// ─── Minimal PNG encoder ──────────────────────────────────────────────────────
// Implements only what we need: RGBA 1024×1024, deflate-stored (level 0).

function crc32(buf, crc = 0xffffffff) {
  if (!crc32.table) {
    crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crc32.table[n] = c;
    }
  }
  const t = crc32.table;
  for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.concat([typeBytes, data]);
  const crcVal = Buffer.alloc(4);
  crcVal.writeUInt32BE(crc32(crcBuf));
  return Buffer.concat([len, typeBytes, data, crcVal]);
}

function adler32(buf) {
  let s1 = 1, s2 = 0;
  for (const b of buf) { s1 = (s1 + b) % 65521; s2 = (s2 + s1) % 65521; }
  return (s2 << 16) | s1;
}

function deflateStore(data) {
  // zlib wrapper around deflate stored blocks (no compression, level 0)
  const blocks = [];
  const BLOCK = 65535;
  for (let i = 0; i < data.length; i += BLOCK) {
    const slice = data.slice(i, i + BLOCK);
    const last = i + BLOCK >= data.length ? 1 : 0;
    const hdr = Buffer.alloc(5);
    hdr[0] = last;
    hdr.writeUInt16LE(slice.length, 1);
    hdr.writeUInt16LE(~slice.length & 0xffff, 3);
    blocks.push(hdr, slice);
  }
  const body = Buffer.concat(blocks);
  const adler = adler32(data);
  const result = Buffer.alloc(2 + body.length + 4);
  result[0] = 0x78; result[1] = 0x01; // zlib header (deflate, level 1)
  body.copy(result, 2);
  result.writeUInt32BE(adler, 2 + body.length);
  return result;
}

function encodePNG(width, height, rgbaPixels) {
  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type: RGB (we'll use RGB, no alpha for simplicity)
  ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;

  // Build raw pixel data (filter byte 0 per row + RGB)
  const rowLen = width * 3;
  const raw = Buffer.alloc(height * (1 + rowLen));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + rowLen)] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * (1 + rowLen) + 1 + x * 3;
      raw[dst]     = rgbaPixels[src];
      raw[dst + 1] = rgbaPixels[src + 1];
      raw[dst + 2] = rgbaPixels[src + 2];
    }
  }

  const idat = chunk('IDAT', deflateStore(raw));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG magic
    chunk('IHDR', ihdrData),
    idat,
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ─── Draw the icon ────────────────────────────────────────────────────────────

const W = 1024;
const pixels = new Uint8Array(W * W * 4);

function setPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= W || y < 0 || y >= W) return;
  const i = (y * W + x) * 4;
  // Alpha-blend over current pixel
  const fa = a / 255;
  pixels[i]     = Math.round(pixels[i]     * (1 - fa) + r * fa);
  pixels[i + 1] = Math.round(pixels[i + 1] * (1 - fa) + g * fa);
  pixels[i + 2] = Math.round(pixels[i + 2] * (1 - fa) + b * fa);
  pixels[i + 3] = Math.min(255, pixels[i + 3] + a);
}

function circle(cx, cy, r, r2, g2, b2, a = 255) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= r) setPixel(x, y, r2, g2, b2, a);
    }
  }
}

function roundRect(x1, y1, x2, y2, radius, r, g, b, a = 255) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      // Corner rounding check
      const inCorner = (
        (x < x1 + radius && y < y1 + radius && Math.sqrt((x - (x1 + radius)) ** 2 + (y - (y1 + radius)) ** 2) > radius) ||
        (x > x2 - radius && y < y1 + radius && Math.sqrt((x - (x2 - radius)) ** 2 + (y - (y1 + radius)) ** 2) > radius) ||
        (x < x1 + radius && y > y2 - radius && Math.sqrt((x - (x1 + radius)) ** 2 + (y - (y2 - radius)) ** 2) > radius) ||
        (x > x2 - radius && y > y2 - radius && Math.sqrt((x - (x2 - radius)) ** 2 + (y - (y2 - radius)) ** 2) > radius)
      );
      if (!inCorner) setPixel(x, y, r, g, b, a);
    }
  }
}

function line(x1, y1, x2, y2, thickness, r, g, b, a = 255) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.ceil(len * 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    circle(px, py, thickness / 2, r, g, b, a);
  }
}

// Background: warm white
for (let i = 0; i < W * W * 4; i += 4) {
  pixels[i] = 255; pixels[i+1] = 252; pixels[i+2] = 247; pixels[i+3] = 255;
}

// App icon background square with rounded corners (macOS icon shape)
roundRect(80, 80, 943, 943, 220, 247, 186, 95); // warm yellow-orange gradient base

// Gradient simulation: lighter at top
for (let y = 80; y <= 943; y++) {
  for (let x = 80; x <= 943; x++) {
    const dx = x - 80, dy = y - 80;
    const inCorner = (
      (x < 300 && y < 300 && Math.sqrt((x - 300) ** 2 + (y - 300) ** 2) > 220) ||
      (x > 723 && y < 300 && Math.sqrt((x - 723) ** 2 + (y - 300) ** 2) > 220) ||
      (x < 300 && y > 723 && Math.sqrt((x - 300) ** 2 + (y - 723) ** 2) > 220) ||
      (x > 723 && y > 723 && Math.sqrt((x - 723) ** 2 + (y - 723) ** 2) > 220)
    );
    if (!inCorner) {
      const t = dy / 863;
      const r2 = Math.round(255 - t * 30);
      const g2 = Math.round(220 - t * 50);
      const b2 = Math.round(100 - t * 40);
      setPixel(x, y, r2, g2, b2, 255);
    }
  }
}

// White "paper" (the note)
roundRect(200, 180, 820, 830, 40, 255, 255, 255, 240);

// Ruled lines on the paper
for (let i = 0; i < 6; i++) {
  const ly = 330 + i * 80;
  line(270, ly, 750, ly, 6, 210, 210, 220, 180);
}

// Pencil — diagonal across bottom-right corner
line(530, 660, 770, 440, 36, 255, 200, 50);   // yellow body
line(530, 660, 770, 440, 10, 200, 155, 30);   // darker edge
line(770, 440, 810, 400, 36, 230, 140, 80);   // tip (wood)
line(530, 660, 490, 700, 36, 220, 220, 220);  // eraser (gray)
circle(790, 420, 18, 60, 40, 20, 255);         // pencil tip (dark)

// Specular highlight on the app background (top-left glint)
for (let y = 90; y <= 400; y++) {
  for (let x = 90; x <= 450; x++) {
    const d = Math.sqrt((x - 90) ** 2 + (y - 90) ** 2);
    if (d < 360) {
      const alpha = Math.round(35 * (1 - d / 360));
      setPixel(x, y, 255, 255, 255, alpha);
    }
  }
}

// ─── Write to file ────────────────────────────────────────────────────────────
const outPath = path.join(__dirname, '..', 'resources', 'icon.png');
const png = encodePNG(W, W, pixels);
fs.writeFileSync(outPath, png);
console.log(`✅ Icon written to ${outPath} (${(png.length / 1024).toFixed(1)} KB)`);
