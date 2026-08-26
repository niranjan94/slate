"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_NAME_LENGTH, sanitizeName } from "@/lib/room";

type NameProps = {
  name: string;
  onRename: (name: string) => string;
};

const INPUT_BASE =
  "min-w-0 rounded-[7px] border border-line-strong bg-field text-ink outline-none focus:border-accent focus:bg-white";

function useDraft(name: string) {
  const [draft, setDraft] = useState(name);
  const [seen, setSeen] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  // The chip and the panel field can both be mounted, so a rename made in one
  // has to reach the other rather than leaving a stale draft behind.
  if (name !== seen) {
    setSeen(name);
    setDraft(name);
  }

  return {
    draft,
    inputRef,
    set: setDraft,
    change: (raw: string) => setDraft(sanitizeName(raw)),
    reset: () => setDraft(name),
  };
}

/** Compact rename control for the board chrome, so a name can be changed mid-session. */
export function NameChip({ name, onRename }: NameProps) {
  const [editing, setEditing] = useState(false);
  const { draft, inputRef, set, change, reset } = useDraft(name);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing, inputRef]);

  const commit = () => {
    setEditing(false);
    set(onRename(draft));
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3.5 py-[9px] shadow-panel">
      <span className="text-[10.5px] font-medium tracking-[0.1em] text-ink-ghost uppercase">
        You
      </span>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => change(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") {
              reset();
              setEditing(false);
            }
          }}
          maxLength={MAX_NAME_LENGTH}
          aria-label="Your name"
          className={`${INPUT_BASE} w-[110px] px-2 py-[3px] text-[13px] font-medium`}
        />
      ) : (
        <button
          type="button"
          title="Rename yourself"
          onClick={() => {
            reset();
            setEditing(true);
          }}
          className="cursor-pointer rounded-[7px] px-1 py-px text-[13px] font-medium text-ink transition-colors hover:bg-hover"
        >
          {name}
        </button>
      )}
    </div>
  );
}

/** Full-width field for the entry panel, where naming yourself is the first thing to do. */
export function NameInput({ name, onRename }: NameProps) {
  const { draft, inputRef, set, change } = useDraft(name);

  // Set from the applied name rather than the typed one: clearing the field
  // hands back a generated name, which the field then has to show.
  const commit = () => set(onRename(draft));

  return (
    <label className="mb-3 block">
      <span className="mb-[5px] block text-[10.5px] font-medium tracking-[0.1em] text-ink-ghost uppercase">
        Your name
      </span>
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => change(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
        maxLength={MAX_NAME_LENGTH}
        placeholder="Who are you?"
        className={`${INPUT_BASE} w-full px-4 py-[13px] text-[15px] font-medium`}
      />
    </label>
  );
}
