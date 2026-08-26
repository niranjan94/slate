import { describe, expect, it, vi } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import {
  applyMessage,
  encodeAwareness,
  encodeSyncStep1,
  encodeUpdate,
  toBytes,
} from "@/lib/y-channel";

const REMOTE = Symbol("remote");

type Peer = {
  doc: Y.Doc;
  awareness: Awareness;
  inbox: Uint8Array[];
};

function peer(): Peer {
  const doc = new Y.Doc();
  return { doc, awareness: new Awareness(doc), inbox: [] };
}

/** Wires two peers so an update on either is delivered to the other, as the data channel would. */
function link(a: Peer, b: Peer) {
  a.doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin !== REMOTE) b.inbox.push(encodeUpdate(update));
  });
  b.doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin !== REMOTE) a.inbox.push(encodeUpdate(update));
  });
}

/** Drains both inboxes until the pair goes quiet, so replies get delivered too. */
function settle(a: Peer, b: Peer) {
  for (let pass = 0; pass < 20; pass += 1) {
    const pending = [...a.inbox, ...b.inbox].length;
    if (pending === 0) return;

    const forA = a.inbox.splice(0);
    const forB = b.inbox.splice(0);
    for (const bytes of forA) {
      applyMessage(bytes, a.doc, a.awareness, REMOTE, (reply) =>
        b.inbox.push(reply),
      );
    }
    for (const bytes of forB) {
      applyMessage(bytes, b.doc, b.awareness, REMOTE, (reply) =>
        a.inbox.push(reply),
      );
    }
  }
  throw new Error("peers never went quiet");
}

function handshake(a: Peer, b: Peer) {
  a.inbox.push(encodeSyncStep1(b.doc));
  b.inbox.push(encodeSyncStep1(a.doc));
  settle(a, b);
}

describe("toBytes", () => {
  it("passes a Uint8Array straight through", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(toBytes(bytes)).toBe(bytes);
  });

  it("wraps an ArrayBuffer", () => {
    const buffer = new Uint8Array([4, 5]).buffer;
    expect(toBytes(buffer)).toEqual(new Uint8Array([4, 5]));
  });

  it("respects the window of a view rather than the whole buffer", () => {
    const backing = new Uint8Array([9, 8, 7, 6]);
    const view = new DataView(backing.buffer, 1, 2);
    expect(toBytes(view)).toEqual(new Uint8Array([8, 7]));
  });

  it("rejects anything that is not binary", () => {
    expect(toBytes("hello")).toBeNull();
    expect(toBytes(null)).toBeNull();
    expect(toBytes({ length: 3 })).toBeNull();
  });
});

describe("document sync", () => {
  it("brings an empty peer up to date on handshake", () => {
    const a = peer();
    const b = peer();
    a.doc.getArray<string>("strokes").push(["one", "two"]);

    link(a, b);
    handshake(a, b);

    expect(b.doc.getArray<string>("strokes").toArray()).toEqual(["one", "two"]);
  });

  it("propagates an edit made after the handshake", () => {
    const a = peer();
    const b = peer();
    link(a, b);
    handshake(a, b);

    a.doc.getArray<string>("strokes").push(["late"]);
    settle(a, b);

    expect(b.doc.getArray<string>("strokes").toArray()).toEqual(["late"]);
  });

  it("merges simultaneous edits instead of dropping one side", () => {
    const a = peer();
    const b = peer();
    link(a, b);
    handshake(a, b);

    a.doc.getArray<string>("strokes").push(["from-a"]);
    b.doc.getArray<string>("strokes").push(["from-b"]);
    settle(a, b);

    const onA = a.doc.getArray<string>("strokes").toArray();
    const onB = b.doc.getArray<string>("strokes").toArray();
    expect(onA).toHaveLength(2);
    expect([...onA].sort()).toEqual(["from-a", "from-b"]);
    expect(onA).toEqual(onB);
  });

  it("gives a late joiner everything, not just what happens next", () => {
    const a = peer();
    const b = peer();
    a.doc.getArray<string>("strokes").push(["before-b-existed"]);

    link(a, b);
    handshake(a, b);
    a.doc.getArray<string>("strokes").push(["after"]);
    settle(a, b);

    expect(b.doc.getArray<string>("strokes").toArray()).toEqual([
      "before-b-existed",
      "after",
    ]);
  });

  it("converges on nested structures, so a stroke in progress is not lost", () => {
    const a = peer();
    const b = peer();
    link(a, b);
    handshake(a, b);

    const stroke = new Y.Map<unknown>();
    const points = new Y.Array<number>();
    stroke.set("points", points);
    a.doc.getArray<Y.Map<unknown>>("strokes").push([stroke]);
    settle(a, b);

    points.push([1, 2]);
    points.push([3, 4]);
    settle(a, b);

    const mirrored = b.doc
      .getArray<Y.Map<unknown>>("strokes")
      .get(0)
      .get("points") as Y.Array<number>;
    expect(mirrored.toArray()).toEqual([1, 2, 3, 4]);
  });

  it("tags applied changes with the given origin so echoes can be suppressed", () => {
    const a = peer();
    const b = peer();
    link(a, b);
    handshake(a, b);

    const origins: unknown[] = [];
    b.doc.on("update", (_update: Uint8Array, origin: unknown) =>
      origins.push(origin),
    );

    a.doc.getArray<string>("strokes").push(["x"]);
    settle(a, b);

    expect(origins).toContain(REMOTE);
    expect(origins.every((origin) => origin === REMOTE)).toBe(true);
  });

  it("replies only when it has something to say", () => {
    const a = peer();
    const reply = vi.fn();

    applyMessage(
      encodeUpdate(Y.encodeStateAsUpdate(new Y.Doc())),
      a.doc,
      a.awareness,
      REMOTE,
      reply,
    );

    expect(reply).not.toHaveBeenCalled();
  });

  it("ignores a message type it does not know", () => {
    const a = peer();
    const reply = vi.fn();
    const before = Y.encodeStateAsUpdate(a.doc);

    applyMessage(
      new Uint8Array([99, 1, 2, 3]),
      a.doc,
      a.awareness,
      REMOTE,
      reply,
    );

    expect(reply).not.toHaveBeenCalled();
    expect(Y.encodeStateAsUpdate(a.doc)).toEqual(before);
  });
});

describe("awareness", () => {
  it("carries a peer's presence across", () => {
    const a = peer();
    const b = peer();

    a.awareness.setLocalStateField("user", { name: "Ada" });
    const update = encodeAwareness(a.awareness, [a.doc.clientID]);
    applyMessage(update, b.doc, b.awareness, REMOTE, () => {});

    const seen = b.awareness.getStates().get(a.doc.clientID) as
      | { user?: { name?: string } }
      | undefined;
    expect(seen?.user?.name).toBe("Ada");
  });

  it("carries a rename, not just the first name", () => {
    const a = peer();
    const b = peer();

    a.awareness.setLocalStateField("user", { name: "Ada" });
    applyMessage(
      encodeAwareness(a.awareness, [a.doc.clientID]),
      b.doc,
      b.awareness,
      REMOTE,
      () => {},
    );
    a.awareness.setLocalStateField("user", { name: "Grace" });
    applyMessage(
      encodeAwareness(a.awareness, [a.doc.clientID]),
      b.doc,
      b.awareness,
      REMOTE,
      () => {},
    );

    const seen = b.awareness.getStates().get(a.doc.clientID) as
      | { user?: { name?: string } }
      | undefined;
    expect(seen?.user?.name).toBe("Grace");
  });

  it("keeps cursor and user on separate fields", () => {
    const a = peer();
    const b = peer();

    a.awareness.setLocalStateField("user", { name: "Ada" });
    a.awareness.setLocalStateField("cursor", { x: 10, y: 20 });
    applyMessage(
      encodeAwareness(a.awareness, [a.doc.clientID]),
      b.doc,
      b.awareness,
      REMOTE,
      () => {},
    );

    const seen = b.awareness.getStates().get(a.doc.clientID) as
      | { user?: { name?: string }; cursor?: { x: number } }
      | undefined;
    expect(seen?.user?.name).toBe("Ada");
    expect(seen?.cursor?.x).toBe(10);
  });
});
