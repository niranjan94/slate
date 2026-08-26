import { describe, expect, it } from "vitest";
import type { ImageElement } from "@/lib/board-doc";
import { hitsElement, topmostAt } from "@/lib/hit-test";

const picture = (over: Partial<ImageElement> = {}): ImageElement => ({
  id: "a",
  type: "image",
  x: 100,
  y: 100,
  w: 200,
  a: 0,
  z: 0,
  author: 1,
  src: "",
  ratio: 2,
  ...over,
});

describe("hitsElement", () => {
  it("takes a point inside the box", () => {
    expect(hitsElement(picture(), 100, 200, 150)).toBe(true);
  });

  it("leaves a point outside it", () => {
    expect(hitsElement(picture(), 100, 320, 150)).toBe(false);
    expect(hitsElement(picture(), 100, 200, 40)).toBe(false);
  });

  it("holds the edges", () => {
    expect(hitsElement(picture(), 100, 100, 100)).toBe(true);
    expect(hitsElement(picture(), 100, 300, 200)).toBe(true);
    expect(hitsElement(picture(), 100, 301, 200)).toBe(false);
  });

  it("follows the box round when it is turned", () => {
    const turned = picture({ a: 90 });

    // A quarter turn puts the long side upright, so this is now inside and this out.
    expect(hitsElement(turned, 100, 200, 220)).toBe(true);
    expect(hitsElement(picture(), 100, 200, 220)).toBe(false);
    expect(hitsElement(turned, 100, 290, 150)).toBe(false);
    expect(hitsElement(picture(), 100, 290, 150)).toBe(true);
  });

  it("leaves the corner a turn has swung away", () => {
    const turned = picture({ a: 45 });

    // Inside the upright box, and outside the same box turned under the point.
    expect(hitsElement(picture(), 100, 105, 195)).toBe(true);
    expect(hitsElement(turned, 100, 105, 195)).toBe(false);
    expect(hitsElement(turned, 100, 200, 150)).toBe(true);
  });
});

describe("topmostAt", () => {
  const stack = [
    { element: picture({ id: "under", z: 1 }), height: 100 },
    { element: picture({ id: "over", z: 2 }), height: 100 },
  ];

  it("answers with the one on top where they overlap", () => {
    expect(topmostAt(stack, 200, 150)?.id).toBe("over");
  });

  it("answers with nothing away from all of them", () => {
    expect(topmostAt(stack, 900, 900)).toBe(null);
  });

  it("reaches past the top one where only the lower is", () => {
    const offset = [
      { element: picture({ id: "under", z: 1 }), height: 100 },
      { element: picture({ id: "over", z: 2, x: 400 }), height: 100 },
    ];

    expect(topmostAt(offset, 200, 150)?.id).toBe("under");
  });
});
