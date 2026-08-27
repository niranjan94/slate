import {
  type DataPayload,
  joinRoom,
  type MessageAction,
  type Room,
} from "trystero";
import type * as awarenessProtocol from "y-protocols/awareness";
import { removeAwarenessStates } from "y-protocols/awareness";
import type * as Y from "yjs";
import { turnServers } from "./ice";
import { PEER_NAMESPACE } from "./room";
import {
  applyMessage,
  encodeAwareness,
  encodeSyncStep1,
  encodeUpdate,
  toBytes,
} from "./y-channel";

/** Yjs sync and awareness share one action; `y-channel` tags which is which. */
const SYNC_ACTION = "y";

export type LinkStatus =
  | "connecting"
  | "waiting"
  | "connected"
  | "reconnecting"
  | "error";

type AwarenessChanges = {
  added: number[];
  updated: number[];
  removed: number[];
};

/**
 * Connects everyone on a board over WebRTC data channels and pipes the Yjs sync
 * and awareness protocols across them.
 *
 * Trystero matches peers through the Nostr relay network, so there is no broker
 * to claim an id on and no seat limit. Peers form a full mesh, which is why
 * nothing arriving from one peer is ever relayed on to the others.
 */
export class PeerLink {
  private room: Room | null = null;
  private sync: MessageAction<DataPayload> | null = null;
  /** Which Yjs clients sit behind which peer, so a departure retires only theirs. */
  private clientsByPeer = new Map<string, Set<number>>();
  private everConnected = false;
  private disposed = false;
  private status: LinkStatus = "connecting";

  constructor(
    private readonly code: string,
    private readonly doc: Y.Doc,
    private readonly awareness: awarenessProtocol.Awareness,
    private readonly onStatus: (status: LinkStatus) => void,
  ) {}

  start(): void {
    if (this.disposed || this.room) return;

    const room = joinRoom(
      { appId: PEER_NAMESPACE, turnConfig: turnServers() },
      this.code,
      {
        // Fires per failed handshake as well as per failed join, so it only
        // means the board is unreachable while nobody else is on it.
        onJoinError: () => {
          if (this.disposed || this.clientsByPeer.size > 0) return;
          this.setStatus(this.everConnected ? "reconnecting" : "error");
        },
      },
    );
    this.room = room;
    this.sync = room.makeAction<DataPayload>(SYNC_ACTION);
    this.sync.onMessage = (data, { peerId }) => this.receive(peerId, data);

    room.onPeerJoin = (peerId) => {
      if (this.disposed) return;
      this.clientsByPeer.set(peerId, new Set());
      this.everConnected = true;
      this.setStatus("connected");
      // A peer that just arrived knows nothing of this board, so the sync
      // exchange and this tab's presence both start from here.
      this.sendTo(peerId, encodeSyncStep1(this.doc));
      this.sendTo(peerId, encodeAwareness(this.awareness, [this.doc.clientID]));
    };

    room.onPeerLeave = (peerId) => {
      if (this.disposed) return;
      this.dropAwarenessOf(peerId);
      if (this.clientsByPeer.size === 0) this.setStatus(this.idleStatus());
    };

    this.doc.on("update", this.handleDocUpdate);
    this.awareness.on("update", this.handleAwarenessUpdate);
    this.setStatus(this.idleStatus());
  }

  destroy(): void {
    this.disposed = true;
    this.doc.off("update", this.handleDocUpdate);
    this.awareness.off("update", this.handleAwarenessUpdate);
    for (const peerId of [...this.clientsByPeer.keys()]) {
      this.dropAwarenessOf(peerId);
    }
    const room = this.room;
    this.room = null;
    this.sync = null;
    void room?.leave();
  }

  private setStatus(status: LinkStatus): void {
    if (this.disposed || this.status === status) return;
    this.status = status;
    this.onStatus(status);
  }

  private idleStatus(): LinkStatus {
    return this.everConnected ? "reconnecting" : "waiting";
  }

  private sendTo(peerId: string, bytes: Uint8Array): void {
    void this.sync?.send(bytes, { target: peerId })?.catch(() => {
      // A channel that dies mid-send surfaces through onPeerLeave.
    });
  }

  private broadcast(bytes: Uint8Array): void {
    if (this.clientsByPeer.size === 0) return;
    void this.sync?.send(bytes)?.catch(() => {
      // As above: a dead channel is reported by the room, not by the send.
    });
  }

  private dropAwarenessOf(peerId: string): void {
    const clients = this.clientsByPeer.get(peerId);
    this.clientsByPeer.delete(peerId);
    if (clients && clients.size > 0) {
      removeAwarenessStates(this.awareness, [...clients], "link");
    }
  }

  private handleDocUpdate = (update: Uint8Array, origin: unknown): void => {
    // The mesh already carries a peer's update to everyone else directly, so
    // passing it along would only loop it back.
    if (typeof origin === "string" && this.clientsByPeer.has(origin)) return;
    this.broadcast(encodeUpdate(update));
  };

  private handleAwarenessUpdate = (
    changes: AwarenessChanges,
    origin: unknown,
  ): void => {
    const known =
      typeof origin === "string" ? this.clientsByPeer.get(origin) : undefined;
    if (known) {
      for (const client of [...changes.added, ...changes.updated]) {
        known.add(client);
      }
      return;
    }
    // Only this tab's own presence is broadcast; see handleDocUpdate.
    if (origin !== "local") return;
    this.broadcast(
      encodeAwareness(this.awareness, [
        ...changes.added,
        ...changes.updated,
        ...changes.removed,
      ]),
    );
  };

  private receive(peerId: string, data: unknown): void {
    const bytes = toBytes(data);
    if (!bytes) return;
    applyMessage(bytes, this.doc, this.awareness, peerId, (reply) =>
      this.sendTo(peerId, reply),
    );
  }
}
