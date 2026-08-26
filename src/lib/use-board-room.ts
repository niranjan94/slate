"use client";

import { useCallback, useEffect, useState } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import {
  elementsOf,
  LOCAL_ORIGIN,
  observeNames,
  publishName,
  readNames,
  strokesOf,
} from "./board-doc";
import { type LinkStatus, PeerLink } from "./peer-link";
import {
  displayNameFor,
  readStoredName,
  sanitizeName,
  storeName,
} from "./room";

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
};

export type BoardRoomState = {
  room: BoardRoom | null;
  status: LinkStatus;
  peers: PeerPresence[];
  localName: string;
  rename: (name: string) => string;
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
  const [localName, setLocalName] = useState("");

  useEffect(() => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    const persistence = new IndexeddbPersistence(`slate-board-${code}`, doc);
    const undoManager = new Y.UndoManager([strokesOf(doc), elementsOf(doc)], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: UNDO_CAPTURE_MS,
    });

    const name = readStoredName() || displayNameFor(doc.clientID);
    awareness.setLocalStateField("user", { name });
    publishName(doc, doc.clientID, name);
    setLocalName(name);

    const syncRoster = () => {
      const next = rosterOf(awareness, doc.clientID);
      setPeers((prev) => (sameRoster(prev, next) ? prev : next));
    };
    awareness.on("change", syncRoster);

    const releaseAwareness = () => awareness.setLocalState(null);
    window.addEventListener("beforeunload", releaseAwareness);

    const link = new PeerLink(code, doc, awareness, setStatus);
    link.start();

    setRoom({
      doc,
      awareness,
      undoManager,
      localClientId: doc.clientID,
    });

    return () => {
      window.removeEventListener("beforeunload", releaseAwareness);
      awareness.off("change", syncRoster);
      link.destroy();
      undoManager.destroy();
      awareness.destroy();
      persistence.destroy();
      doc.destroy();
      setRoom(null);
      setPeers([]);
      setStatus("connecting");
    };
  }, [code]);

  /**
   * An empty name is not an error, it just hands the person back a generated
   * one. The applied name is returned because it can differ from what was
   * typed, and the field showing it has to end up agreeing.
   */
  const rename = useCallback(
    (raw: string) => {
      if (!room) return localName;
      const chosen = sanitizeName(raw).trim();
      const next = chosen || displayNameFor(room.localClientId);
      storeName(chosen);
      room.awareness.setLocalStateField("user", { name: next });
      publishName(room.doc, room.localClientId, next);
      setLocalName(next);
      return next;
    },
    [room, localName],
  );

  return { room, status, peers, localName, rename };
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

/** Content outlives presence, so author labels resolve through the doc rather than awareness. */
export function useAuthorNames(doc: Y.Doc): Map<number, string> {
  const [names, setNames] = useState<Map<number, string>>(() => new Map());

  useEffect(() => {
    const sync = () => setNames(readNames(doc));
    sync();
    return observeNames(doc, sync);
  }, [doc]);

  return names;
}
