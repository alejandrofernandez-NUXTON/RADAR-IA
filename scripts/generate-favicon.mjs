import { writeFileSync } from "node:fs";
import { join } from "node:path";

const sizes = [16, 32, 48];

function insideRoundedRect(x, y, size, inset, radius) {
  const left = inset;
  const top = inset;
  const right = size - inset;
  const bottom = size - inset;
  if (x < left || x >= right || y < top || y >= bottom) return false;

  const cx = x < left + radius ? left + radius : x >= right - radius ? right - radius - 1 : x;
  const cy = y < top + radius ? top + radius : y >= bottom - radius ? bottom - radius - 1 : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function distanceToLine(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function drawIcon(size) {
  const scale = 4;
  const highSize = size * scale;
  const high = new Uint8ClampedArray(highSize * highSize * 4);

  for (let y = 0; y < highSize; y += 1) {
    for (let x = 0; x < highSize; x += 1) {
      const nx = x / scale;
      const ny = y / scale;
      const offset = (y * highSize + x) * 4;

      if (insideRoundedRect(nx, ny, size, size * 0.08, size * 0.22)) {
        high[offset] = 255;
        high[offset + 1] = 255;
        high[offset + 2] = 255;
        high[offset + 3] = 255;
      }

      const top = size * 0.2;
      const bottom = size * 0.82;
      const leftStart = size * 0.23;
      const leftEnd = size * 0.36;
      const rightStart = size * 0.64;
      const rightEnd = size * 0.77;
      const inVertical = ny >= top && ny <= bottom && ((nx >= leftStart && nx <= leftEnd) || (nx >= rightStart && nx <= rightEnd));
      const inDiagonal = ny >= top && ny <= bottom && distanceToLine(nx, ny, leftEnd, top, rightStart, bottom) <= size * 0.07;

      if (inVertical || inDiagonal) {
        high[offset] = 8;
        high[offset + 1] = 8;
        high[offset + 2] = 8;
        high[offset + 3] = 255;
      }
    }
  }

  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let yy = 0; yy < scale; yy += 1) {
        for (let xx = 0; xx < scale; xx += 1) {
          const offset = ((y * scale + yy) * highSize + (x * scale + xx)) * 4;
          r += high[offset];
          g += high[offset + 1];
          b += high[offset + 2];
          a += high[offset + 3];
        }
      }
      const samples = scale * scale;
      const out = (y * size + x) * 4;
      rgba[out] = Math.round(r / samples);
      rgba[out + 1] = Math.round(g / samples);
      rgba[out + 2] = Math.round(b / samples);
      rgba[out + 3] = Math.round(a / samples);
    }
  }

  return rgba;
}

function createDib(size, rgba) {
  const headerSize = 40;
  const pixelBytes = size * size * 4;
  const maskRowBytes = Math.ceil(size / 32) * 4;
  const maskBytes = maskRowBytes * size;
  const dib = Buffer.alloc(headerSize + pixelBytes + maskBytes);

  dib.writeUInt32LE(headerSize, 0);
  dib.writeInt32LE(size, 4);
  dib.writeInt32LE(size * 2, 8);
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  dib.writeUInt32LE(0, 16);
  dib.writeUInt32LE(pixelBytes, 20);

  let cursor = headerSize;
  for (let y = size - 1; y >= 0; y -= 1) {
    for (let x = 0; x < size; x += 1) {
      const source = (y * size + x) * 4;
      dib[cursor] = rgba[source + 2];
      dib[cursor + 1] = rgba[source + 1];
      dib[cursor + 2] = rgba[source];
      dib[cursor + 3] = rgba[source + 3];
      cursor += 4;
    }
  }

  return dib;
}

const images = sizes.map((size) => ({ size, dib: createDib(size, drawIcon(size)) }));
const directorySize = 6 + images.length * 16;
const totalSize = directorySize + images.reduce((sum, image) => sum + image.dib.length, 0);
const ico = Buffer.alloc(totalSize);

ico.writeUInt16LE(0, 0);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(images.length, 4);

let imageOffset = directorySize;
for (const [index, image] of images.entries()) {
  const entry = 6 + index * 16;
  ico[entry] = image.size;
  ico[entry + 1] = image.size;
  ico[entry + 2] = 0;
  ico[entry + 3] = 0;
  ico.writeUInt16LE(1, entry + 4);
  ico.writeUInt16LE(32, entry + 6);
  ico.writeUInt32LE(image.dib.length, entry + 8);
  ico.writeUInt32LE(imageOffset, entry + 12);
  image.dib.copy(ico, imageOffset);
  imageOffset += image.dib.length;
}

writeFileSync(join(process.cwd(), "public", "favicon.ico"), ico);
console.log("public/favicon.ico generated");
