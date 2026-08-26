import type { BoardElement } from "./board-doc";

/**
 * Heights are not in the document: a picture's follows from its aspect ratio and a
 * text box's from whatever has been typed into it, so the board measures the laid
 * out box and passes it in. Layout is in world units, the same as `x`, `y` and `w`.
 */
export type MeasuredElement = { element: BoardElement; height: number };

/** Rotates the point back about the element's centre, then tests the upright box. */
export function hitsElement(
  element: { x: number; y: number; w: number; a: number },
  height: number,
  x: number,
  y: number,
): boolean {
  const dx = x - (element.x + element.w / 2);
  const dy = y - (element.y + height / 2);

  if (!element.a) {
    return Math.abs(dx) <= element.w / 2 && Math.abs(dy) <= height / 2;
  }

  const radians = (-element.a * Math.PI) / 180;
  const localX = dx * Math.cos(radians) - dy * Math.sin(radians);
  const localY = dx * Math.sin(radians) + dy * Math.cos(radians);
  return Math.abs(localX) <= element.w / 2 && Math.abs(localY) <= height / 2;
}

/** The one a finger would have meant, which is the one painted over the others. */
export function topmostAt(
  measured: MeasuredElement[],
  x: number,
  y: number,
): BoardElement | null {
  for (let index = measured.length - 1; index >= 0; index -= 1) {
    const { element, height } = measured[index];
    if (hitsElement(element, height, x, y)) return element;
  }
  return null;
}
