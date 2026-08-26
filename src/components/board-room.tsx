"use client";

import { useBoardRoom } from "@/lib/use-board-room";
import { Board } from "./board";

export function BoardRoomView({ code }: { code: string }) {
  const { room, status, peers } = useBoardRoom(code);

  if (!room) {
    return (
      <div
        className="fixed inset-0 bg-paper"
        style={{
          backgroundImage:
            "radial-gradient(rgb(28 27 25 / 0.13) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
    );
  }

  return <Board code={code} room={room} status={status} peers={peers} />;
}
