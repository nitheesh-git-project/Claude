import { describe, expect, it } from "vitest";
import {
  QR_INTERNALS,
  QR_MAX_VERSION,
  encodeQr,
  formatBits,
  maskApplies,
  qrByteCapacity,
  qrSvgPath,
  reedSolomon,
  versionBits,
  type QrLevel,
  type QrMatrix,
} from "./qrCode";

const { BLOCKS, functionGrid, dataCodewords } = QR_INTERNALS;

// --- A decoder, written for the test --------------------------------------------------------------
// Reads a symbol the way a scanner does: format word -> level and mask, then
// the data modules in the standard's zigzag, unmasked, de-interleaved, with
// every block's Reed-Solomon checked, then byte mode read back to text.

function readFormat(m: boolean[][]): { level: QrLevel; mask: number } {
  const size = m.length;
  // The copy beside the top-left finder, bit i of the word, same positions
  // the standard gives (bits 0-5 down column 8, then 7 and 8, then row 8).
  let bits = 0;
  for (let i = 0; i < 15; i++) {
    const v = i < 6 ? m[i][8] : i < 8 ? m[i + 1][8] : m[size - 15 + i][8];
    if (v) bits |= 1 << i;
  }
  const unmasked = bits ^ 0x5412;
  const data = unmasked >> 10;
  return { level: (data >> 3) === 1 ? "L" : "M", mask: data & 7 };
}

function decode(matrix: QrMatrix): string {
  const { modules, version } = matrix;
  const { level, mask } = readFormat(modules);
  const size = modules.length;
  const fn = functionGrid(version, level);
  // Data modules in the zigzag, skipping function modules.
  const bits: boolean[] = [];
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let k = 0; k < size; k++) {
      const row = up ? size - 1 - k : k;
      for (const c of [col, col - 1]) {
        if (fn[row][c] !== null) continue;
        bits.push(maskApplies(mask, row, c) ? !modules[row][c] : modules[row][c]);
      }
    }
    up = !up;
  }
  const spec = BLOCKS[level][version - 1];
  const words: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    words.push(bits.slice(i, i + 8).reduce((n, b) => (n << 1) | (b ? 1 : 0), 0));
  }
  expect(words.length).toBeGreaterThanOrEqual(spec.total);
  // De-interleave.
  const sizes: number[] = [];
  for (const [count, data] of spec.groups) for (let i = 0; i < count; i++) sizes.push(data);
  const blocks = sizes.map(() => [] as number[]);
  let w = 0;
  const longest = Math.max(...sizes);
  for (let i = 0; i < longest; i++) sizes.forEach((s, b) => { if (i < s) blocks[b].push(words[w++]); });
  const ecs = sizes.map(() => [] as number[]);
  for (let i = 0; i < spec.ecPerBlock; i++) ecs.forEach((e) => e.push(words[w++]));
  // Every block's error correction must be what Reed-Solomon says.
  blocks.forEach((b, i) => expect(reedSolomon(b, spec.ecPerBlock)).toEqual(ecs[i]));
  const data = blocks.flat();
  // Byte mode.
  const stream = data.flatMap((byte) => Array.from({ length: 8 }, (_, i) => (byte >> (7 - i)) & 1));
  let p = 0;
  const take = (n: number) => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | stream[p++]; return v; };
  expect(take(4)).toBe(0b0100);
  const length = take(version >= 10 ? 16 : 8);
  const out = Array.from({ length }, () => take(8));
  return new TextDecoder().decode(new Uint8Array(out));
}

describe("tables", () => {
  it("every version's blocks add up to its total codewords", () => {
    for (const level of ["L", "M"] as QrLevel[]) {
      BLOCKS[level].forEach((spec) => {
        const blocks = spec.groups.reduce((n, [count]) => n + count, 0);
        expect(dataCodewords(spec) + blocks * spec.ecPerBlock).toBe(spec.total);
      });
    }
  });

  it("holds the standard's published byte capacities", () => {
    // ISO/IEC 18004 table 7: byte mode, versions 1-10.
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => qrByteCapacity(v, "L"))).toEqual([
      17, 32, 53, 78, 106, 134, 154, 192, 230, 271,
    ]);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => qrByteCapacity(v, "M"))).toEqual([
      14, 26, 42, 62, 84, 106, 122, 152, 180, 213,
    ]);
  });

  it("has the module count the standard gives each version", () => {
    for (let v = 1; v <= QR_MAX_VERSION; v++) expect(functionGrid(v, "M").length).toBe(17 + 4 * v);
  });
});

describe("words", () => {
  it("makes the standard's format words", () => {
    // With mask 0: level L data 01000 and level M data 00000.
    expect(formatBits("L", 0)).toBe(0b111011111000100);
    expect(formatBits("M", 0)).toBe(0b101010000010010);
    expect(formatBits("L", 4)).toBe(0b110011000101111);
    expect(formatBits("L", 7)).toBe(0b110100101110110);
    expect(formatBits("M", 5)).toBe(0b100000011001110);
  });

  it("makes the standard's version words", () => {
    expect(versionBits(7)).toBe(0b000111110010010100);
    expect(versionBits(10)).toBe(0b001010010011010011);
  });
});

describe("Reed-Solomon", () => {
  it("matches the standard's worked example (01234567, version 1-M)", () => {
    const data = [
      0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11,
    ];
    expect(reedSolomon(data, 10)).toEqual([0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]);
  });
});

describe("encodeQr", () => {
  it("draws the finder patterns and timing lines where a scanner looks", () => {
    const q = encodeQr("https://example.com/s")!;
    const m = q.modules;
    const finder = (r: number, c: number) => {
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 7; j++) {
          const ring = Math.max(Math.abs(i - 3), Math.abs(j - 3));
          expect(m[r + i][c + j]).toBe(ring !== 2);
        }
      }
    };
    finder(0, 0);
    finder(0, q.size - 7);
    finder(q.size - 7, 0);
    for (let i = 8; i < q.size - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
    expect(m[q.size - 8][8]).toBe(true);
  });

  it("reads back to the text it was given, at both levels, across versions", () => {
    const samples = [
      "a",
      "https://moverestore.example/screen",
      "https://moverestore.example/patient/dashboard/session?x=1",
      "x".repeat(80),
      "y".repeat(150),
      "z".repeat(200),
      "Priya ₹ é",
    ];
    const versions = new Set<number>();
    for (const level of ["L", "M"] as QrLevel[]) {
      for (const text of samples) {
        const q = encodeQr(text, level);
        if (!q) {
          expect(new TextEncoder().encode(text).length).toBeGreaterThan(qrByteCapacity(QR_MAX_VERSION, level));
          continue;
        }
        versions.add(q.version);
        expect(decode(q)).toBe(text);
      }
    }
    // The samples cover small versions and ones with several blocks and
    // alignment patterns.
    expect(Math.max(...versions)).toBeGreaterThanOrEqual(9);
    expect(versions.size).toBeGreaterThanOrEqual(5);
  });

  it("uses the smallest version that fits", () => {
    expect(encodeQr("a".repeat(14), "M")!.version).toBe(1);
    expect(encodeQr("a".repeat(15), "M")!.version).toBe(2);
    expect(encodeQr("a".repeat(17), "L")!.version).toBe(1);
  });

  it("says no to text that does not fit rather than drawing a wrong symbol", () => {
    expect(encodeQr("a".repeat(272), "L")).toBeNull();
    expect(encodeQr("a".repeat(214), "M")).toBeNull();
  });

  it("writes version information from version 7", () => {
    const q = encodeQr("v".repeat(150), "M")!;
    expect(q.version).toBeGreaterThanOrEqual(7);
    const bits = versionBits(q.version);
    for (let i = 0; i < 18; i++) {
      expect(q.modules[Math.floor(i / 3)][(i % 3) + q.size - 11]).toBe(((bits >> i) & 1) === 1);
    }
  });
});

describe("qrSvgPath", () => {
  it("draws exactly the dark modules, inside a quiet zone", () => {
    const q = encodeQr("hello")!;
    const path = qrSvgPath(q, 4);
    const area = [...path.matchAll(/M(\d+) (\d+)h(\d+)v1/g)].reduce((n, m) => n + Number(m[3]), 0);
    expect(area).toBe(q.modules.flat().filter(Boolean).length);
    const xs = [...path.matchAll(/M(\d+) (\d+)h/g)].map((m) => Number(m[1]));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(4);
  });
});
