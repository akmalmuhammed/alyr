"use client";

// The hero film's canvas, all but its last shot (FilmCanvas.tsx), drawn only once the film is
// about to play: the HTML carries the still alone (the ALYR Agent home at 16:20), so the first
// paint, the page's payload and its hydration stay as small as the hero's figure was before.
// film.ts asks for the canvas at load (`FILM_MOUNT`); its code arrives then, in its own
// chunk; FilmCanvas says when it is all drawn (`FILM_READY`), and only then does the film start.
// Without scripts, with reduced motion, or before load, there is nothing here: the still is the
// whole picture. (A plain import() and state, not next/dynamic: nothing here is rendered on the
// server, and nothing waits on a Suspense boundary.)

import { useEffect, useState, type ComponentType } from "react";
import type { FilmWords } from "./FilmCanvas";

export const FILM_MOUNT = "alyr:film-mount";
export const FILM_READY = "alyr:film-ready";

export function FilmScenes({ words }: { words: FilmWords }) {
  const [Canvas, setCanvas] = useState<ComponentType<{ words: FilmWords }> | null>(null);
  useEffect(() => {
    let gone = false;
    const mount = () => {
      void import("./FilmCanvas").then((m) => {
        if (!gone) setCanvas(() => m.default);
      });
    };
    window.addEventListener(FILM_MOUNT, mount, { once: true });
    return () => {
      gone = true;
      window.removeEventListener(FILM_MOUNT, mount);
    };
  }, []);
  return Canvas ? <Canvas words={words} /> : null;
}
