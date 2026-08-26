import type * as Y from "yjs";

type Diff = { start: number; removed: number; inserted: string };

/** Narrows an edit to the span that actually changed, ignoring shared prefix and suffix. */
function diff(prev: string, next: string): Diff {
  let start = 0;
  const maxStart = Math.min(prev.length, next.length);
  while (start < maxStart && prev[start] === next[start]) start += 1;

  let tail = 0;
  const maxTail = Math.min(prev.length - start, next.length - start);
  while (
    tail < maxTail &&
    prev[prev.length - 1 - tail] === next[next.length - 1 - tail]
  ) {
    tail += 1;
  }

  return {
    start,
    removed: prev.length - start - tail,
    inserted: next.slice(start, next.length - tail),
  };
}

/**
 * Applies a textarea edit to a Y.Text as a positioned splice rather than a
 * whole-value replacement, so simultaneous edits in different places merge.
 */
export function applyTextEdit(
  body: Y.Text,
  next: string,
  origin: unknown,
): void {
  const prev = body.toString();
  if (prev === next) return;
  const { start, removed, inserted } = diff(prev, next);
  const doc = body.doc;
  const splice = () => {
    if (removed > 0) body.delete(start, removed);
    if (inserted) body.insert(start, inserted);
  };
  if (doc) doc.transact(splice, origin);
  else splice();
}

/**
 * Pushes a remote value into a textarea, keeping the caret where the typist
 * expects it when the change landed before their cursor.
 */
export function reconcileTextarea(
  node: HTMLTextAreaElement,
  next: string,
): void {
  const prev = node.value;
  if (prev === next) return;

  const focused = document.activeElement === node;
  const caret = node.selectionStart ?? 0;
  node.value = next;

  if (focused) {
    const { start } = diff(prev, next);
    const shifted =
      caret <= start
        ? caret
        : Math.max(
            start,
            Math.min(next.length, caret + next.length - prev.length),
          );
    node.setSelectionRange(shifted, shifted);
  }

  autosize(node);
}

export function autosize(node: HTMLTextAreaElement): void {
  node.style.height = "auto";
  node.style.height = `${node.scrollHeight}px`;
}
