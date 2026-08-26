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
    title: "What you have in hand",
    rows: [
      { keys: "Click", does: "Take it in hand, in Move" },
      { keys: "Arrows", does: "Nudge · hold Shift for ten" },
      { keys: "[  ]", does: "Turn by fifteen degrees" },
      { keys: "⌘ D", does: "Duplicate beside it" },
      { keys: "Enter", does: "Edit a text box" },
      { keys: "⌫", does: "Remove it" },
      { keys: "Esc", does: "Put it down" },
    ],
  },
  {
    title: "The board",
    rows: [
      { keys: "Space", does: "Hold to drag the board" },
      { keys: "=  −", does: "Zoom in and out" },
      { keys: "0", does: "Back to life size" },
      { keys: "⌘ Z", does: "Undo" },
      { keys: "⇧ ⌘ Z", does: "Redo" },
      { keys: "?", does: "This list" },
    ],
  },
];
