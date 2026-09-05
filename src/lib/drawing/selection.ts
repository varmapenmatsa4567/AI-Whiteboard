import type { Point } from "@/types/drawing";
import type { WhiteboardItem } from "@/types/whiteboard";
import { pathLength, resample } from "./smoothing";

/** Standard even-odd ray-casting point-in-polygon test. */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const intersects =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-9) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Sample an ellipse outline as a polygon (closed loop not required). */
export function polygonFromEllipse(cx: number, cy: number, rx: number, ry: number, segs = 64): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return out;
}

/**
 * Items whose geometry lies inside the selection polygon. An item is included
 * when at least `ratio` (default 0.5) of its sampled points fall inside the
 * loop; text items are included when their anchor point is inside.
 */
export function itemsInside(items: WhiteboardItem[], poly: Point[], ratio = 0.5): WhiteboardItem[] {
  if (poly.length < 3) return [];
  const inside: WhiteboardItem[] = [];
  for (const item of items) {
    let samples: Point[];
    if (item.kind === "text") {
      samples = [{ x: item.x, y: item.y }];
    } else {
      const len = pathLength(item.points);
      const spacing = Math.max(2, len / 48);
      samples = resample(item.points, spacing);
      if (samples.length === 0 && item.points.length > 0) samples = [item.points[0]];
    }
    if (samples.length === 0) continue;
    let hit = 0;
    for (const p of samples) {
      if (pointInPolygon(p, poly)) hit += 1;
    }
    if (hit / samples.length >= ratio) inside.push(item);
  }
  return inside;
}

const KIND_LABEL: Record<WhiteboardItem["kind"], string> = {
  stroke: "stroke",
  shape: "shape",
  text: "label",
  erase: "erased area",
};

/**
 * A short, human-readable summary of the circled content, e.g.
 * "3 items inside: 2 shapes, 1 stroke" plus any text written inside.
 */
export function selectionSummary(items: WhiteboardItem[]): string {
  if (items.length === 0) return "Nothing inside this circle.";
  const counts = new Map<string, number>();
  for (const it of items) {
    const key = it.kind === "shape" ? (it.closed ? "shape" : "line") : KIND_LABEL[it.kind];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([k, n]) => `${n} ${k}${n > 1 ? "s" : ""}`);
  const plural = items.length === 1 ? "item" : "items";
  return `${items.length} ${plural} inside: ${parts.join(", ")}`;
}

/** Non-empty text labels found inside the selection, in drawing order. */
export function textLabels(items: WhiteboardItem[]): string[] {
  return items.filter((it) => it.kind === "text" && it.text.trim().length > 0).map((it) => (it.kind === "text" ? it.text.trim() : ""));
}

/** Bounding box of the selection polygon in world coordinates. */
export function selectionBBox(poly: Point[]): { x0: number; y0: number; x1: number; y1: number } | null {
  if (poly.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}