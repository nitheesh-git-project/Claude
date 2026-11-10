// A small QR Code encoder (ISO/IEC 18004), byte mode, versions 1-10, error
// correction L or M. Dependency-free, so a link can be drawn as a scannable
// square in the browser with nothing installed and nothing fetched.
//
// Used for the patient's companion-screen link (a check on a second device).
// It is deliberately limited to what that needs - a short URL, at most 271
// bytes - and says so by returning null for anything longer, rather than
// pretending to be a general library.
//
// The tables are the standard's. They are checked in qrCode.test.ts: the
// block structure must add up to each version's total codewords, the
// Reed-Solomon output must match the standard's worked example, the format
// and version words must match the standard's published values, and a decoder
// written in the test reads every symbol it makes back to the original text.

export type QrLevel = "L" | "M";
export type QrMatrix = { size: number; version: number; modules: boolean[][] };

// [total codewords, EC codewords per block, [blocks, data codewords] groups]
type BlockSpec = { total: number; ecPerBlock: number; groups: [number, number][] };

const BLOCKS: Record<QrLevel, BlockSpec[]> = {
  // index 0 = version 1
  L: [
    { total: 26, ecPerBlock: 7, groups: [[1, 19]] },
    { total: 44, ecPerBlock: 10, groups: [[1, 34]] },
    { total: 70, ecPerBlock: 15, groups: [[1, 55]] },
    { total: 100, ecPerBlock: 20, groups: [[1, 80]] },
    { total: 134, ecPerBlock: 26, groups: [[1, 108]] },
    { total: 172, ecPerBlock: 18, groups: [[2, 68]] },
    { total: 196, ecPerBlock: 20, groups: [[2, 78]] },
    { total: 242, ecPerBlock: 24, groups: [[2, 97]] },
    { total: 292, ecPerBlock: 30, groups: [[2, 116]] },
    { total: 346, ecPerBlock: 18, groups: [[2, 68], [2, 69]] },
  ],
  M: [
    { total: 26, ecPerBlock: 10, groups: [[1, 16]] },
    { total: 44, ecPerBlock: 16, groups: [[1, 28]] },
    { total: 70, ecPerBlock: 26, groups: [[1, 44]] },
    { total: 100, ecPerBlock: 18, groups: [[2, 32]] },
    { total: 134, ecPerBlock: 24, groups: [[2, 43]] },
    { total: 172, ecPerBlock: 16, groups: [[4, 27]] },
    { total: 196, ecPerBlock: 18, groups: [[4, 31]] },
    { total: 242, ecPerBlock: 22, groups: [[2, 38], [2, 39]] },
    { total: 292, ecPerBlock: 22, groups: [[3, 36], [2, 37]] },
    { total: 346, ecPerBlock: 26, groups: [[4, 43], [1, 44]] },
  ],
};

const ALIGNMENT: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

export const QR_MAX_VERSION = 10;

function dataCodewords(spec: BlockSpec): number {
  return spec.groups.reduce((n, [blocks, data]) => n + blocks * data, 0);
}

/** How many bytes of text a version holds at a level (byte mode). */
export function qrByteCapacity(version: number, level: QrLevel): number {
  const spec = BLOCKS[level][version - 1];
  const countBits = version >= 10 ? 16 : 8;
  return Math.floor((dataCodewords(spec) * 8 - 4 - countBits) / 8);
}

// --- Galois field 2^8, polynomial 0x11D --------------------------------------------------------

const EXP = new Array<number>(512);
const LOG = new Array<number>(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

/** Coefficients of (x - a^0)(x - a^1)...(x - a^(n-1)), highest power first,
 *  without the leading 1. */
function generator(n: number): number[] {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly.slice(1);
}

/** The Reed-Solomon error-correction codewords for a block of data. */
export function reedSolomon(data: number[], ecCount: number): number[] {
  const gen = generator(ecCount);
  const rem = new Array<number>(ecCount).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let i = 0; i < ecCount; i++) rem[i] ^= gfMul(gen[i], factor);
  }
  return rem;
}

// --- Words -------------------------------------------------------------------------------------

function bchDigit(x: number): number {
  let d = 0;
  while (x !== 0) {
    d++;
    x >>>= 1;
  }
  return d;
}

const FORMAT_GENERATOR = 0x537;
const FORMAT_MASK = 0x5412;
const VERSION_GENERATOR = 0x1f25;
const LEVEL_BITS: Record<QrLevel, number> = { L: 1, M: 0 };

/** The 15-bit format word: level and mask, BCH-protected, XOR 0x5412. */
export function formatBits(level: QrLevel, mask: number): number {
  const data = (LEVEL_BITS[level] << 3) | mask;
  let d = data << 10;
  while (bchDigit(d) - bchDigit(FORMAT_GENERATOR) >= 0) {
    d ^= FORMAT_GENERATOR << (bchDigit(d) - bchDigit(FORMAT_GENERATOR));
  }
  return ((data << 10) | d) ^ FORMAT_MASK;
}

/** The 18-bit version word, for versions 7 and up. */
export function versionBits(version: number): number {
  let d = version << 12;
  while (bchDigit(d) - bchDigit(VERSION_GENERATOR) >= 0) {
    d ^= VERSION_GENERATOR << (bchDigit(d) - bchDigit(VERSION_GENERATOR));
  }
  return (version << 12) | d;
}

// --- Data --------------------------------------------------------------------------------------

function utf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function buildDataCodewords(bytes: number[], version: number, spec: BlockSpec): number[] {
  const capacityBits = dataCodewords(spec) * 8;
  const bits: number[] = [];
  const push = (value: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version >= 10 ? 16 : 8);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    out.push(bits.slice(i, i + 8).reduce((n, b) => (n << 1) | b, 0));
  }
  for (let pad = 0; out.length < dataCodewords(spec); pad++) out.push(pad % 2 === 0 ? 0xec : 0x11);
  return out;
}

/** Splits into blocks, adds each block's error correction, interleaves. */
function interleave(data: number[], spec: BlockSpec): number[] {
  const blocks: number[][] = [];
  let offset = 0;
  for (const [count, size] of spec.groups) {
    for (let i = 0; i < count; i++) {
      blocks.push(data.slice(offset, offset + size));
      offset += size;
    }
  }
  const ecBlocks = blocks.map((b) => reedSolomon(b, spec.ecPerBlock));
  const out: number[] = [];
  const longest = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < spec.ecPerBlock; i++) for (const b of ecBlocks) out.push(b[i]);
  return out;
}

// --- Matrix ------------------------------------------------------------------------------------

type Grid = (boolean | null)[][];

function placeFinder(grid: Grid, row: number, col: number) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= grid.length || cc >= grid.length) continue;
      grid[rr][cc] =
        (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
        (r >= 2 && r <= 4 && c >= 2 && c <= 4);
    }
  }
}

function placeAlignment(grid: Grid, version: number) {
  const pos = ALIGNMENT[version - 1];
  for (const row of pos) {
    for (const col of pos) {
      if (grid[row][col] !== null) continue; // overlaps a finder
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          grid[row + r][col + c] = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
        }
      }
    }
  }
}

function placeTiming(grid: Grid) {
  for (let i = 8; i < grid.length - 8; i++) {
    if (grid[6][i] === null) grid[6][i] = i % 2 === 0;
    if (grid[i][6] === null) grid[i][6] = i % 2 === 0;
  }
}

function placeFormat(grid: Grid, level: QrLevel, mask: number) {
  const size = grid.length;
  const bits = formatBits(level, mask);
  for (let i = 0; i < 15; i++) {
    const bit = ((bits >> i) & 1) === 1;
    if (i < 6) grid[i][8] = bit;
    else if (i < 8) grid[i + 1][8] = bit;
    else grid[size - 15 + i][8] = bit;
    if (i < 8) grid[8][size - i - 1] = bit;
    else if (i < 9) grid[8][15 - i - 1 + 1] = bit;
    else grid[8][15 - i - 1] = bit;
  }
  grid[size - 8][8] = true; // the always-dark module
}

function placeVersion(grid: Grid, version: number) {
  if (version < 7) return;
  const size = grid.length;
  const bits = versionBits(version);
  for (let i = 0; i < 18; i++) {
    const bit = ((bits >> i) & 1) === 1;
    grid[Math.floor(i / 3)][(i % 3) + size - 11] = bit;
    grid[(i % 3) + size - 11][Math.floor(i / 3)] = bit;
  }
}

/** Reserves the format and version areas (as light) so data skips them. */
function functionGrid(version: number, level: QrLevel): Grid {
  const size = 17 + 4 * version;
  const grid: Grid = Array.from({ length: size }, () => new Array<boolean | null>(size).fill(null));
  placeFinder(grid, 0, 0);
  placeFinder(grid, 0, size - 7);
  placeFinder(grid, size - 7, 0);
  placeAlignment(grid, version);
  placeTiming(grid);
  placeFormat(grid, level, 0);
  placeVersion(grid, version);
  return grid;
}

export function maskApplies(mask: number, i: number, j: number): boolean {
  switch (mask) {
    case 0: return (i + j) % 2 === 0;
    case 1: return i % 2 === 0;
    case 2: return j % 3 === 0;
    case 3: return (i + j) % 3 === 0;
    case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
    case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
    case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
    default: return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
  }
}

function placeData(grid: Grid, codewords: number[], mask: number) {
  const size = grid.length;
  let inc = -1;
  let row = size - 1;
  let bitIndex = 7;
  let byteIndex = 0;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (;;) {
      for (let c = 0; c < 2; c++) {
        if (grid[row][col - c] === null) {
          let dark = false;
          if (byteIndex < codewords.length) dark = ((codewords[byteIndex] >>> bitIndex) & 1) === 1;
          if (maskApplies(mask, row, col - c)) dark = !dark;
          grid[row][col - c] = dark;
          bitIndex--;
          if (bitIndex === -1) {
            byteIndex++;
            bitIndex = 7;
          }
        }
      }
      row += inc;
      if (row < 0 || row >= size) {
        row -= inc;
        inc = -inc;
        break;
      }
    }
  }
}

function penalty(m: boolean[][]): number {
  const size = m.length;
  let score = 0;
  // Rule 1: runs of five or more of one colour, in rows and in columns.
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < size; a++) {
      let run = 1;
      for (let b = 1; b < size; b++) {
        const cur = pass === 0 ? m[a][b] : m[b][a];
        const prev = pass === 0 ? m[a][b - 1] : m[b - 1][a];
        if (cur === prev) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else run = 1;
      }
    }
  }
  // Rule 2: 2x2 blocks of one colour.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
  }
  // Rule 3: the 1:1:3:1:1 finder-like pattern with four light modules beside it.
  const pattern = [true, false, true, true, true, false, true];
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < size; a++) {
      for (let b = 0; b + 7 <= size; b++) {
        const at = (k: number) => (pass === 0 ? m[a][b + k] : m[b + k][a]);
        if (!pattern.every((p, k) => at(k) === p)) continue;
        const lightBefore = b >= 4 && [1, 2, 3, 4].every((k) => (pass === 0 ? !m[a][b - k] : !m[b - k][a]));
        const lightAfter = b + 11 <= size && [7, 8, 9, 10].every((k) => !at(k));
        if (lightBefore || lightAfter) score += 40;
      }
    }
  }
  // Rule 4: balance of dark and light.
  let dark = 0;
  for (const row of m) for (const v of row) if (v) dark++;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

/**
 * Encodes text as a QR symbol, or null when it does not fit versions 1-10
 * at the chosen level. The smallest version that fits is used, and the mask
 * with the lowest penalty.
 */
export function encodeQr(text: string, level: QrLevel = "M"): QrMatrix | null {
  const bytes = utf8(text);
  for (let version = 1; version <= QR_MAX_VERSION; version++) {
    if (bytes.length > qrByteCapacity(version, level)) continue;
    const spec = BLOCKS[level][version - 1];
    const codewords = interleave(buildDataCodewords(bytes, version, spec), spec);
    let best: { modules: boolean[][]; score: number } | null = null;
    for (let mask = 0; mask < 8; mask++) {
      const grid = functionGrid(version, level);
      placeFormat(grid, level, mask);
      placeData(grid, codewords, mask);
      const modules = grid.map((row) => row.map((v) => v === true));
      const score = penalty(modules);
      if (!best || score < best.score) best = { modules, score };
    }
    return { size: 17 + 4 * version, version, modules: best!.modules };
  }
  return null;
}

/** One SVG path drawing every dark module, inside a quiet zone of `quiet`
 *  modules (the standard asks for four). Pair with a viewBox of
 *  `size + 2 * quiet` on both sides. */
export function qrSvgPath(matrix: QrMatrix, quiet = 4): string {
  const parts: string[] = [];
  matrix.modules.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c++;
        continue;
      }
      let end = c;
      while (end < row.length && row[end]) end++;
      parts.push(`M${c + quiet} ${r + quiet}h${end - c}v1h-${end - c}z`);
      c = end;
    }
  });
  return parts.join("");
}

/** Exposed for the tests' decoder and checks. */
export const QR_INTERNALS = { BLOCKS, ALIGNMENT, functionGrid, dataCodewords };
