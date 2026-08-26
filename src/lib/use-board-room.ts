"use client";

import { useEffect, useState } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { elementsOf, LOCAL_ORIGIN, strokesOf } from "./board-doc";
import { type LinkStatus, PeerLink } from "./peer-link";
import { displayNameFor } from "./room";

export type PeerCursor = { x: number; y: number };

export type PeerPresence = {
  clientId: number;
  name: string;
  cursor: PeerCursor | null;
};

export type BoardRoom = {
  doc: Y.Doc;
  awareness: Awareness;
  undoManager: Y.UndoManager;
  localClientId: number;
  localName: string;
};

export type BoardRoomState = {
  room: BoardRoom | null;
  status: LinkStatus;
  peers: PeerPresence[];
  hydrated: boolean;
};

/**
 * A single undo step should cover a whole gesture, so the manager captures
 * generously and the board calls `stopCapturing` when a gesture ends.
 */
const UNDO_CAPTURE_MS = 10_000;

function rosterOf(awareness: Awareness, localClientId: number): PeerPresence[] {
  const peers: PeerPresence[] = [];
  for (const [clientId, state] of awareness.getStates()) {
    if (clientId === localClientId) continue;
    const user = (state as { user?: { name?: string } } | undefined)?.user;
    peers.push({
      clientId,
      name: user?.name ?? displayNameFor(clientId),
      cursor: null,
    });
  }
  return peers.sort((a, b) => a.clientId - b.clientId);
}

function sameRoster(a: PeerPresence[], b: PeerPresence[]): boolean {
  return (
    a.length === b.length &&
    a.every((p, i) => p.clientId === b[i].clientId && p.name === b[i].name)
  );
}

export function useBoardRoom(code: string): BoardRoomState {
  const [room, setRoom] = useState<BoardRoom | null>(null);
  const [status, setStatus] = useState<LinkStatus>("connecting");
  const [peers, setPeers] = useState<PeerPresence[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    const persistence = new IndexeddbPersistence(`slate-board-${code}`, doc);
    const undoManager = new Y.UndoManager([strokesOf(doc), elementsOf(doc)], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: UNDO_CAPTURE_MS,
    });
    const localName = displayNameFor(doc.clientID);
    awareness.setLocalStateField("user", { name: localName });

    const syncRoster = () => {
      const next = rosterOf(awareness, doc.clientID);
      setPeers((prev) => (sameRoster(prev, next) ? prev : next));
    };
    awareness.on("change", syncRoster);

    const markHydrated = () => setHydrated(true);
    persistence.on("synced", markHydrated);

    const releaseAwareness = () => awareness.setLocalState(null);
    window.addEventListener("beforeunload", releaseAwareness);

    const link = new PeerLink(code, doc, awareness, setStatus);
    link.start();

    setRoom({
      doc,
      awareness,
      undoManager,
      localClientId: doc.clientID,
      localName,
    });

    return () => {
      window.removeEventListener("beforeunload", releaseAwareness);
      persistence.off("synced", markHydrated);
      awareness.off("change", syncRoster);
      link.destroy();
      undoManager.destroy();
      awareness.destroy();
      persistence.destroy();
      doc.destroy();
      setRoom(null);
      setPeers([]);
      setHydrated(false);
      setStatus("connecting");
    };
  }, [code]);

  return { room, status, peers, hydrated };
}

/**
 * Cursor positions change on every pointer move, so they are subscribed to
 * separately from the roster to keep that churn out of the board tree.
 */
export function usePeerCursors(
  awareness: Awareness,
  localClientId: number,
): PeerPresence[] {
  const [cursors, setCursors] = useState<PeerPresence[]>([]);

  useEffect(() => {
    const sync = () => {
      const next: PeerPresence[] = [];
      for (const [clientId, state] of awareness.getStates()) {
        if (clientId === localClientId) continue;
        const typed = state as
          | { user?: { name?: string }; cursor?: PeerCursor | null }
          | undefined;
        next.push({
          clientId,
          name: typed?.user?.name ?? displayNameFor(clientId),
          cursor: typed?.cursor ?? null,
        });
      }
      setCursors(next);
    };
    sync();
    awareness.on("change", sync);
    return () => awareness.off("change", sync);
  }, [awareness, localClientId]);

  return cursors;
}
