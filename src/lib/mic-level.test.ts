import { describe, expect, it } from "vitest";
import {
  ATTACK_MS,
  HALO_RINGS,
  LOUD_DB,
  RELEASE_MS,
  SILENCE_DB,
  haloStyle,
  levelFromRms,
  rmsOf,
  smoothLevel,
} from "./mic-level";

/** A sine wave of the given peak amplitude, the shape a steady tone arrives as. */
function sine(amplitude: number, length = 1024): Float32Array {
  return Float32Array.from({ length }, (_, i) => amplitude * Math.sin((2 * Math.PI * i * 8) / length));
}

/** The RMS amplitude that maps to a given dBFS reading. */
const atDb = (db: number) => 10 ** (db / 20);

describe("mic level", () => {
  it("measures loudness as RMS", () => {
    expect(rmsOf(new Float32Array(0))).toBe(0);
    expect(rmsOf(new Float32Array(512))).toBe(0);
    expect(rmsOf(Float32Array.from([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5, 6);
    // A sine spends most of its time away from the peak: RMS lands at peak / sqrt(2).
    expect(rmsOf(sine(0.8))).toBeCloseTo(0.8 / Math.SQRT2, 3);
  });

  it("maps RMS onto a 0-1 scale in decibels", () => {
    expect(levelFromRms(0)).toBe(0);
    expect(levelFromRms(-1)).toBe(0);
    expect(levelFromRms(atDb(SILENCE_DB - 10))).toBe(0);
    expect(levelFromRms(atDb(SILENCE_DB))).toBeCloseTo(0, 6);
    expect(levelFromRms(atDb(LOUD_DB))).toBeCloseTo(1, 6);
    expect(levelFromRms(1)).toBe(1);
    expect(levelFromRms(atDb((SILENCE_DB + LOUD_DB) / 2))).toBeCloseTo(0.5, 6);
  });

  it("rates a whisper below a raised voice", () => {
    const quiet = levelFromRms(rmsOf(sine(0.005)));
    const talking = levelFromRms(rmsOf(sine(0.05)));
    const loud = levelFromRms(rmsOf(sine(0.5)));
    expect(quiet).toBeLessThan(talking);
    expect(talking).toBeLessThan(loud);
    expect(quiet).toBeGreaterThan(0);
    expect(loud).toBeLessThanOrEqual(1);
  });

  it("rises faster than it falls", () => {
    const risen = smoothLevel(0, 1, 50);
    const fallen = smoothLevel(1, 0, 50);
    expect(risen).toBeGreaterThan(0.5);
    expect(1 - fallen).toBeLessThan(risen);
    // One time constant covers ~63% of the remaining distance, in either direction.
    expect(smoothLevel(0, 1, ATTACK_MS)).toBeCloseTo(1 - Math.exp(-1), 6);
    expect(smoothLevel(1, 0, RELEASE_MS)).toBeCloseTo(Math.exp(-1), 6);
  });

  it("settles on the target and stays there", () => {
    let level = 0;
    for (let i = 0; i < 60; i++) level = smoothLevel(level, 0.6, 16);
    expect(level).toBeCloseTo(0.6, 3);
    expect(smoothLevel(0.6, 0.6, 16)).toBeCloseTo(0.6, 6);
    // Silence eventually reads as silence rather than hanging at a floor.
    for (let i = 0; i < 200; i++) level = smoothLevel(level, 0, 16);
    expect(level).toBeLessThan(0.001);
  });

  it("ignores a frame that took no time, and catches up after a long one", () => {
    expect(smoothLevel(0.3, 1, 0)).toBe(0.3);
    expect(smoothLevel(0.3, 1, -16)).toBe(0.3);
    expect(smoothLevel(0, 1, 5_000)).toBeCloseTo(1, 6);
  });

  it("lands in the same place whether the frames were fast or slow", () => {
    const oneStep = smoothLevel(0, 1, 32);
    const twoSteps = smoothLevel(smoothLevel(0, 1, 16), 1, 16);
    expect(twoSteps).toBeCloseTo(oneStep, 6);
  });

  it("grows the rings with the voice", () => {
    for (const ring of HALO_RINGS) {
      expect(haloStyle(0, ring).scale).toBe(1);
      expect(haloStyle(1, ring).scale).toBeCloseTo(1 + ring.growth, 6);
      expect(haloStyle(0.5, ring).scale).toBeLessThan(haloStyle(1, ring).scale);
      // A level from a misbehaving analyser can't push the ring off the screen.
      expect(haloStyle(9, ring).scale).toBeCloseTo(1 + ring.growth, 6);
      expect(haloStyle(-9, ring).scale).toBe(1);
      expect(haloStyle(1, ring).opacity).toBeCloseTo(ring.peakOpacity, 6);
      expect(haloStyle(0, ring).opacity).toBeGreaterThan(0);
    }
    // The outer ring reaches further and sits fainter than the inner one.
    const [inner, outer] = HALO_RINGS;
    expect(outer.growth).toBeGreaterThan(inner.growth);
    expect(outer.peakOpacity).toBeLessThan(inner.peakOpacity);
  });

  it("stops moving when reduced motion is asked for, but keeps answering", () => {
    for (const ring of HALO_RINGS) {
      expect(haloStyle(0, ring, true).scale).toBe(1);
      expect(haloStyle(1, ring, true).scale).toBe(1);
      expect(haloStyle(0, ring, true).opacity).toBe(0);
      expect(haloStyle(1, ring, true).opacity).toBeCloseTo(ring.peakOpacity, 6);
      expect(haloStyle(0.5, ring, true).opacity).toBeGreaterThan(haloStyle(0.1, ring, true).opacity);
    }
  });
});
