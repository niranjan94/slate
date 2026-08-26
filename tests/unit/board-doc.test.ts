import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
  addImageElement,
  addTextElement,
  appendInkPoints,
  clearBoard,
  createInkStroke,
  createShapeStroke,
  elementsOf,
  isBoardEmpty,
  LOCAL_ORIGIN,
  observeNames,
  pruneEmptyText,
  publishName,
  readElements,
  readNames,
  readStrokes,
  strokesOf,
  textBodyOf,
  updateElement,
} from "@/lib/board-doc";

const AUTHOR = 42;
const PEER_ORIGIN = Symbol("peer");

let doc: Y.Doc;

beforeEach(() => {
  doc = new Y.Doc();
});

describe("strokes", () => {
  it("round trips an ink stroke through the doc", () => {
    strokesOf(doc).push([createInkStroke("#f00", 3, false, [1, 2])]);

    expect(readStrokes(doc)).toEqual([
      { kind: "ink", color: "#f00", size: 3, erase: false, points: [1, 2] },
    ]);
  });

  it("grows a stroke point by point rather than replacing it", () => {
    const stroke = createInkStroke("#000", 2, false, [0, 0]);
    strokesOf(doc).push([stroke]);
    appendInkPoints(stroke, [5, 5]);
    appendInkPoints(stroke, [9, 9]);

    const [first] = readStrokes(doc);
    expect(first.kind === "ink" && first.points).toEqual([0, 0, 5, 5, 9, 9]);
  });

  it("marks an eraser stroke so painting can knock ink out", () => {
    strokesOf(doc).push([createInkStroke("#000", 20, true, [0, 0])]);

    const [first] = readStrokes(doc);
    expect(first.kind === "ink" && first.erase).toBe(true);
  });

  it("round trips a shape stroke", () => {
    strokesOf(doc).push([
      createShapeStroke({
        kind: "shape",
        shape: "ellipse",
        x0: 1,
        y0: 2,
        x1: 3,
        y1: 4,
        color: "#00f",
        size: 5,
      }),
    ]);

    expect(readStrokes(doc)).toEqual([
      {
        kind: "shape",
        shape: "ellipse",
        x0: 1,
        y0: 2,
        x1: 3,
        y1: 4,
        color: "#00f",
        size: 5,
      },
    ]);
  });
});

describe("elements", () => {
  it("places a text box at the click with an empty body", () => {
    const id = addTextElement(doc, AUTHOR, "#123456", 100, 200);
    const [element] = readElements(doc);

    expect(element.id).toBe(id);
    expect(element.type).toBe("text");
    expect(element.author).toBe(AUTHOR);
    expect(element.type === "text" && element.color).toBe("#123456");
    expect(element.type === "text" && element.text).toBe("");
  });

  it("stacks later elements above earlier ones", () => {
    addTextElement(doc, AUTHOR, "#000", 0, 0);
    addImageElement(doc, AUTHOR, 0, 0, "data:image/png;base64,AA==", 1.5);
    const [lower, upper] = readElements(doc);

    expect(upper.z).toBeGreaterThan(lower.z);
  });

  it("returns elements in stacking order regardless of insertion order", () => {
    const first = addTextElement(doc, AUTHOR, "#000", 0, 0);
    const second = addTextElement(doc, AUTHOR, "#000", 0, 0);
    const ordered = readElements(doc).map((element) => element.id);

    expect(ordered).toEqual([first, second]);
  });

  it("moves and resizes an element in place", () => {
    const id = addTextElement(doc, AUTHOR, "#000", 10, 10);
    updateElement(doc, id, { x: 55, w: 300 });
    const [element] = readElements(doc);

    expect(element.x).toBe(55);
    expect(element.w).toBe(300);
  });

  it("ignores an update for an element that is already gone", () => {
    expect(() => updateElement(doc, "missing", { x: 1 })).not.toThrow();
  });

  it("keeps a text body only for text elements", () => {
    const text = addTextElement(doc, AUTHOR, "#000", 0, 0);
    const image = addImageElement(doc, AUTHOR, 0, 0, "data:,", 1);

    expect(textBodyOf(doc, text)).toBeInstanceOf(Y.Text);
    expect(textBodyOf(doc, image)).toBeNull();
    expect(textBodyOf(doc, "missing")).toBeNull();
  });

  it("discards a text box that was placed but never typed into", () => {
    const id = addTextElement(doc, AUTHOR, "#000", 0, 0);
    pruneEmptyText(doc, id);

    expect(readElements(doc)).toHaveLength(0);
  });

  it("keeps a text box that has something in it", () => {
    const id = addTextElement(doc, AUTHOR, "#000", 0, 0);
    textBodyOf(doc, id)?.insert(0, "kept");
    pruneEmptyText(doc, id);

    expect(readElements(doc)).toHaveLength(1);
  });
});

describe("clearing", () => {
  it("starts empty and reports it", () => {
    expect(isBoardEmpty(doc)).toBe(true);
  });

  it("removes strokes and elements together", () => {
    strokesOf(doc).push([createInkStroke("#000", 2, false, [0, 0])]);
    addTextElement(doc, AUTHOR, "#000", 0, 0);
    expect(isBoardEmpty(doc)).toBe(false);

    clearBoard(doc);

    expect(strokesOf(doc).length).toBe(0);
    expect(elementsOf(doc).size).toBe(0);
    expect(isBoardEmpty(doc)).toBe(true);
  });
});

describe("names", () => {
  it("round trips a name against a client id", () => {
    publishName(doc, 7, "Ada");

    expect(readNames(doc).get(7)).toBe("Ada");
  });

  it("replaces a name rather than accumulating them", () => {
    publishName(doc, 7, "Ada");
    publishName(doc, 7, "Grace");
    const names = readNames(doc);

    expect(names.get(7)).toBe("Grace");
    expect(names.size).toBe(1);
  });

  it("keeps each participant separate", () => {
    publishName(doc, 1, "Ada");
    publishName(doc, 2, "Grace");

    expect(readNames(doc)).toEqual(
      new Map([
        [1, "Ada"],
        [2, "Grace"],
      ]),
    );
  });

  it("skips entries that are not usable client ids", () => {
    doc.getMap<string>("names").set("not-a-number", "Nobody");
    publishName(doc, 3, "Real");

    expect(readNames(doc)).toEqual(new Map([[3, "Real"]]));
  });

  it("notifies a listener when a name lands, and stops on unsubscribe", () => {
    const listener = vi.fn();
    const stop = observeNames(doc, listener);

    publishName(doc, 1, "Ada");
    expect(listener).toHaveBeenCalledTimes(1);

    stop();
    publishName(doc, 1, "Grace");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("undo scoping", () => {
  const manager = () =>
    new Y.UndoManager([strokesOf(doc), elementsOf(doc)], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
    });

  it("undoes work done in this tab", () => {
    const undo = manager();
    doc.transact(() => {
      strokesOf(doc).push([createInkStroke("#000", 2, false, [0, 0])]);
    }, LOCAL_ORIGIN);

    undo.undo();

    expect(strokesOf(doc).length).toBe(0);
  });

  it("never takes back the other person's work", () => {
    const undo = manager();
    doc.transact(() => {
      strokesOf(doc).push([createInkStroke("#f00", 2, false, [1, 1])]);
    }, PEER_ORIGIN);
    doc.transact(() => {
      strokesOf(doc).push([createInkStroke("#000", 2, false, [2, 2])]);
    }, LOCAL_ORIGIN);

    undo.undo();

    const left = readStrokes(doc);
    expect(left).toHaveLength(1);
    expect(left[0].color).toBe("#f00");
  });

  it("leaves a board holding only the peer's work untouched", () => {
    const undo = manager();
    doc.transact(() => {
      strokesOf(doc).push([createInkStroke("#f00", 2, false, [1, 1])]);
    }, PEER_ORIGIN);

    undo.undo();

    expect(strokesOf(doc).length).toBe(1);
  });

  it("treats a whole gesture as one step", () => {
    const undo = manager();
    doc.transact(() => {
      const stroke = createInkStroke("#000", 2, false, [0, 0]);
      strokesOf(doc).push([stroke]);
      appendInkPoints(stroke, [1, 1]);
      appendInkPoints(stroke, [2, 2]);
    }, LOCAL_ORIGIN);

    undo.undo();

    expect(strokesOf(doc).length).toBe(0);
  });

  it("does not track name changes, so a rename is not undoable", () => {
    const undo = manager();
    publishName(doc, 1, "Ada");

    undo.undo();

    expect(readNames(doc).get(1)).toBe("Ada");
  });
});
