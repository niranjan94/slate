"use client";

import { useEffect, useRef } from "react";
import { NameInput } from "./name-field";

type BoardMenuProps = {
  localName: string;
  onRename: (name: string) => string;
  onCopy: () => void;
  onPickImage: () => void;
  onClear: () => void;
  onShowHelp: () => void;
  onClose: () => void;
};

const ROW =
  "flex min-h-11 w-full cursor-pointer items-center rounded-[10px] px-3 text-[14.5px] font-medium transition-colors";

/**
 * The narrow dock has room for the drawing tools and nothing else, so everything
 * the wide chrome spreads across the top bar is gathered here instead.
 */
export function BoardMenu({
  localName,
  onRename,
  onCopy,
  onPickImage,
  onClear,
  onShowHelp,
  onClose,
}: BoardMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // Capture, so the board's own surface handler does not draw a dab on the way out.
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="absolute top-[calc(64px+var(--safe-t))] right-[calc(12px+var(--safe-r))] z-10 w-[248px] rounded-[15px] border border-line bg-panel p-2 shadow-card"
    >
      <div className="px-1">
        <NameInput name={localName} onRename={onRename} />
      </div>

      <div className="mb-1 h-px bg-rule" />

      <button
        type="button"
        onClick={() => {
          onCopy();
          onClose();
        }}
        className={`${ROW} text-ink`}
      >
        Copy the link
      </button>
      <button
        type="button"
        onClick={() => {
          onPickImage();
          onClose();
        }}
        className={`${ROW} text-ink`}
      >
        Add a picture
      </button>
      <button
        type="button"
        onClick={() => {
          onShowHelp();
          onClose();
        }}
        className={`${ROW} text-ink`}
      >
        How this works
      </button>

      <div className="my-1 h-px bg-rule" />

      <button
        type="button"
        onClick={() => {
          onClear();
          onClose();
        }}
        className={`${ROW} text-peer`}
      >
        Clear the board
      </button>
    </div>
  );
}
