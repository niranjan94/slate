import Peer, { type DataConnection } from "peerjs";
import type * as awarenessProtocol from "y-protocols/awareness";
import { removeAwarenessStates } from "y-protocols/awareness";
import type * as Y from "yjs";
import { peerSlotId, type Slot } from "./room";
import {
  applyMessage,
  encodeAwareness,
  encodeSyncStep1,
  encodeUpdate,
  toBytes,
} from "./y-channel";

/** A tab that just closed can hold its broker id briefly; retry once before assuming the slot is taken. */
const SLOT_GRACE_MS = 700;
/** A full board can also be a pair of stale registrations, so keep re-checking rather than dead-ending. */
const FULL_RETRY_MS = 4000;
const DIAL_ATTEMPTS_BEFORE_TAKEOVER = 4;

export type LinkStatus =
  | "connecting"
  | "waiting"
  | "connected"
  | "reconnecting"
  | "full"
  | "error";

type Timer = ReturnType<typeof setTimeout>;

/**
 * Connects two tabs over a WebRTC data channel and pipes the Yjs sync and
 * awareness protocols across it.
 *
 * Both sides race for slot `a` on the PeerJS broker. The loser takes slot `b`
 * and dials `a`, so join order does not matter. If `a` stops answering, the
 * holder of `b` releases its own slot and claims `a`, which lets the surviving
 * tab keep the room reachable for whoever arrives next.
 */
export class PeerLink {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private slot: Slot | null = null;
  private dialAttempts = 0;
  private everConnected = false;
  private disposed = false;
  private timers = new Set<Timer>();
  private status: LinkStatus = "connecting";

  constructor(
    private readonly code: string,
    private readonly doc: Y.Doc,
    private readonly awareness: awarenessProtocol.Awareness,
    private readonly onStatus: (status: LinkStatus) => void,
  ) {}

  start(): void {
    this.doc.on("update", this.handleDocUpdate);
    this.awareness.on("update", this.handleAwarenessUpdate);
    this.claim("a", true);
  }

  destroy(): void {
    this.disposed = true;
    this.doc.off("update", this.handleDocUpdate);
    this.awareness.off("update", this.handleAwarenessUpdate);
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.dropRemoteAwareness();
    this.conn?.close();
    this.conn = null;
    this.teardownPeer();
  }

  private later(fn: () => void, ms: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.disposed) fn();
    }, ms);
    this.timers.add(timer);
  }

  private setStatus(status: LinkStatus): void {
    if (this.disposed || this.status === status) return;
    this.status = status;
    this.onStatus(status);
  }

  private idleStatus(): LinkStatus {
    return this.everConnected ? "reconnecting" : "waiting";
  }

  private teardownPeer(): void {
    const peer = this.peer;
    this.peer = null;
    this.slot = null;
    peer?.destroy();
  }

  private claim(slot: Slot, graceRetry: boolean): void {
    if (this.disposed) return;
    this.setStatus(this.everConnected ? "reconnecting" : "connecting");

    const peer = new Peer(peerSlotId(this.code, slot), { debug: 0 });
    this.peer = peer;

    peer.on("open", () => {
      if (this.disposed || this.peer !== peer) {
        peer.destroy();
        return;
      }
      this.slot = slot;
      this.setStatus(this.idleStatus());
      if (slot === "b") this.dial();
    });

    peer.on("connection", (conn) => this.adopt(conn));

    peer.on("disconnected", () => {
      if (this.disposed || this.peer !== peer || peer.destroyed) return;
      this.setStatus(this.everConnected ? "reconnecting" : "connecting");
      try {
        peer.reconnect();
      } catch {
        this.later(() => this.restart(), 2000);
      }
    });

    peer.on("error", (error) => {
      if (this.disposed || this.peer !== peer) return;
      this.handlePeerError(peer, slot, graceRetry, error.type);
    });
  }

  private handlePeerError(
    peer: Peer,
    slot: Slot,
    graceRetry: boolean,
    type: string,
  ): void {
    if (type === "unavailable-id") {
      this.peer = null;
      peer.destroy();
      if (graceRetry) {
        this.later(() => this.claim(slot, false), SLOT_GRACE_MS);
      } else if (slot === "a") {
        this.claim("b", true);
      } else {
        this.setStatus("full");
        this.later(() => this.restart(), FULL_RETRY_MS);
      }
      return;
    }

    if (type === "peer-unavailable") {
      this.retryDial();
      return;
    }

    if (type === "browser-incompatible") {
      this.setStatus("error");
      return;
    }

    this.setStatus(this.everConnected ? "reconnecting" : "error");
    this.later(() => this.restart(), 2500);
  }

  private restart(): void {
    if (this.disposed) return;
    this.conn?.close();
    this.conn = null;
    this.teardownPeer();
    this.dialAttempts = 0;
    this.claim("a", true);
  }

  private dial(): void {
    if (this.disposed || !this.peer || this.conn) return;
    this.adopt(
      this.peer.connect(peerSlotId(this.code, "a"), { reliable: true }),
    );
  }

  private retryDial(): void {
    if (this.disposed || this.slot !== "b") return;
    this.dialAttempts += 1;
    this.setStatus(this.idleStatus());

    if (this.dialAttempts >= DIAL_ATTEMPTS_BEFORE_TAKEOVER) {
      this.dialAttempts = 0;
      this.teardownPeer();
      this.later(() => this.claim("a", true), 400);
      return;
    }
    this.later(() => this.dial(), 700 * this.dialAttempts);
  }

  private adopt(conn: DataConnection): void {
    if (this.disposed) {
      conn.close();
      return;
    }
    // Boards hold two. A third arrival is turned away rather than silently ignored.
    if (this.conn && this.conn !== conn && this.conn.open) {
      conn.close();
      return;
    }
    this.conn = conn;

    conn.on("open", () => {
      if (this.disposed || this.conn !== conn) return;
      this.dialAttempts = 0;
      this.everConnected = true;
      this.setStatus("connected");
      this.send(conn, encodeSyncStep1(this.doc));
      this.sendAwareness([this.doc.clientID]);
    });

    conn.on("data", (data) => {
      if (this.conn === conn) this.receive(conn, data);
    });

    conn.on("close", () => this.handleConnClosed(conn));
    conn.on("error", () => this.handleConnClosed(conn));
  }

  private handleConnClosed(conn: DataConnection): void {
    if (this.conn !== conn) return;
    this.conn = null;
    this.dropRemoteAwareness();
    if (this.disposed) return;
    this.setStatus("reconnecting");
    if (this.slot === "b") this.retryDial();
  }

  private dropRemoteAwareness(): void {
    const remote = [...this.awareness.getStates().keys()].filter(
      (id) => id !== this.doc.clientID,
    );
    if (remote.length > 0) {
      removeAwarenessStates(this.awareness, remote, "link");
    }
  }

  private send(conn: DataConnection, bytes: Uint8Array): void {
    if (!conn.open) return;
    try {
      conn.send(bytes);
    } catch {
      // A channel that dies mid-send surfaces through the close handler.
    }
  }

  private sendAwareness(clients: number[]): void {
    const conn = this.conn;
    if (conn) this.send(conn, encodeAwareness(this.awareness, clients));
  }

  private handleDocUpdate = (update: Uint8Array, origin: unknown): void => {
    const conn = this.conn;
    // Never bounce a change straight back to the peer that just sent it.
    if (!conn || origin === conn) return;
    this.send(conn, encodeUpdate(update));
  };

  private handleAwarenessUpdate = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin === "link") return;
    this.sendAwareness([
      ...changes.added,
      ...changes.updated,
      ...changes.removed,
    ]);
  };

  private receive(conn: DataConnection, data: unknown): void {
    const bytes = toBytes(data);
    if (!bytes) return;
    applyMessage(bytes, this.doc, this.awareness, conn, (reply) =>
      this.send(conn, reply),
    );
  }
}
