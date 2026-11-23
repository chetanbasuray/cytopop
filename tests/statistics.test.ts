import { expect, test } from "bun:test";
import { channelStats, pearson, populationStats, splitKeys, stainIndex, statValues, volumeMicrolitres, type Population } from "../src/core/populations";

// Deterministic normal sample (Box-Muller on mulberry32) so the tests do not flake.
function normal(n: number, mean: number, sd: number, seed = 1): Float32Array {
  let s = seed;
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) + 1) / 4294967297;
  };
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = mean + sd * Math.sqrt(-2 * Math.log(rand())) * Math.cos(2 * Math.PI * rand());
  return out;
}

test("mode and half-peak CV recover a normal peak", () => {
  const s = channelStats(normal(200000, 1000, 50));
  expect(Math.abs(s.mode - 1000)).toBeLessThan(15);
  expect(Math.abs(s.hpcv - 5)).toBeLessThan(0.6);
});

test("mode falls back to the median when all values are equal", () => {
  const s = channelStats(new Float32Array([7, 7, 7]));
  expect(s.mode).toBe(7);
  expect(s.hpcv).toBeNaN();
});

test("stain index uses the negative median and robust SD", () => {
  const neg = channelStats(normal(100000, 100, 20));
  const pos = channelStats(normal(100000, 1100, 20, 2));
  expect(stainIndex(pos, neg)).toBeCloseTo(1000 / 40, 0);
  expect(stainIndex(pos, { ...neg, rsd: 0 })).toBeNaN();
});

test("pearson correlation within a mask", () => {
  const x = new Float32Array([1, 2, 3, 4, 100]);
  expect(pearson(x, new Float32Array([2, 4, 6, 8, 0]), new Uint8Array([1, 1, 1, 1, 0]))).toBeCloseTo(1, 6);
  expect(pearson(x, new Float32Array([8, 6, 4, 2, 0]), new Uint8Array([1, 1, 1, 1, 0]))).toBeCloseTo(-1, 6);
  expect(pearson(x, new Float32Array([5, 5, 5, 5, 5]))).toBeNaN();
  expect(pearson(x, x, new Uint8Array([1, 0, 0, 0, 0]))).toBeNaN();
});

test("volume is read from $VOL in nanolitres", () => {
  expect(volumeMicrolitres({ $VOL: "50000" })).toBe(50);
  expect(volumeMicrolitres({ $VOL: "abc" })).toBeUndefined();
  expect(volumeMicrolitres({})).toBeUndefined();
});

test("percent of grandparent for nested populations", () => {
  const pops: Population[] = [
    { id: "a", name: "A", parentId: null, gate: { kind: "clean" } },
    { id: "b", name: "B", parentId: "a", gate: { kind: "clean" } },
    { id: "c", name: "C", parentId: "b", gate: { kind: "clean" } },
  ];
  const masks = new Map([
    ["a", new Uint8Array([1, 1, 1, 1, 0, 0, 0, 0, 0, 0])],
    ["b", new Uint8Array([1, 1, 0, 0, 0, 0, 0, 0, 0, 0])],
    ["c", new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0, 0, 0])],
  ]);
  const [a, b, c] = populationStats(pops, masks, 10);
  expect(a!.percentGrandparent).toBeNaN();
  expect(b!.percentGrandparent).toBeCloseTo(20);
  expect(c!.percentGrandparent).toBeCloseTo(25);
});

test("statValues orders population keys first, then each channel's keys", () => {
  const x = new Float32Array([1, 2, 3, 4]);
  const y = new Float32Array([2, 4, 6, 8]);
  expect(splitKeys(["median", "r", "pg"])).toEqual({ population: ["r", "pg"], channel: ["median"] });
  const v = statValues(["median", "perUl", "r", "si"], { cols: [x, undefined, y], count: 4, percentGrandparent: NaN, volumeUl: 2 });
  expect(v.slice(0, 2)).toEqual([2, NaN]); // r needs the first two channels present
  expect(v.length).toBe(2 + 3 * 2);
  expect(v[2]).toBeCloseTo(2.5);
  expect(v[3]).toBeNaN(); // no negative chosen
  expect(v[4]).toBeNaN(); // missing channel keeps its columns
  expect(v[6]).toBeCloseTo(5);
});
