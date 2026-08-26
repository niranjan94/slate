"use client";

import { useEffect, useRef } from "react";
import type * as Y from "yjs";
import { LOCAL_ORIGIN } from "@/lib/board-doc";
import { applyTextEdit, autosize, reconcileTextarea } from "@/lib/y-textarea";

type TextBoxProps = {
  text: string;
  color: string;
  body: Y.Text | null;
  caretCursor: string;
  focusOnMount: boolean;
  onBlur: () => void;
};

export function TextBox({
  text,
  color,
  body,
  caretCursor,
  focusOnMount,
  onBlur,
}: TextBoxProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // The textarea is uncontrolled so that a remote edit can be merged in without
  // React resetting the caret on every keystroke.
  useEffect(() => {
    const node = ref.current;
    if (node) reconcileTextarea(node, text);
  }, [text]);

  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);

  return (
    <textarea
      ref={ref}
      rows={1}
      placeholder="Type…"
      onChange={(event) => {
        if (body) applyTextEdit(body, event.target.value, LOCAL_ORIGIN);
        autosize(event.currentTarget);
      }}
      onBlur={onBlur}
      style={{ color, cursor: caretCursor }}
      className="min-h-[30px] w-full overflow-hidden border-none bg-transparent px-1 py-0.5 text-[19px] leading-[1.4] outline-none placeholder:text-ink-ghost"
    />
  );
}
