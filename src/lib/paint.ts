import type { Stroke } from "./board-doc";

export type Viewport = { zoom: number; panX: number; panY: number };

function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.size;

  if (stroke.kind === "shape") {
    const x = Math.min(stroke.x0, stroke.x1);
    const y = Math.min(stroke.y0, stroke.y1);
    const w = Math.abs(stroke.x1 - stroke.x0);
    const h = Math.abs(stroke.y1 - stroke.y0);
    ctx.globalCompositeOperation = "source-over";
    ctx.beginPath();
    if (stroke.shape === "rect") {
      ctx.rect(x, y, w, h);
    } else if (stroke.shape === "ellipse") {
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else {
      ctx.moveTo(stroke.x0, stroke.y0);
      ctx.lineTo(stroke.x1, stroke.y1);
    }
    ctx.stroke();
    return;
  }

  const p = stroke.points;
  if (p.length < 2) return;
  ctx.globalCompositeOperation = stroke.erase
    ? "destination-out"
    : "source-over";

  if (p.length === 2) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    // Quadratic through midpoints keeps the line smooth without resampling the path.
    for (let i = 2; i < p.length - 2; i += 2) {
      const mx = (p[i] + p[i + 2]) / 2;
      const my = (p[i + 1] + p[i + 3]) / 2;
      ctx.quadraticCurveTo(p[i], p[i + 1], mx, my);
    }
    ctx.lineTo(p[p.length - 2], p[p.length - 1]);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}

export function paintBoard(
  canvas: HTMLCanvasElement,
  strokes: Stroke[],
  preview: Stroke | null,
  view: Viewport,
  dpr: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(
    dpr * view.zoom,
    0,
    0,
    dpr * view.zoom,
    dpr * view.panX,
    dpr * view.panY,
  );
  for (const stroke of strokes) paintStroke(ctx, stroke);
  if (preview) paintStroke(ctx, preview);
}

export function resizeCanvas(canvas: HTMLCanvasElement): number {
  const parent = canvas.parentElement;
  if (!parent) return 1;
  const rect = parent.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  return dpr;
}
