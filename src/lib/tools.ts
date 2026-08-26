import type { ShapeId, ToolId } from "./board-doc";

export type ToolDef = {
  id: ToolId;
  label: string;
  hint: string;
  shortcut: string;
};

export const TOOLS: ToolDef[] = [
  { id: "pen", label: "Draw", hint: "drag to draw · D", shortcut: "d" },
  { id: "eraser", label: "Erase", hint: "erase ink · E", shortcut: "e" },
  { id: "text", label: "Text", hint: "click to place text · T", shortcut: "t" },
  { id: "shape", label: "Shape", hint: "drag out a shape · S", shortcut: "s" },
  {
    id: "select",
    label: "Move",
    hint: "move, rotate, resize · V",
    shortcut: "v",
  },
  { id: "pan", label: "Pan", hint: "drag the board · H", shortcut: "h" },
];

export const TOOL_STATUS: Record<ToolId, string> = {
  pen: "drag to draw · ink lands on top of pictures",
  eraser: "drag to erase ink",
  text: "click anywhere to place text",
  shape: "drag out a shape",
  select: "drag to move · corner resizes · top handle rotates · ⌫ removes",
  pan: "drag to move the board · ⌘ + scroll to zoom",
};

export const SWATCHES: { name: string; value: string }[] = [
  { name: "Ink", value: "#1c1b19" },
  { name: "Blue", value: "oklch(0.62 0.19 250)" },
  { name: "Green", value: "oklch(0.62 0.19 145)" },
  { name: "Amber", value: "oklch(0.7 0.17 70)" },
];

export const WIDTHS: { name: string; value: number }[] = [
  { name: "Fine", value: 2 },
  { name: "Medium", value: 4 },
  { name: "Bold", value: 8 },
];

export const SHAPES: { id: ShapeId; name: string }[] = [
  { id: "rect", name: "Rectangle" },
  { id: "ellipse", name: "Ellipse" },
  { id: "line", name: "Line" },
];

export const PEER_INK = "oklch(0.62 0.19 25)";

export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 3;

export function eraserSize(width: number): number {
  return Math.max(14, width * 7);
}

export function shortcutToTool(key: string): ToolId | null {
  const match = TOOLS.find((tool) => tool.shortcut === key.toLowerCase());
  return match ? match.id : null;
}
