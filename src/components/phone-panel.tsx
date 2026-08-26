"use client";

import type { CompanionState } from "@/lib/companion-host";
import { QrCode } from "./qr-code";

type PhonePanelProps = {
  state: CompanionState;
  onCopy: () => void;
  onRevoke: () => void;
  onClose: () => void;
};

function statusLine(state: CompanionState): string {
  if (state.status === "error") return "Could not create a link just now";
  if (!state.url) return "Opening the link…";
  if (state.phones === 1) return "One phone connected";
  if (state.phones > 1) return `${state.phones} phones connected`;
  return "Scan this with your phone";
}

export function PhonePanel({
  state,
  onCopy,
  onRevoke,
  onClose,
}: PhonePanelProps) {
  return (
    <div className="absolute bottom-[118px] left-1/2 w-[268px] -translate-x-1/2 rounded-xl border border-line bg-panel p-[18px] shadow-panel">
      <div className="mb-[3px] text-[10.5px] font-medium tracking-[0.1em] text-ink-ghost uppercase">
        Add from your phone
      </div>
      <p className="mb-3.5 text-[13px] leading-[1.5] text-ink-muted">
        Take a photo on your phone and it appears on this board. Your phone does
        not join the board itself.
      </p>

      <div className="flex justify-center rounded-[10px] border border-line-strong border-dashed p-3">
        {state.url ? (
          <QrCode value={state.url} />
        ) : (
          <div className="flex size-[176px] items-center justify-center text-[13px] text-ink-faint">
            {state.status === "error" ? "No link" : "Opening…"}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="relative size-[9px] shrink-0">
          <div className="absolute inset-0 rounded-full bg-accent" />
          {state.phones > 0 && (
            <div className="absolute inset-0 animate-pulse-ring rounded-full bg-accent" />
          )}
        </div>
        <span className="text-[13px] text-ink-muted">{statusLine(state)}</span>
      </div>

      {state.url && (
        <p className="mt-2.5 break-all text-[11.5px] leading-[1.45] text-ink-ghost select-all">
          {state.url}
        </p>
      )}

      <div className="mt-3.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onCopy}
          disabled={!state.url}
          className="flex-1 cursor-pointer rounded-[10px] border border-line-strong bg-raised px-3 py-[9px] text-[13px] font-medium transition-colors hover:bg-active disabled:cursor-default disabled:text-ink-ghost"
        >
          Copy link
        </button>
        <button
          type="button"
          title="Stop the old link working and make a new one"
          onClick={onRevoke}
          disabled={!state.url}
          className="cursor-pointer rounded-[10px] border border-line-strong bg-raised px-3 py-[9px] text-[13px] font-medium transition-colors hover:bg-active disabled:cursor-default disabled:text-ink-ghost"
        >
          New link
        </button>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-[10px] px-3 py-[9px] text-[13px] font-medium text-ink-soft transition-colors hover:bg-hover"
        >
          Done
        </button>
      </div>
    </div>
  );
}
