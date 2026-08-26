"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * Read on the first render rather than in an effect, so a phone does not paint a
 * frame of the wide layout and then correct itself. The server has no screen to
 * measure and answers no, which the client reconciles as it mounts.
 */
function useMediaQuery(query: string): boolean {
  const store = useMemo(() => {
    const media =
      typeof window === "undefined" ? null : window.matchMedia(query);
    return {
      subscribe: (onChange: () => void) => {
        media?.addEventListener("change", onChange);
        return () => media?.removeEventListener("change", onChange);
      },
      snapshot: () => media?.matches ?? false,
    };
  }, [query]);

  return useSyncExternalStore(store.subscribe, store.snapshot, () => false);
}

/** Too narrow for the full dock, which is any phone held upright. */
export const useNarrowScreen = () => useMediaQuery("(max-width: 639px)");

/**
 * The pointer is a finger. Independent of width, since a tablet is wide enough for
 * the full dock and still needs targets a thumb can hit.
 */
export const useCoarsePointer = () => useMediaQuery("(pointer: coarse)");
