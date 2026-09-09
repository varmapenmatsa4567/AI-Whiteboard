export interface Rect { x: number; y: number; width: number; height: number }

export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return !(a.x + a.width + gap <= b.x || b.x + b.width + gap <= a.x || a.y + a.height + gap <= b.y || b.y + b.height + gap <= a.y);
}

export function inflateRect(r: Rect, amount: number): Rect {
  return { x: r.x - amount, y: r.y - amount, width: r.width + amount * 2, height: r.height + amount * 2 };
}

export function rectCenter(r: Rect): { x: number; y: number } {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

export function boundsOf(rects: Rect[], padding = 0): Rect | null {
  if (rects.length === 0) return null;
  const x0 = Math.min(...rects.map((r) => r.x)) - padding;
  const y0 = Math.min(...rects.map((r) => r.y)) - padding;
  const x1 = Math.max(...rects.map((r) => r.x + r.width)) + padding;
  const y1 = Math.max(...rects.map((r) => r.y + r.height)) + padding;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export type Side = "top" | "right" | "bottom" | "left";

export function boundaryPoint(r: Rect, toward: { x: number; y: number }): { x: number; y: number } {
  const c = rectCenter(r);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { x: r.x + r.width, y: c.y } : { x: r.x, y: c.y };
  }
  return dy >= 0 ? { x: c.x, y: r.y + r.height } : { x: c.x, y: r.y };
}

export function orthogonalRoute(source: Rect, target: Rect, clearance = 24): { x: number; y: number }[] {
  const sc = rectCenter(source);
  const tc = rectCenter(target);
  const start = boundaryPoint(source, tc);
  const end = boundaryPoint(target, sc);
  const horizontal = Math.abs(tc.x - sc.x) >= Math.abs(tc.y - sc.y);

  if (horizontal) {
    const midX = (start.x + end.x) / 2;
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }
  const midY = (start.y + end.y) / 2;
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
}

export function pointsCrossRect(points: { x: number; y: number }[], rect: Rect, padding = 0): boolean {
  const r = inflateRect(rect, padding);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (segmentHitsRect(a, b, r)) return true;
  }
  return false;
}

function segmentHitsRect(a: { x: number; y: number }, b: { x: number; y: number }, r: Rect): boolean {
  if (a.x === b.x) {
    return a.x >= r.x && a.x <= r.x + r.width && Math.max(Math.min(a.y, b.y), r.y) <= Math.min(Math.max(a.y, b.y), r.y + r.height);
  }
  if (a.y === b.y) {
    return a.y >= r.y && a.y <= r.y + r.height && Math.max(Math.min(a.x, b.x), r.x) <= Math.min(Math.max(a.x, b.x), r.x + r.width);
  }
  return false;
}