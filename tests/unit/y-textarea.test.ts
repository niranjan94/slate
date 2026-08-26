// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { applyTextEdit, autosize, reconcileTextarea } from "@/lib/y-textarea";

const LOCAL = Symbol("local");

let doc: Y.Doc;
let body: Y.Text;

beforeEach(() => {
  doc = new Y.Doc();
  body = doc.getText("body");
});

/** Mirrors two docs onto each other, the way the data channel does once connected. */
function exchange(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

describe("applyTextEdit", () => {
  it("types text into an empty body", () => {
    applyTextEdit(body, "hello", LOCAL);

    expect(body.toString()).toBe("hello");
  });

  it("appends without rewriting what is already there", () => {
    applyTextEdit(body, "hello", LOCAL);
    applyTextEdit(body, "hello world", LOCAL);

    expect(body.toString()).toBe("hello world");
  });

  it("inserts at the front", () => {
    applyTextEdit(body, "world", LOCAL);
    applyTextEdit(body, "hello world", LOCAL);

    expect(body.toString()).toBe("hello world");
  });

  it("deletes from the middle", () => {
    applyTextEdit(body, "hello cruel world", LOCAL);
    applyTextEdit(body, "hello world", LOCAL);

    expect(body.toString()).toBe("hello world");
  });

  it("replaces a span", () => {
    applyTextEdit(body, "hello world", LOCAL);
    applyTextEdit(body, "hello there", LOCAL);

    expect(body.toString()).toBe("hello there");
  });

  it("clears the body", () => {
    applyTextEdit(body, "hello", LOCAL);
    applyTextEdit(body, "", LOCAL);

    expect(body.toString()).toBe("");
  });

  it("does nothing when the value has not moved", () => {
    applyTextEdit(body, "steady", LOCAL);
    let updates = 0;
    doc.on("update", () => {
      updates += 1;
    });

    applyTextEdit(body, "steady", LOCAL);

    expect(updates).toBe(0);
  });

  it("tags the edit with the caller's origin", () => {
    const origins: unknown[] = [];
    doc.on("update", (_update: Uint8Array, origin: unknown) =>
      origins.push(origin),
    );

    applyTextEdit(body, "tagged", LOCAL);

    expect(origins).toEqual([LOCAL]);
  });

  it("touches only the characters that changed", () => {
    applyTextEdit(body, "hello world", LOCAL);
    const deltas: unknown[] = [];
    body.observe((event) => deltas.push(event.delta));

    applyTextEdit(body, "hello brave world", LOCAL);

    expect(deltas).toEqual([[{ retain: 6 }, { insert: "brave " }]]);
  });
});

describe("concurrent typing", () => {
  it("keeps both edits when two people type in different places", () => {
    const other = new Y.Doc();
    applyTextEdit(body, "hello world", LOCAL);
    exchange(doc, other);

    applyTextEdit(body, "hello brave world", LOCAL);
    applyTextEdit(other.getText("body"), "well hello world", LOCAL);
    exchange(doc, other);

    const merged = body.toString();
    expect(merged).toBe(other.getText("body").toString());
    expect(merged).toContain("brave");
    expect(merged).toContain("well");
  });

  it("keeps the peer's insert when one side appends", () => {
    const other = new Y.Doc();
    applyTextEdit(body, "shared", LOCAL);
    exchange(doc, other);

    applyTextEdit(body, "shared note", LOCAL);
    applyTextEdit(other.getText("body"), "a shared", LOCAL);
    exchange(doc, other);

    expect(body.toString()).toBe(other.getText("body").toString());
    expect(body.toString()).toBe("a shared note");
  });

  it("converges when both sides delete overlapping text", () => {
    const other = new Y.Doc();
    applyTextEdit(body, "one two three", LOCAL);
    exchange(doc, other);

    applyTextEdit(body, "one three", LOCAL);
    applyTextEdit(other.getText("body"), "one two", LOCAL);
    exchange(doc, other);

    expect(body.toString()).toBe(other.getText("body").toString());
  });
});

describe("reconcileTextarea", () => {
  const field = (value: string) => {
    const node = document.createElement("textarea");
    node.value = value;
    document.body.append(node);
    return node;
  };

  it("pushes a remote value in", () => {
    const node = field("old");
    reconcileTextarea(node, "new");

    expect(node.value).toBe("new");
  });

  it("leaves an unchanged field alone", () => {
    const node = field("same");
    node.focus();
    node.setSelectionRange(2, 2);

    reconcileTextarea(node, "same");

    expect(node.selectionStart).toBe(2);
  });

  it("holds the caret still when the peer types after it", () => {
    const node = field("hello");
    node.focus();
    node.setSelectionRange(2, 2);

    reconcileTextarea(node, "hello there");

    expect(node.selectionStart).toBe(2);
  });

  it("pushes the caret along when the peer types before it", () => {
    const node = field("hello");
    node.focus();
    node.setSelectionRange(5, 5);

    reconcileTextarea(node, "oh hello");

    expect(node.selectionStart).toBe(8);
  });

  it("pulls the caret back when the peer deletes before it", () => {
    const node = field("oh hello");
    node.focus();
    node.setSelectionRange(8, 8);

    reconcileTextarea(node, "hello");

    expect(node.selectionStart).toBe(5);
  });

  it("does not reach for the caret in a field nobody is typing in", () => {
    const node = field("hello");
    const setRange = vi.spyOn(node, "setSelectionRange");

    reconcileTextarea(node, "hello world");

    expect(node.value).toBe("hello world");
    expect(setRange).not.toHaveBeenCalled();
  });
});

describe("autosize", () => {
  it("drives height from the scroll height rather than leaving it fixed", () => {
    const node = document.createElement("textarea");
    document.body.append(node);

    autosize(node);

    expect(node.style.height).toMatch(/^\d+px$/);
  });
});
