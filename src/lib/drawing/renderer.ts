import type { Point } from "@/types/drawing";
import type { WhiteboardItem } from "@/types/whiteboard";

export const INK = "#1e293b";
export const INK_SOFT = "#475569";

export interface Sprite {
  path: Path2D;
  box: { x0: number; y0: number; x1: number; y1: number };
}

/** Per-point width modulation to give a marker-like organic stroke. */
function widthsFor(points: Point[], baseWidth: number, pressure?: number[], salt = 0): number[] {
  const n = points.length;
  const w = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let v = 1;
    if (pressure && pressure[i] != null) {
      v = 0.55 + 0.75 * pressure[i];
    } else {
      v = 1 + 0.22 * Math.sin(i * 1.35 + salt) + 0.1 * Math.sin(i * 0.61 + salt * 2);
    }
    w[i] = Math.max(0.3, baseWidth * v);
  }
  return w;
}

/**
 * Build a filled "ribbon" path (like a marker nib) from a centerline.
 * The polyline is offset on both sides by the local half width, which yields
 * smooth, variable-width strokes with a hand-drawn character.
 */
export function buildRibbonPath(points: Point[], baseWidth: number, pressure?: number[], salt = 0): Path2D {
  const path = new Path2D();
  const n = points.length;
  if (n === 0) return path;
  if (n === 1) {
    path.arc(points[0].x, points[0].y, Math.max(0.5, baseWidth / 2), 0, Math.PI * 2);
    return path;
  }

  const widths = widthsFor(points, baseWidth, pressure, salt);
  const norms: Point[] = new Array(n);
  let px = points[1].x - points[0].x;
  let py = points[1].y - points[0].y;
  let pl = Math.hypot(px, py) || 1;
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      // keep initial tangent
    } else if (i === n - 1) {
      px = points[i].x - points[i - 1].x;
      py = points[i].y - points[i - 1].y;
      pl = Math.hypot(px, py) || 1;
    } else {
      px = points[i + 1].x - points[i - 1].x;
      py = points[i + 1].y - points[i - 1].y;
      pl = Math.hypot(px, py) || 1;
    }
    // normal = (-ty, tx)
    norms[i] = { x: (-py / pl) * widths[i] * 0.5, y: (px / pl) * widths[i] * 0.5 };
  }

  path.moveTo(points[0].x + norms[0].x, points[0].y + norms[0].y);
  for (let i = 1; i < n; i++) path.lineTo(points[i].x + norms[i].x, points[i].y + norms[i].y);
  for (let i = n - 1; i >= 0; i--) path.lineTo(points[i].x - norms[i].x, points[i].y - norms[i].y);
  path.closePath();
  // round caps
  path.arc(points[0].x, points[0].y, widths[0] / 2, 0, Math.PI * 2);
  path.arc(points[n - 1].x, points[n - 1].y, widths[n - 1] / 2, 0, Math.PI * 2);
  return path;
}

export function classifyItem(item: WhiteboardItem): Sprite {
  if (item.kind === "text") {
    const w = Math.max(8, item.text.length * item.fontSize * 0.62);
    const h = item.fontSize * 0.9;
    return {
      path: new Path2D(),
      box: { x0: item.x, y0: item.y - h, x1: item.x + w + 8, y1: item.y + item.fontSize * 0.2 },
    };
  }
  const path = buildRibbonPath(item.points, item.width, item.kind === "stroke" ? item.pressure : undefined, item.seed);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of item.points) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  const pad = item.width;
  return { path, box: { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad } };
}

export function drawSprite(ctx: CanvasRenderingContext2D, sprite: Sprite, item: WhiteboardItem): void {
  if (item.kind === "text") {
    ctx.font = `${item.fontSize}px "Chalkboard SE", "Segoe Print", "Comic Sans MS", "Marker Felt", cursive, sans-serif`;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = INK;
    ctx.fillText(item.text, item.x, item.y);
    return;
  }
  ctx.save();
  if (item.kind === "erase") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";
  } else {
    ctx.fillStyle = INK;
    ctx.globalAlpha = item.opacity ?? 1;
  }
  ctx.fill(sprite.path, "nonzero");
  ctx.restore();
}

export function intersectsBox(box: Sprite["box"], x0: number, y0: number, x1: number, y1: number): boolean {
  return box.x1 >= x0 && box.x0 <= x1 && box.y1 >= y0 && box.y0 <= y1;
}