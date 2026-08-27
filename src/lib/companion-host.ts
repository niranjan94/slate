import { joinRoom, type MessageAction, type Room, selfId } from "trystero";
import {
  ack,
  COMPANION_APP_ID,
  type CompanionMessage,
  companionUrl,
  generateCompanionNonce,
  hello,
  join,
  MAX_IMAGE_SRC_LENGTH,
  parseCompanionMessage,
  readCompanionNonce,
  storeCompanionNonce,
} from "./companion";
import { turnServers } from "./ice";
import type { ImportedImage } from "./image-import";

/** Enough to outlive a phone retransmitting after an ack that never arrived. */
const SEEN_LIMIT = 32;
const MESSAGE_ACTION = "msg";

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

/**
 * Accepts photos from phones paired to this tab and hands them to the board.
 *
 * The phone is not a board member: the nonce is a room of its own, so nothing
 * here touches `PeerLink`. Several phones may be connected at once, since one
 * phone reconnecting looks the same as a second arriving.
 */
export class CompanionHost {
  private room: Room | null = null;
  private messages: MessageAction<CompanionMessage> | null = null;
  private phones = new Set<string>();
  private sinks = new Set<CompanionSink>();
  private seen: string[] = [];
  private nonce = "";
  private status: CompanionStatus = "off";
  private name = "";
  private disposed = false;

  constructor(private readonly code: string) {}

  /** Opens the companion room once. Safe to call from a click on every panel open. */
  start(): void {
    if (this.disposed || this.room) return;
    this.open(readCompanionNonce(this.code) ?? generateCompanionNonce());
  }

  /** Retires the current link: every paired phone is dropped and the QR is repainted. */
  revoke(): void {
    if (this.disposed) return;
    this.seen = [];
    this.rotate();
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
    this.sinks.clear();
    this.phones.clear();
    this.leaveRoom();
  }

  private state(): CompanionState {
    return {
      status: this.status,
      nonce: this.nonce,
      url: this.nonce ? companionUrl(this.nonce) : "",
      phones: this.phones.size,
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

  private leaveRoom(): void {
    const room = this.room;
    this.room = null;
    this.messages = null;
    void room?.leave();
  }

  private open(nonce: string): void {
    if (this.disposed) return;
    this.setStatus("opening");

    const room = joinRoom(
      { appId: COMPANION_APP_ID, turnConfig: turnServers() },
      nonce,
      {
        onJoinError: () => {
          if (this.disposed || this.room !== room) return;
          if (this.phones.size === 0) this.setStatus("error");
        },
      },
    );
    this.room = room;
    this.messages = room.makeAction<CompanionMessage>(MESSAGE_ACTION);
    this.messages.onMessage = (data, { peerId }) => this.receive(peerId, data);

    room.onPeerJoin = (peerId) => {
      if (this.disposed || this.room !== room) return;
      this.send(peerId, join("host", selfId));
    };

    room.onPeerLeave = (peerId) => {
      if (this.disposed || this.room !== room) return;
      if (!this.phones.delete(peerId)) return;
      this.status = this.phones.size > 0 ? "linked" : "listening";
      this.publish();
    };

    this.nonce = nonce;
    storeCompanionNonce(this.code, nonce);
    this.status = "listening";
    this.publish();
  }

  private rotate(): void {
    this.leaveRoom();
    this.phones.clear();
    // Cleared before the new room opens, so the panel stops offering a QR that
    // no longer answers.
    this.nonce = "";
    this.open(generateCompanionNonce());
  }

  /**
   * Two tabs of one board read the same stored nonce, and both would answer a
   * QR that has already been scanned, landing every photo twice. Ids settle it
   * the same way on both sides, and the loser takes a fresh nonce.
   */
  private yieldTo(other: string): void {
    if (this.disposed || selfId <= other) return;
    this.rotate();
  }

  private greet(peerId: string): void {
    if (!this.phones.has(peerId)) {
      this.phones.add(peerId);
      this.status = "linked";
      this.publish();
    }
    this.send(peerId, hello(this.code, this.name));
  }

  private send(peerId: string, message: CompanionMessage): void {
    void this.messages?.send(message, { target: peerId })?.catch(() => {
      // A channel that dies mid-send surfaces through onPeerLeave.
    });
  }

  private remember(id: string): void {
    this.seen.push(id);
    if (this.seen.length > SEEN_LIMIT) this.seen.shift();
  }

  private receive(peerId: string, data: unknown): void {
    const message = parseCompanionMessage(data);
    if (!message) return;

    if (message.kind === "join") {
      if (message.role === "host") this.yieldTo(message.id);
      else this.greet(peerId);
      return;
    }

    if (message.kind !== "image") return;

    if (message.src.length > MAX_IMAGE_SRC_LENGTH) {
      this.send(peerId, ack(message.id, false, "too-large"));
      return;
    }
    // A phone that lost an ack sends again, and the photo is already on the board.
    if (this.seen.includes(message.id)) {
      this.send(peerId, ack(message.id, true));
      return;
    }
    if (this.sinks.size === 0) {
      this.send(peerId, ack(message.id, false, "no-board"));
      return;
    }

    this.remember(message.id);
    for (const sink of this.sinks) {
      sink.onImage({ src: message.src, ratio: message.ratio });
    }
    this.send(peerId, ack(message.id, true));
  }
}

const hosts = new Map<string, CompanionHost>();

/**
 * One host per board per tab, held at module scope on purpose. Strict mode double
 * invokes effects and Fast Refresh remounts the board, and a second host in the
 * same nonce room would hand the tie to one of them and rotate a nonce somebody
 * has already scanned.
 */
export function companionHostFor(code: string): CompanionHost {
  const existing = hosts.get(code);
  if (existing) return existing;
  // Navigating between boards must not leave the previous nonce answering.
  for (const [other, host] of hosts) {
    host.destroy();
    hosts.delete(other);
  }
  const host = new CompanionHost(code);
  hosts.set(code, host);
  return host;
}
