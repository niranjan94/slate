"use client";

import type { Awareness } from "y-protocols/awareness";
import type { Viewport } from "@/lib/paint";
import { usePeerCursors } from "@/lib/use-board-room";

type PeerCursorsProps = {
  awareness: Awareness;
  localClientId: number;
  view: Viewport;
};

export function PeerCursors({
  awareness,
  localClientId,
  view,
}: PeerCursorsProps) {
  const peers = usePeerCursors(awareness, localClientId);

  return (
    <>
      {peers.map((peer) =>
        peer.cursor ? (
          <div
            key={peer.clientId}
            className="pointer-events-none absolute top-0 left-0 will-change-transform"
            style={{
              transform: `translate(${peer.cursor.x * view.zoom + view.panX}px, ${
                peer.cursor.y * view.zoom + view.panY
              }px)`,
            }}
          >
            <div className="flex items-center gap-1.5">
              <div className="size-[11px] rounded-full border-2 border-white bg-peer shadow-[0_1px_3px_rgb(0_0_0_/_0.25)]" />
              <div className="rounded-[5px] bg-peer px-[7px] py-[3px] text-[11.5px] font-medium whitespace-nowrap text-white">
                {peer.name}
              </div>
            </div>
          </div>
        ) : null,
      )}
    </>
  );
}
