import { TOOLS } from "./tools";

export type ShortcutRow = { keys: string; does: string };
export type ShortcutGroup = { title: string; rows: ShortcutRow[] };

/** The sheet is documentation, so this list has to be kept beside the board's key handler. */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Tools",
    rows: [
      ...TOOLS.map((tool) => ({
        keys: tool.shortcut.toUpperCase(),
        does: tool.label,
      })),
      { keys: "I", does: "Add a picture" },
      { keys: "P", does: "Add from your phone" },
    ],
  },
  {
    title: "The selected item",
    rows: [
      { keys: "Click", does: "Select it, in Move" },
      { keys: "Arrows", does: "Move it · hold Shift to move further" },
      { keys: "[  ]", does: "Rotate it" },
      { keys: "⌘ D", does: "Duplicate beside it" },
      { keys: "Enter", does: "Edit a text box" },
      { keys: "⌫", does: "Remove it" },
      { keys: "Esc", does: "Deselect it" },
    ],
  },
  {
    title: "The board",
    rows: [
      { keys: "Space", does: "Hold to move around the board" },
      { keys: "=  −", does: "Zoom in and out" },
      { keys: "0", does: "Zoom back to 100%" },
      { keys: "⌘ Z", does: "Undo" },
      { keys: "⇧ ⌘ Z", does: "Redo" },
      { keys: "?", does: "Show this list" },
    ],
  },
];
