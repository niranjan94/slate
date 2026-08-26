"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  boardPath,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  ROOM_CODE_LENGTH,
} from "@/lib/room";

export function Lobby() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");

  const create = useCallback(() => {
    router.push(boardPath(generateRoomCode()));
  }, [router]);

  const join = useCallback(() => {
    const code = normalizeRoomCode(joinCode);
    if (!isValidRoomCode(code)) {
      setError(`Board codes are ${ROOM_CODE_LENGTH} characters`);
      return;
    }
    router.push(boardPath(code));
  }, [joinCode, router]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      // Enter on a focused control already fires that control, and starting a
      // board here as well would navigate twice, to two different places.
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "BUTTON" || tag === "INPUT" || tag === "A") return;
      create();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [create]);

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-paper bg-[length:22px_22px] bg-[radial-gradient(rgb(28_27_25_/_0.13)_1px,transparent_1px)] p-6 pt-[calc(24px+var(--safe-t))] pb-[calc(24px+var(--safe-b))]">
      <div className="my-auto w-full max-w-[430px] shrink-0 rounded-[18px] border border-line bg-panel px-[30px] pt-[30px] pb-[26px] shadow-card">
        <div className="flex items-baseline gap-[9px]">
          <span className="text-[25px] font-semibold tracking-[-0.02em]">
            slate
          </span>
          <span className="pb-0.5 text-[10.5px] font-medium tracking-[0.09em] text-ink-faint uppercase">
            open source
          </span>
        </div>

        <p className="mt-2.5 mb-[26px] max-w-[34ch] text-[14.5px] leading-[1.55] text-ink-muted text-pretty">
          Start a board, send the link, and draw on it together. Sketch an idea,
          plan something, explain a thing that is easier drawn than typed.
        </p>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={create}
            className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl bg-ink px-[18px] py-[15px] text-[15px] font-medium text-ink-invert transition hover:-translate-y-px hover:bg-black"
          >
            <span>Start a new board</span>
            <span className="text-xs opacity-55">&#8629;</span>
          </button>

          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-rule" />
            <span className="text-[10.5px] font-medium tracking-[0.1em] text-ink-ghost uppercase">
              or join
            </span>
            <div className="h-px flex-1 bg-rule" />
          </div>

          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(event) => {
                setJoinCode(normalizeRoomCode(event.target.value));
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") join();
              }}
              placeholder="BOARD CODE"
              maxLength={ROOM_CODE_LENGTH}
              aria-label="Board code"
              className="min-w-0 flex-1 rounded-xl border border-line-strong bg-field px-4 py-[14px] text-base font-medium tracking-[0.2em] text-ink uppercase outline-none focus:border-accent focus:bg-white"
            />
            <button
              type="button"
              onClick={join}
              className="cursor-pointer rounded-xl border border-line-strong bg-white px-5 py-[14px] text-[14.5px] font-medium text-ink transition-colors hover:bg-hover"
            >
              Join
            </button>
          </div>
        </div>

        <p className="mt-[18px] h-4 text-[13px] text-peer">{error}</p>

        <p className="text-[11.5px] text-ink-ghost">
          Powered by PeerJS and WebRTC.
        </p>
      </div>
    </div>
  );
}
