import { expect, test } from "bun:test";
import { icns, ico } from "../scripts/make-icons";

const fake = (size: number, len: number) => ({ size, data: new Uint8Array(len).fill(size % 251) });

test("ico directory points at each image", () => {
  const out = ico([fake(16, 10), fake(256, 20)]);
  const v = new DataView(out.buffer);
  expect(v.getUint16(2, true)).toBe(1);
  expect(v.getUint16(4, true)).toBe(2);
  expect(v.getUint8(6)).toBe(16);
  expect(v.getUint8(22)).toBe(0); // 256 px is stored as 0
  const second = v.getUint32(22 + 12, true);
  expect(v.getUint32(22 + 8, true)).toBe(20);
  expect(out[second]).toBe(256 % 251);
  expect(out.length).toBe(6 + 32 + 30);
});

test("icns has a big-endian total length and typed chunks", () => {
  const out = icns([fake(16, 10), fake(1024, 5)]);
  const v = new DataView(out.buffer);
  const tag = (at: number) => String.fromCharCode(...out.slice(at, at + 4));
  expect(tag(0)).toBe("icns");
  expect(v.getUint32(4)).toBe(out.length);
  expect(tag(8)).toBe("icp4");
  expect(v.getUint32(12)).toBe(18);
  expect(tag(26)).toBe("ic10");
  expect(() => icns([fake(20, 1)])).toThrow();
});
