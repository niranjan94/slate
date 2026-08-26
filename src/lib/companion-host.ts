import Peer, { type DataConnection } from "peerjs";
import {
  ack,
  companionPeerId,
  companionUrl,
  generateCompanionNonce,
  hello,
  MAX_IMAGE_SRC_LENGTH,
  parseCompanionMessage,
  readCompanionNonce,
  storeCompanionNonce,
} from "./companion";
import { peerConfig } from "./ice";
import type { ImportedImage } from "./image-import";

/**
 * A peer this tab itself just destroyed can hold its id on the broker for a moment, so
 * the first collision is retried rather than treated as another tab owning the nonce.
 * Waiting costs a beat of "opening"; guessing wrong invalidates a QR already scanned.
 */
const ID_GRACE_MS = 900;
/** Enough to outlive a phone retransmitting after an ack that never arrived. */
const SEEN_LIMIT = 32;

export type CompanionStatus =
  | "off"
  | "opening"
  | "listening"
  | "linked"
  | "error";

export type CompanionState = {
  status: CompanionStatus;
  nonce: string;
  url: string;
  phones: number;
};

export type CompanionSink = {
  onState: (state: CompanionState) => void;
  onImage: (image: ImportedImage) => void;
};

type Timer = ReturnType<typeof setTimeout>;

/**
 * Accepts photos from phones paired to this tab and hands them to the board.
 *
 * The phone is not a room member: it dials a nonce addressed peer that exists
 * alongside the room slot, so `PeerLink` and the two seat limit are untouched. Several
 * phones may be connected at once, since one phone reconnecting looks the same.
 */
export class CompanionHost {
  private peer: Peer | null = null;
  private conns = new Set<DataConnection>();
  private sinks = new Set<CompanionSink>();
  private timers = new Set<Timer>();
  private seen: string[] = [];
  private nonce = "";
  private status: CompanionStatus = "off";
  private name = "";
  private disposed = false;

  constructor(private readonly code: string) {}

  /** Opens the companion peer once. Safe to call from a click on every panel open. */
  start(): void {
    if (this.disposed || this.peer) return;
    this.claim(readCompanionNonce(this.code) ?? generateCompanionNonce(), true);
  }

  /** Retires the current link: every paired phone is dropped and the QR is repainted. */
  revoke(): void {
    if (this.disposed) return;
    this.dropConnections();
    this.teardownPeer();
    this.seen = [];
    this.claim(generateCompanionNonce(), true);
  }

  attach(sink: CompanionSink): () => void {
    this.sinks.add(sink);
    sink.onState(this.state());
    return () => {
      this.sinks.delete(sink);
    };
  }

  setName(name: string): void {
    this.name = name;
  }

  destroy(): void {
    this.disposed = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.sinks.clear();
    this.dropConnections();
    this.teardownPeer();
  }

  private state(): CompanionState {
    return {
      status: this.status,
      nonce: this.nonce,
      url: this.nonce ? companionUrl(this.nonce) : "",
      phones: this.conns.size,
    };
  }

  private publish(): void {
    if (this.disposed) return;
    const state = this.state();
    for (const sink of this.sinks) sink.onState(state);
  }

  private setStatus(status: CompanionStatus): void {
    if (this.disposed || this.status === status) return;
    this.status = status;
    this.publish();
  }

  private later(fn: () => void, ms: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.disposed) fn();
    }, ms);
    this.timers.add(timer);
  }

  private teardownPeer(): void {
    const peer = this.peer;
    this.peer = null;
    peer?.destroy();
  }

  private dropConnections(): void {
    for (const conn of this.conns) conn.close();
    this.conns.clear();
  }

  private claim(nonce: string, graceRetry: boolean): void {
    if (this.disposed) return;
    this.setStatus("opening");

    const peer = new Peer(companionPeerId(nonce), {
      debug: 0,
      config: peerConfig(),
    });
    this.peer = peer;

    peer.on("open", () => {
      if (this.disposed || this.peer !== peer) {
        peer.destroy();
        return;
      }
      // Only a nonce this tab actually holds is remembered, so a tab that lost the
      // race cannot leave the winner's stored nonce pointing at a taken id.
      this.nonce = nonce;
      storeCompanionNonce(this.code, nonce);
      this.status = "listening";
      this.publish();
    });

    peer.on("connection", (conn) => this.adopt(conn));

    peer.on("disconnected", () => {
      if (this.disposed || this.peer !== peer || peer.destroyed) return;
      try {
        peer.reconnect();
      } catch {
        this.later(() => this.restart(), 2000);
      }
    });

    peer.on("error", (error) => {
      if (this.disposed || this.peer !== peer) return;
      this.handlePeerError(peer, nonce, graceRetry, error.type);
    });
  }

  private handlePeerError(
    peer: Peer,
    nonce: string,
    graceRetry: boolean,
    type: string,
  ): void {
    if (type === "unavailable-id") {
      this.peer = null;
      peer.destroy();
      if (graceRetry) this.later(() => this.claim(nonce, false), ID_GRACE_MS);
      else this.claim(generateCompanionNonce(), true);
      return;
    }

    if (type === "browser-incompatible") {
      this.setStatus("error");
      return;
    }

    this.setStatus("error");
    this.later(() => this.restart(), 2500);
  }

  private restart(): void {
    if (this.disposed) return;
    this.dropConnections();
    this.teardownPeer();
    this.claim(this.nonce || generateCompanionNonce(), true);
  }

  private adopt(conn: DataConnection): void {
    if (this.disposed) {
      conn.close();
      return;
    }
    this.conns.add(conn);

    conn.on("open", () => {
      if (this.disposed || !this.conns.has(conn)) return;
      this.send(conn, hello(this.code, this.name));
      this.status = "linked";
      this.publish();
    });

    conn.on("data", (data) => {
      if (this.conns.has(conn)) this.receive(conn, data);
    });

    conn.on("close", () => this.forget(conn));
    conn.on("error", () => this.forget(conn));
  }

  private forget(conn: DataConnection): void {
    if (!this.conns.delete(conn)) return;
    if (this.disposed) return;
    this.status = this.conns.size > 0 ? "linked" : "listening";
    this.publish();
  }

  private send(conn: DataConnection, message: unknown): void {
    if (!conn.open) return;
    try {
      conn.send(message);
    } catch {
      // A channel that dies mid-send surfaces through the close handler.
    }
  }

  private remember(id: string): void {
    this.seen.push(id);
    if (this.seen.length > SEEN_LIMIT) this.seen.shift();
  }

  private receive(conn: DataConnection, data: unknown): void {
    const message = parseCompanionMessage(data);
    if (message?.kind !== "image") return;

    if (message.src.length > MAX_IMAGE_SRC_LENGTH) {
      this.send(conn, ack(message.id, false, "too-large"));
      return;
    }
    // A phone that lost an ack sends again, and the photo is already on the board.
    if (this.seen.includes(message.id)) {
      this.send(conn, ack(message.id, true));
      return;
    }
    if (this.sinks.size === 0) {
      this.send(conn, ack(message.id, false, "no-board"));
      return;
    }

    this.remember(message.id);
    for (const sink of this.sinks) {
      sink.onImage({ src: message.src, ratio: message.ratio });
    }
    this.send(conn, ack(message.id, true));
  }
}

const hosts = new Map<string, CompanionHost>();

/**
 * One host per board per tab, held at module scope on purpose. Strict mode double
 * invokes effects and Fast Refresh remounts the board, and a second peer on the same
 * id is indistinguishable on the broker from a second tab, which would rotate a nonce
 * somebody has already scanned.
 */
export function companionHostFor(code: string): CompanionHost {
  const existing = hosts.get(code);
  if (existing) return existing;
  // Navigating between boards must not leave the previous nonce registered.
  for (const [other, host] of hosts) {
    host.destroy();
    hosts.delete(other);
  }
  const host = new CompanionHost(code);
  hosts.set(code, host);
  return host;
}
