/**
 * generate-skin.js — Generate a custom 64x64 Minecraft skin PNG for the bot
 *
 * Run: node scripts/generate-skin.js
 * Output: assets/bot-skin.png
 *
 * Creates a simple but recognizable skin:
 * - Orange body (Helldiver theme)
 * - Dark visor/helmet
 * - Black boots
 * - White eyes on the visor
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const WIDTH = 64;
const HEIGHT = 64;

// Colors (RGBA)
const YELLOW_BODY = [255, 215, 0, 255];
const DARK_YELLOW = [200, 170, 0, 255];
const BLACK = [20, 20, 20, 255];
const DARK_GRAY = [40, 40, 40, 255];
const WHITE = [240, 240, 240, 255];
const YELLOW = [255, 220, 50, 255];
const TRANSPARENT = [0, 0, 0, 0];
const SKIN_TONE = [220, 180, 140, 255];

function createPNG(width, height, pixels) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT chunk (image data)
  // Each row starts with filter byte (0 = none)
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      rawData[offset++] = pixels[idx];     // R
      rawData[offset++] = pixels[idx + 1]; // G
      rawData[offset++] = pixels[idx + 2]; // B
      rawData[offset++] = pixels[idx + 3]; // A
    }
  }
  const compressed = zlib.deflateSync(rawData);

  // IEND chunk
  const iend = Buffer.alloc(0);

  // Build PNG
  function makeChunk(type, data) {
    const typeBuf = Buffer.from(type, "ascii");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcData = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crc]);
  }

  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  return Buffer.concat([
    signature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", iend),
  ]);
}

// Create pixel buffer
const pixels = new Uint8Array(WIDTH * HEIGHT * 4);

function setPixel(x, y, color) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const idx = (y * WIDTH + x) * 4;
  pixels[idx] = color[0];
  pixels[idx + 1] = color[1];
  pixels[idx + 2] = color[2];
  pixels[idx + 3] = color[3];
}

function fillRect(x, y, w, h, color) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(x + dx, y + dy, color);
    }
  }
}

// Start with transparent
fillRect(0, 0, WIDTH, HEIGHT, TRANSPARENT);

// === HEAD (8x8 at 0,0) ===
// Face
fillRect(0, 0, 8, 8, DARK_GRAY); // helmet base
// Visor (orange strip)
fillRect(1, 2, 6, 2, YELLOW_BODY);
// Eyes (yellow dots on visor)
setPixel(2, 2, YELLOW);
setPixel(5, 2, YELLOW);
// Mouth area
fillRect(2, 5, 4, 1, BLACK);

// === HEAD overlay (8x8 at 32,0) ===
fillRect(32, 0, 8, 8, TRANSPARENT);
// Helmet detail
fillRect(33, 1, 6, 1, DARK_YELLOW);
setPixel(35, 0, YELLOW); // antenna
setPixel(36, 0, YELLOW);

// === BODY (8x4 at 16,16) ===
fillRect(16, 16, 8, 4, YELLOW_BODY);
// Chest detail (black stripe)
fillRect(16, 17, 8, 1, BLACK);
// Badge (yellow square)
fillRect(19, 18, 2, 1, YELLOW);

// === RIGHT ARM (4x12 at 40,16) ===
fillRect(40, 16, 4, 12, DARK_YELLOW);
// Shoulder pad
fillRect(40, 16, 4, 2, BLACK);

// === LEFT ARM (4x12 at 32,48) ===
fillRect(32, 48, 4, 12, DARK_YELLOW);
// Shoulder pad
fillRect(32, 48, 4, 2, BLACK);

// === RIGHT LEG (4x12 at 0,16) ===
fillRect(0, 16, 4, 12, BLACK);
// Boot top
fillRect(0, 24, 4, 4, DARK_GRAY);

// === LEFT LEG (4x12 at 16,48) ===
fillRect(16, 48, 4, 12, BLACK);
// Boot top
fillRect(16, 56, 4, 4, DARK_GRAY);

// === BACK of head (8x8 at 24,0) ===
fillRect(24, 0, 8, 8, DARK_GRAY);
fillRect(25, 1, 6, 6, DARK_YELLOW);

// === Back of body (8x4 at 32,16) ===
fillRect(32, 16, 8, 4, DARK_YELLOW);

// === Back of right arm (4x12 at 44,16) ===
fillRect(44, 16, 4, 12, DARK_YELLOW);

// === Back of left arm (4x12 at 36,48) ===
fillRect(36, 48, 4, 12, DARK_YELLOW);

// === Back of right leg (4x12 at 0,32) ===
fillRect(0, 32, 4, 12, BLACK);
fillRect(0, 40, 4, 4, DARK_GRAY);

// === Back of left leg (4x12 at 16,32) ===  (actually at 0,48 for 64x64)
fillRect(0, 48, 4, 12, BLACK);
fillRect(0, 56, 4, 4, DARK_GRAY);

// Generate PNG
const png = createPNG(WIDTH, HEIGHT, pixels);
const outPath = path.join(__dirname, "..", "assets", "bot-skin.png");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, png);
console.log(`✅ Skin généré: ${outPath} (${png.length} bytes)`);
