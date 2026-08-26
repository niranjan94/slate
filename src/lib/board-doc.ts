import * as Y from "yjs";

export type ToolId = "pen" | "eraser" | "text" | "shape" | "select" | "pan";
export type ShapeId = "rect" | "ellipse" | "line";

export type InkStroke = {
  kind: "ink";
  color: string;
  size: number;
  erase: boolean;
  points: number[];
};

export type ShapeStroke = {
  kind: "shape";
  shape: ShapeId;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  size: number;
};

export type Stroke = InkStroke | ShapeStroke;

export type TextElement = {
  id: string;
  type: "text";
  x: number;
  y: number;
  w: number;
  z: number;
  author: number;
  color: string;
  text: string;
};

export type ImageElement = {
  id: string;
  type: "image";
  x: number;
  y: number;
  w: number;
  z: number;
  author: number;
  src: string;
  ratio: number;
};

export type BoardElement = TextElement | ImageElement;

export type YStroke = Y.Map<unknown>;
export type YElement = Y.Map<unknown>;

/** Marks transactions that originated from this tab, so undo and echo suppression can tell them apart. */
export const LOCAL_ORIGIN = Symbol("slate-local");

export function strokesOf(doc: Y.Doc): Y.Array<YStroke> {
  return doc.getArray<YStroke>("strokes");
}

export function elementsOf(doc: Y.Doc): Y.Map<YElement> {
  return doc.getMap<YElement>("elements");
}

function counterOf(doc: Y.Doc): Y.Map<number> {
  return doc.getMap<number>("counter");
}

function namesOf(doc: Y.Doc): Y.Map<string> {
  return doc.getMap<string>("names");
}

/**
 * Author labels have to survive a reload and a peer going away, so the chosen
 * name is kept in the doc rather than only in awareness.
 */
export function publishName(doc: Y.Doc, clientId: number, name: string): void {
  doc.transact(() => {
    namesOf(doc).set(String(clientId), name);
  }, LOCAL_ORIGIN);
}

export function readNames(doc: Y.Doc): Map<number, string> {
  const names = new Map<number, string>();
  for (const [key, name] of namesOf(doc).entries()) {
    const clientId = Number(key);
    if (Number.isFinite(clientId) && name) names.set(clientId, name);
  }
  return names;
}

export function observeNames(doc: Y.Doc, listener: () => void): () => void {
  const names = namesOf(doc);
  names.observe(listener);
  return () => names.unobserve(listener);
}

/**
 * Ink points live in a Y.Array so a stroke in progress syncs point-by-point
 * instead of resending the whole path on every move.
 */
export function createInkStroke(
  color: string,
  size: number,
  erase: boolean,
  first: [number, number],
): YStroke {
  const stroke = new Y.Map<unknown>();
  stroke.set("kind", "ink");
  stroke.set("color", color);
  stroke.set("size", size);
  stroke.set("erase", erase);
  const points = new Y.Array<number>();
  points.push([first[0], first[1]]);
  stroke.set("points", points);
  return stroke;
}

export function appendInkPoints(stroke: YStroke, coords: number[]): void {
  const points = stroke.get("points") as Y.Array<number> | undefined;
  points?.push(coords);
}

export function createShapeStroke(shape: ShapeStroke): YStroke {
  const stroke = new Y.Map<unknown>();
  stroke.set("kind", "shape");
  stroke.set("shape", shape.shape);
  stroke.set("x0", shape.x0);
  stroke.set("y0", shape.y0);
  stroke.set("x1", shape.x1);
  stroke.set("y1", shape.y1);
  stroke.set("color", shape.color);
  stroke.set("size", shape.size);
  return stroke;
}

export function readStrokes(doc: Y.Doc): Stroke[] {
  return strokesOf(doc)
    .toArray()
    .map((stroke) => {
      if (stroke.get("kind") === "shape") {
        return {
          kind: "shape",
          shape: stroke.get("shape") as ShapeId,
          x0: stroke.get("x0") as number,
          y0: stroke.get("y0") as number,
          x1: stroke.get("x1") as number,
          y1: stroke.get("y1") as number,
          color: stroke.get("color") as string,
          size: stroke.get("size") as number,
        } satisfies ShapeStroke;
      }
      const points = stroke.get("points") as Y.Array<number> | undefined;
      return {
        kind: "ink",
        color: stroke.get("color") as string,
        size: stroke.get("size") as number,
        erase: Boolean(stroke.get("erase")),
        points: points ? points.toArray() : [],
      } satisfies InkStroke;
    });
}

export function readElements(doc: Y.Doc): BoardElement[] {
  const out: BoardElement[] = [];
  for (const [id, element] of elementsOf(doc).entries()) {
    const base = {
      id,
      x: element.get("x") as number,
      y: element.get("y") as number,
      w: element.get("w") as number,
      z: (element.get("z") as number | undefined) ?? 0,
      author: (element.get("author") as number | undefined) ?? 0,
    };
    if (element.get("type") === "image") {
      out.push({
        ...base,
        type: "image",
        src: element.get("src") as string,
        ratio: (element.get("ratio") as number | undefined) ?? 1.4,
      });
    } else {
      const body = element.get("body") as Y.Text | undefined;
      out.push({
        ...base,
        type: "text",
        color: (element.get("color") as string | undefined) ?? "#1c1b19",
        text: body ? body.toString() : "",
      });
    }
  }
  return out.sort((a, b) => a.z - b.z);
}

function nextZ(doc: Y.Doc): number {
  const counter = counterOf(doc);
  const z = (counter.get("z") ?? 0) + 1;
  counter.set("z", z);
  return z;
}

export function addTextElement(
  doc: Y.Doc,
  author: number,
  color: string,
  x: number,
  y: number,
): string {
  const id = crypto.randomUUID();
  doc.transact(() => {
    const element = new Y.Map<unknown>();
    element.set("type", "text");
    element.set("x", x - 6);
    element.set("y", y - 16);
    element.set("w", 240);
    element.set("author", author);
    element.set("z", nextZ(doc));
    element.set("color", color);
    element.set("body", new Y.Text());
    elementsOf(doc).set(id, element);
  }, LOCAL_ORIGIN);
  return id;
}

export function addImageElement(
  doc: Y.Doc,
  author: number,
  x: number,
  y: number,
  src: string,
  ratio: number,
): string {
  const id = crypto.randomUUID();
  doc.transact(() => {
    const element = new Y.Map<unknown>();
    element.set("type", "image");
    element.set("x", x);
    element.set("y", y);
    element.set("w", 280);
    element.set("author", author);
    element.set("z", nextZ(doc));
    element.set("src", src);
    element.set("ratio", ratio);
    elementsOf(doc).set(id, element);
  }, LOCAL_ORIGIN);
  return id;
}

export function updateElement(
  doc: Y.Doc,
  id: string,
  patch: Partial<Record<"x" | "y" | "w", number>>,
): void {
  const element = elementsOf(doc).get(id);
  if (!element) return;
  doc.transact(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) element.set(key, value);
    }
  }, LOCAL_ORIGIN);
}

export function textBodyOf(doc: Y.Doc, id: string): Y.Text | null {
  const element = elementsOf(doc).get(id);
  if (!element) return null;
  if (element.get("type") !== "text") return null;
  return (element.get("body") as Y.Text | undefined) ?? null;
}

/** Drops text boxes that were placed but never typed into, so a stray click leaves nothing behind. */
export function pruneEmptyText(doc: Y.Doc, id: string): void {
  const body = textBodyOf(doc, id);
  if (body && body.length === 0) {
    doc.transact(() => elementsOf(doc).delete(id), LOCAL_ORIGIN);
  }
}

export function clearBoard(doc: Y.Doc): void {
  doc.transact(() => {
    const strokes = strokesOf(doc);
    strokes.delete(0, strokes.length);
    const elements = elementsOf(doc);
    for (const id of [...elements.keys()]) elements.delete(id);
  }, LOCAL_ORIGIN);
}

export function isBoardEmpty(doc: Y.Doc): boolean {
  return strokesOf(doc).length === 0 && elementsOf(doc).size === 0;
}
