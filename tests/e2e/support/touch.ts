import type { Page } from "@playwright/test";
import type { Point } from "./board";

/**
 * Real touch input, which Playwright's own API does not reach: it drives the mouse,
 * and the board's surface turns on the pointer type and on how many touches are
 * down, so synthesised mouse events would exercise none of what a phone does.
 *
 * CDP makes this Chromium only, which is why the mobile project is the only one
 * that runs these.
 */
export async function touchInput(page: Page) {
  const cdp = await page.context().newCDPSession(page);

  type Phase = "touchStart" | "touchMove" | "touchEnd";

  const dispatch = (type: Phase, points: Point[]) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map(([x, y], id) => ({
        x,
        y,
        id,
        radiusX: 8,
        radiusY: 8,
        force: 1,
      })),
    });

  const down = (...points: Point[]) => dispatch("touchStart", points);
  const move = (...points: Point[]) => dispatch("touchMove", points);
  const up = () => dispatch("touchEnd", []);

  const glide = async (frames: Point[][]) => {
    for (const frame of frames) {
      await move(...frame);
      await page.waitForTimeout(12);
    }
  };

  return {
    down,
    move,
    up,

    async tap(point: Point) {
      await down(point);
      await up();
    },

    async press(point: Point, milliseconds: number) {
      await down(point);
      await page.waitForTimeout(milliseconds);
    },

    async drag([fromX, fromY]: Point, [toX, toY]: Point, steps = 14) {
      await down([fromX, fromY]);
      await glide(
        Array.from({ length: steps }, (_, index) => {
          const along = (index + 1) / steps;
          return [
            [fromX + (toX - fromX) * along, fromY + (toY - fromY) * along],
          ] as Point[];
        }),
      );
      await up();
    },

    /** Two fingers on a diagonal about `centre`, moving from `from` apart to `to` apart. */
    async pinch([cx, cy]: Point, from: number, to: number, steps = 12) {
      const finger = (gap: number, sign: number): Point => [
        cx + (sign * gap) / 2,
        cy + (sign * gap) / 2,
      ];
      await down(finger(from, -1), finger(from, 1));
      await glide(
        Array.from({ length: steps }, (_, index) => {
          const gap = from + ((to - from) * (index + 1)) / steps;
          return [finger(gap, -1), finger(gap, 1)];
        }),
      );
      await up();
    },
  };
}
