"use client";

import Link from "next/link";
import type { LinkStatus } from "@/lib/peer-link";
import { NameInput } from "./name-field";

type RoomGateProps = {
  status: LinkStatus;
  code: string;
  localName: string;
  onRename: (name: string) => string;
  onCopy: () => void;
  onDismiss: () => void;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-paper/70 p-6 pt-[calc(24px+var(--safe-t))] pb-[calc(24px+var(--safe-b))] backdrop-blur-[2px]">
      <div className="my-auto w-full max-w-[430px] shrink-0 rounded-[18px] border border-line bg-panel px-[30px] pt-[30px] pb-[26px] shadow-card">
        <div className="flex items-baseline gap-[9px]">
          <span className="text-[25px] font-semibold tracking-[-0.02em]">
            slate
          </span>
          <span className="pb-0.5 text-[10.5px] font-medium tracking-[0.09em] text-ink-faint uppercase">
            open source
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

export function RoomGate({
  status,
  code,
  localName,
  onRename,
  onCopy,
  onDismiss,
}: RoomGateProps) {
  if (status === "full") {
    return (
      <Shell>
        <p className="mt-2.5 mb-6 max-w-[34ch] text-[14.5px] leading-[1.55] text-ink-muted text-pretty">
          Board <span className="font-medium text-ink">{code}</span> is already
          full.
        </p>
        <Link
          href="/"
          className="flex w-full items-center justify-center rounded-xl bg-ink px-[18px] py-[15px] text-[15px] font-medium text-ink-invert transition hover:bg-black"
        >
          Start your own board
        </Link>
      </Shell>
    );
  }

  if (status === "error") {
    return (
      <Shell>
        <p className="mt-2.5 mb-6 max-w-[34ch] text-[14.5px] leading-[1.55] text-ink-muted text-pretty">
          We could not connect you just now. Your board is safe on this device,
          so you can keep drawing and share it later.
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="flex w-full cursor-pointer items-center justify-center rounded-xl bg-ink px-[18px] py-[15px] text-[15px] font-medium text-ink-invert transition hover:bg-black"
        >
          Draw on your own
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="mt-2.5 mb-[22px] max-w-[34ch] text-[14.5px] leading-[1.55] text-ink-muted text-pretty">
        Share the link below and you will be drawing on this board together,
        live.
      </p>

      <NameInput name={localName} onRename={onRename} />

      <div className="mb-4 flex items-center gap-2.5">
        <div className="relative size-[9px]">
          <div className="absolute inset-0 rounded-full bg-accent" />
          <div className="absolute inset-0 animate-pulse-ring rounded-full bg-accent" />
        </div>
        <span className="text-sm text-ink-muted">
          {status === "connecting"
            ? "Setting up your board…"
            : "Waiting for the other person…"}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3.5 rounded-xl border border-line-strong border-dashed bg-field px-[18px] py-4">
        <div>
          <div className="mb-[5px] text-[10.5px] font-medium tracking-[0.1em] text-ink-ghost uppercase">
            Board code
          </div>
          <div className="text-2xl font-medium tracking-[0.14em]">{code}</div>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="cursor-pointer rounded-[10px] border border-line-strong bg-white px-[15px] py-[11px] text-[13.5px] font-medium whitespace-nowrap transition-colors hover:bg-active"
        >
          Copy link
        </button>
      </div>

      <p className="mt-4 text-[13px] text-ink-faint">
        Send the link or the code to whoever you want on the board.
      </p>

      <button
        type="button"
        onClick={onDismiss}
        className="mt-5 w-full cursor-pointer rounded-xl border border-line-strong bg-white px-[18px] py-3 text-[14.5px] font-medium transition-colors hover:bg-hover"
      >
        Start drawing
      </button>
    </Shell>
  );
}
