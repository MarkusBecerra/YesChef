"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { HALO_RINGS, haloStyle, levelFromRms, rmsOf, smoothLevel } from "@/lib/mic-level";

/**
 * Rings behind the record button that swell with your voice, so you can see the app is
 * hearing you before you have talked your way through a whole recipe.
 *
 * The meter runs at screen refresh rate and writes straight to the two ring elements. Going
 * through React state instead would re-render the import form - transcript, textarea and all
 * - sixty times a second for the sake of two numbers no other component reads.
 *
 * `stream` is whatever microphone is open right now, or null when nothing is being captured;
 * the rings are purely decorative, and the text under the button is what actually announces
 * the state.
 */
export function MicHalo({ stream, children }: { stream: MediaStream | null; children: ReactNode }) {
  const reducedMotion = useSyncExternalStore(subscribeMotionPreference, prefersReducedMotion, notOnTheServer);
  const ringsRef = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const rings = ringsRef.current;
    const show = (level: number) => {
      HALO_RINGS.forEach((ring, index) => {
        const element = rings[index];
        if (!element) return;
        const { scale, opacity } = haloStyle(level, ring, reducedMotion);
        element.style.transform = `scale(${scale})`;
        element.style.opacity = String(opacity);
      });
    };
    const hide = () => {
      for (const element of rings) {
        if (!element) continue;
        element.style.transform = "scale(1)";
        element.style.opacity = "0";
      }
    };

    hide();
    if (!stream) return;

    const Context =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;

    // An older browser, a stream with no audio track, or a machine that is out of audio
    // hardware: none of those are worth an error message. The button just doesn't pulse.
    let context: AudioContext;
    try {
      context = new Context();
    } catch {
      return;
    }
    let source: MediaStreamAudioSourceNode;
    try {
      source = context.createMediaStreamSource(stream);
    } catch {
      // The context survived its constructor, so it is ours to close: a page only gets a
      // handful of them, and one abandoned per failed capture would eventually be all of them.
      void context.close().catch(() => {});
      return;
    }

    const analyser = context.createAnalyser();
    // ~20ms of audio per read at 48kHz: long enough to average a syllable, short enough to
    // feel immediate. The analyser's own smoothing is off because we do our own, with an
    // attack and a release rather than one blur in both directions.
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    // Deliberately not connected to context.destination - nobody wants their own voice back.

    const samples = new Float32Array(analyser.fftSize);
    let level = 0;
    let previous = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      frame = requestAnimationFrame(tick);
      analyser.getFloatTimeDomainData(samples);
      level = smoothLevel(level, levelFromRms(rmsOf(samples)), now - previous);
      previous = now;
      show(level);
    });

    // Safari hands back a suspended context; the tap that opened the microphone is the
    // gesture that lets it start.
    void context.resume?.().catch(() => {});

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void context.close().catch(() => {});
      hide();
    };
  }, [stream, reducedMotion]);

  return (
    <span className="relative inline-flex">
      {HALO_RINGS.map((ring, index) => (
        <span
          key={ring.growth}
          aria-hidden
          ref={(element) => {
            ringsRef.current[index] = element;
          }}
          className="pointer-events-none absolute inset-0 rounded-full bg-danger"
          style={{ opacity: 0, willChange: "transform, opacity" }}
        />
      ))}
      {/* Positioned so it paints over the rings, which are absolute and come first. */}
      <span className="relative inline-flex">{children}</span>
    </span>
  );
}

/* ---------- "prefers-reduced-motion", read the way the React Compiler rules allow ---------- */

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeMotionPreference(onChange: () => void) {
  const query = window.matchMedia?.(REDUCED_MOTION);
  if (!query) return () => {};
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const prefersReducedMotion = () => Boolean(window.matchMedia?.(REDUCED_MOTION).matches);
const notOnTheServer = () => false;
