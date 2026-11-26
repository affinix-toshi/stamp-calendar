// アイコン画像（PNG）を作る。依存なし：node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = [247, 246, 252]; // --paper
const INK = [91, 74, 224]; // --stamp
const WHITE = [255, 255, 255];
const TINT = [238, 235, 255]; // --stamp-tint

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(size, pixels) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    pixels.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8bit
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 角丸の四角の内側なら、その縁からの距離（0〜1 で滑らかに）を返す */
function roundRectCoverage(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const d = Math.hypot(x - cx, y - cy) - r;
  return Math.min(1, Math.max(0, 0.5 - d));
}

function mix(a, b, t) {
  return a.map((v, i) => v + (b[i] - v) * t);
}

/** 背景（薄い紫）の上に、カレンダー（白い紙＋紫の帯）とスタンプの丸を描く */
function draw(size) {
  const px = Buffer.alloc(size * size * 3);
  const u = size / 100;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let c = BG;
      // カレンダーの紙
      c = mix(c, WHITE, roundRectCoverage(x, y, 18 * u, 22 * u, 82 * u, 84 * u, 9 * u));
      // 上の帯
      const inPaper = roundRectCoverage(x, y, 18 * u, 22 * u, 82 * u, 84 * u, 9 * u);
      if (y < 40 * u) c = mix(c, INK, inPaper);
      // とじ具
      for (const bx of [34, 66]) {
        c = mix(c, WHITE, roundRectCoverage(x, y, (bx - 3) * u, 14 * u, (bx + 3) * u, 30 * u, 3 * u));
      }
      // マス目の点
      for (const [dx, dy] of [[34, 52], [50, 52], [66, 52], [34, 68]]) {
        const d = Math.hypot(x - dx * u, y - dy * u) - 4.2 * u;
        c = mix(c, TINT, Math.min(1, Math.max(0, 0.5 - d)));
      }
      // スタンプ（紫の丸）
      const d = Math.hypot(x - 54 * u, y - 68 * u) - 8.5 * u;
      c = mix(c, INK, Math.min(1, Math.max(0, 0.5 - d)));
      px[(y * size + x) * 3] = Math.round(c[0]);
      px[(y * size + x) * 3 + 1] = Math.round(c[1]);
      px[(y * size + x) * 3 + 2] = Math.round(c[2]);
    }
  }
  return px;
}

mkdirSync('public/icons', { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(`public/icons/${name}`, encodePng(size, draw(size)));
  console.log('wrote', name);
}
