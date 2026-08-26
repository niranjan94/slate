import { describe, expect, it } from "vitest";
import { clampZoom, pinchFrom, pinchView } from "@/lib/gesture";
import type { Viewport } from "@/lib/paint";
import { MAX_ZOOM, MIN_ZOOM } from "@/lib/tools";

const HOME: Viewport = { zoom: 1, panX: 0, panY: 0 };

/** Where a world point currently lands on the surface, which is what a finger holds onto. */
const project = (view: Viewport, x: number, y: number) => [
  x * view.zoom + view.panX,
  y * view.zoom + view.panY,
];

describe("pinch", () => {
  it("does nothing while the fingers hold still", () => {
    const a = { x: 100, y: 100 };
    const b = { x: 300, y: 300 };
    const pinch = pinchFrom(a, b, HOME);

    expect(pinchView(pinch, a, b)).toEqual(HOME);
  });

  it("scales the zoom by how far the fingers spread", () => {
    const pinch = pinchFrom({ x: 100, y: 200 }, { x: 200, y: 200 }, HOME);

    const view = pinchView(pinch, { x: 50, y: 200 }, { x: 250, y: 200 });

    expect(view.zoom).toBeCloseTo(2);
  });

  it("keeps the point under the fingers under the fingers", () => {
    const view: Viewport = { zoom: 1.5, panX: -40, panY: 25 };
    const a = { x: 120, y: 260 };
    const b = { x: 320, y: 260 };
    const pinch = pinchFrom(a, b, view);
    const [worldX, worldY] = [pinch.anchorX, pinch.anchorY];

    const spread = pinchView(pinch, { x: 60, y: 200 }, { x: 460, y: 200 });

    const [screenX, screenY] = project(spread, worldX, worldY);
    expect(screenX).toBeCloseTo(260);
    expect(screenY).toBeCloseTo(200);
  });

  it("pans when the fingers travel together", () => {
    const pinch = pinchFrom({ x: 100, y: 100 }, { x: 200, y: 200 }, HOME);

    const view = pinchView(pinch, { x: 160, y: 130 }, { x: 260, y: 230 });

    expect(view.zoom).toBeCloseTo(1);
    expect(view.panX).toBeCloseTo(60);
    expect(view.panY).toBeCloseTo(30);
  });

  it("holds the zoom inside its limits however far the fingers go", () => {
    const pinch = pinchFrom({ x: 199, y: 200 }, { x: 201, y: 200 }, HOME);

    expect(pinchView(pinch, { x: 0, y: 200 }, { x: 4000, y: 200 }).zoom).toBe(
      MAX_ZOOM,
    );
    expect(pinchView(pinch, { x: 200, y: 200 }, { x: 200, y: 200 }).zoom).toBe(
      MIN_ZOOM,
    );
  });

  it("survives two fingers landing on the same spot", () => {
    const together = { x: 200, y: 200 };
    const pinch = pinchFrom(together, together, HOME);

    const view = pinchView(pinch, { x: 190, y: 200 }, { x: 210, y: 200 });

    expect(Number.isFinite(view.zoom)).toBe(true);
    expect(Number.isFinite(view.panX)).toBe(true);
  });
});

describe("clampZoom", () => {
  it("leaves a zoom inside the limits alone", () => {
    expect(clampZoom(1.4)).toBe(1.4);
  });

  it("pulls a zoom outside them back", () => {
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
  });
});
