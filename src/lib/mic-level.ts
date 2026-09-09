/**
 * The arithmetic behind the pulsing microphone halo: raw audio samples in, a 0-1 loudness
 * out, and the ring geometry that loudness drives.
 *
 * It lives here, away from the component, because it is the only part worth testing - the
 * rest of the meter is an AnalyserNode and a requestAnimationFrame loop.
 */

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Root-mean-square amplitude of time-domain samples (each in -1..1). */
export function rmsOf(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

/**
 * The window the halo reacts across. A quiet room sits below -55 dBFS, and browsers turn
 * their automatic gain up until speech lands somewhere around -35 to -15 - so the ring
 * spends its whole range where a voice actually lives instead of saving most of it for a
 * shout it will never hear.
 */
export const SILENCE_DB = -55;
export const LOUD_DB = -12;

/** RMS amplitude -> 0-1 loudness, on the decibel scale hearing actually works on. */
export function levelFromRms(rms: number): number {
  if (rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  return clamp01((db - SILENCE_DB) / (LOUD_DB - SILENCE_DB));
}

/**
 * Rise quickly, fall slowly. A syllable should push the ring out on the frame it lands, but
 * the gaps between words shouldn't strobe it back to nothing - so the two directions get
 * different time constants.
 */
export const ATTACK_MS = 50;
export const RELEASE_MS = 320;

/**
 * Move `current` toward `target` by however much `elapsedMs` earned. Exponential rather than
 * a fixed step so a dropped frame catches up instead of stalling the ring.
 */
export function smoothLevel(current: number, target: number, elapsedMs: number): number {
  if (!(elapsedMs > 0)) return current;
  const constant = target > current ? ATTACK_MS : RELEASE_MS;
  return current + (target - current) * (1 - Math.exp(-elapsedMs / constant));
}

/**
 * The concentric rings behind the button, innermost first: how far each one grows at full
 * voice, and how solid it gets there.
 */
export const HALO_RINGS = [
  { growth: 0.42, peakOpacity: 0.5 },
  { growth: 0.6, peakOpacity: 0.24 },
] as const;

export type HaloRing = (typeof HALO_RINGS)[number];

/**
 * Where a ring sits for a given loudness.
 *
 * With reduced motion asked for, the ring stops growing and only brightens - the feedback
 * survives, the thing pulsing in the corner of your eye doesn't. Otherwise the ring keeps a
 * quarter of its glow at rest, so silence still reads as "listening" rather than "off".
 */
export function haloStyle(level: number, ring: HaloRing, reducedMotion = false): { scale: number; opacity: number } {
  const loudness = clamp01(level);
  return {
    scale: reducedMotion ? 1 : 1 + ring.growth * loudness,
    opacity: ring.peakOpacity * (reducedMotion ? loudness : 0.25 + 0.75 * loudness),
  };
}
