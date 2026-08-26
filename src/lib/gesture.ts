import type { Viewport } from "./paint";
import { MAX_ZOOM, MIN_ZOOM } from "./tools";

/** A point in surface pixels, with the surface's own origin already taken off. */
export type SurfacePoint = { x: number; y: number };

export type Pinch = {
  startDistance: number;
  startZoom: number;
  anchorX: number;
  anchorY: number;
};

export const clampZoom = (zoom: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

const distance = (a: SurfacePoint, b: SurfacePoint) =>
  Math.hypot(b.x - a.x, b.y - a.y);

const midpoint = (a: SurfacePoint, b: SurfacePoint) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

/**
 * Anchors the world point that sits under the midpoint of the two fingers. Holding
 * that point to the midpoint for the rest of the gesture is what makes one pair of
 * fingers pan and zoom at once, so a pinch needs no separate two finger drag.
 */
export function pinchFrom(
  a: SurfacePoint,
  b: SurfacePoint,
  view: Viewport,
): Pinch {
  const centre = midpoint(a, b);
  return {
    // Fingers can start touching, and a zero here would scale the zoom to infinity.
    startDistance: Math.max(distance(a, b), 1),
    startZoom: view.zoom,
    anchorX: (centre.x - view.panX) / view.zoom,
    anchorY: (centre.y - view.panY) / view.zoom,
  };
}

export function pinchView(
  pinch: Pinch,
  a: SurfacePoint,
  b: SurfacePoint,
): Viewport {
  const zoom = clampZoom(
    pinch.startZoom * (distance(a, b) / pinch.startDistance),
  );
  const centre = midpoint(a, b);
  return {
    zoom,
    panX: centre.x - pinch.anchorX * zoom,
    panY: centre.y - pinch.anchorY * zoom,
  };
}
