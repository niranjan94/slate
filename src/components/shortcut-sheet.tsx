"use client";

import { SHORTCUT_GROUPS } from "@/lib/shortcuts";

export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-paper/70 p-6 pt-[calc(24px+var(--safe-t))] pb-[calc(24px+var(--safe-b))] backdrop-blur-[2px]">
      <div className="my-auto w-full max-w-[560px] shrink-0 rounded-[18px] border border-line bg-panel px-[30px] pt-[26px] pb-[22px] shadow-card">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <span className="text-[19px] font-semibold tracking-[-0.01em]">
            Keyboard shortcuts
          </span>
          <span className="text-[12px] text-ink-faint">
            ⌘ is Ctrl on Windows and Linux
          </span>
        </div>

        <div className="grid grid-cols-1 gap-x-9 gap-y-5 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-2 text-[10.5px] font-medium tracking-[0.1em] text-ink-ghost uppercase">
                {group.title}
              </div>
              <dl className="flex flex-col gap-[7px]">
                {group.rows.map((row) => (
                  <div
                    key={row.keys}
                    className="flex items-baseline justify-between gap-4"
                  >
                    <dt className="rounded-md border border-line-strong bg-field px-[7px] py-[3px] text-[12px] font-medium whitespace-nowrap">
                      {row.keys}
                    </dt>
                    <dd className="text-right text-[13px] text-ink-muted">
                      {row.does}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full cursor-pointer rounded-xl border border-line-strong bg-white px-[18px] py-3 text-[14.5px] font-medium transition-colors hover:bg-hover"
        >
          Done
        </button>
      </div>
    </div>
  );
}
