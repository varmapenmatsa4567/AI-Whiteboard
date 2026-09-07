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

export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Compute the bounding box of a single item in world coordinates. */
export function getItemBBox(item: WhiteboardItem): BBox | null {
  if (item.kind === "text") {
    const w = Math.max(16, item.text.length * item.fontSize * 0.6);
    const h = item.fontSize * 1.1;
    return { x0: item.x, y0: item.y - h, x1: item.x + w, y1: item.y + item.fontSize * 0.2 };
  }
  if (item.points.length === 0) return null;
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
  const pad = Math.max(4, item.width * 0.5);
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

/** Compute the minimal enclosing bounding box of multiple items in world coordinates. */
export function getGroupBBox(items: WhiteboardItem[]): BBox | null {
  if (items.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let count = 0;
  for (const item of items) {
    const box = getItemBBox(item);
    if (!box) continue;
    x0 = Math.min(x0, box.x0);
    y0 = Math.min(y0, box.y0);
    x1 = Math.max(x1, box.x1);
    y1 = Math.max(y1, box.y1);
    count++;
  }
  return count > 0 ? { x0, y0, x1, y1 } : null;
}

/**
 * Resolve the items that should move together when the user clicks an item.
 *
 * Clicking a closed shape selects that shape and the content it encloses, so a
 * labelled shape behaves as one object even when its label was created as a
 * separate canvas item. A label that lives inside a shape is part of that
 * shape: grabbing it drags the whole shape, never just the text. A fill tucked
 * inside a larger, roughly concentric outline (a border around a background)
 * is also part of the same shape, so the pair moves together. Arrows and other
 * explicitly grouped items continue to use their persisted group id. Only text
 * that sits outside any shape stays fully independent.
 */
export function selectionTargetIds(items: WhiteboardItem[], target: WhiteboardItem): string[] {
  if (target.groupId) {
    return items.filter((item) => item.groupId === target.groupId).map((item) => item.id);
  }

  if (target.kind === "erase") return [target.id];

  let anchor: WhiteboardItem = target;

  if (target.kind === "text") {
    const card = smallestClosedContainer(items, target);
    if (!card) return [target.id];
    anchor = card;
  } else {
    if (!isClosedOutline(target)) return [target.id];
    anchor = target;
  }

  // A fill/background contained in a larger, concentric closed outline is just
  // the interior of that shape — use the outline as the anchor so the border
  // moves with the fill and whatever it encloses.
  const border = smallestEnclosingBorder(items, anchor);
  if (border) anchor = border;

  const targetIds = new Set([anchor.id]);
  for (const item of items) {
    if (item.id === anchor.id || item.kind === "erase" || item.groupId) continue;
    if (isFullyInsideShape(item, anchor.points)) targetIds.add(item.id);
  }

  // Some existing drawings encode a fill and its hand-drawn outline as two
  // items. They are a single visual shape, even though they have no groupId.
  // Link a matching closed outline (or one that contains the same label) so
  // dragging the fill never leaves its border behind.
  for (const item of items) {
    if (item.id === anchor.id || item.kind === "text" || item.kind === "erase" || item.groupId) continue;
    if (isVisualShapeCompanion(anchor, item, items)) targetIds.add(item.id);
  }
  return [...targetIds];
}

/** Bounding-box corners used to test whether an item is fully inside a shape. */
function bboxCorners(box: BBox): Point[] {
  return [
    { x: box.x0, y: box.y0 },
    { x: box.x1, y: box.y0 },
    { x: box.x1, y: box.y1 },
    { x: box.x0, y: box.y1 },
  ];
}

/**
 * The smallest closed shape whose outline fully contains the target's bounding
 * box. Used so a text label inside a shape drags that whole shape, and a fill
 * selects its closest surrounding outline.
 */
function smallestClosedContainer(
  items: WhiteboardItem[],
  target: WhiteboardItem
): Exclude<WhiteboardItem, { kind: "text" | "erase" }> | null {
  const box = getItemBBox(target);
  if (!box) return null;
  const corners = bboxCorners(box);

  let best: Exclude<WhiteboardItem, { kind: "text" | "erase" }> | null = null;
  let bestArea = Infinity;
  for (const item of items) {
    if (item.id === target.id || item.kind === "text" || item.kind === "erase" || item.groupId) continue;
    if (!isClosedOutline(item)) continue;
    if (!corners.every((p) => pointInPolygon(p, item.points))) continue;
    const b = getItemBBox(item);
    if (!b) continue;
    const area = (b.x1 - b.x0) * (b.y1 - b.y0);
    if (area < bestArea) {
      bestArea = area;
      best = item;
    }
  }
  return best;
}

/**
 * The smallest roughly concentric closed outline that acts as a border around
 * the target: it fully contains the target, is bigger than it, and is not
 * wildly larger (so a giant backdrop is never mistaken for a card border).
 */
function smallestEnclosingBorder(
  items: WhiteboardItem[],
  target: Exclude<WhiteboardItem, { kind: "text" | "erase" }>
): Exclude<WhiteboardItem, { kind: "text" | "erase" }> | null {
  const box = getItemBBox(target);
  if (!box) return null;
  const corners = bboxCorners(box);
  const targetW = box.x1 - box.x0;
  const targetH = box.y1 - box.y0;
  const targetMax = Math.max(targetW, targetH);

  let best: Exclude<WhiteboardItem, { kind: "text" | "erase" }> | null = null;
  let bestMax = Infinity;
  for (const item of items) {
    if (item.id === target.id || item.kind === "text" || item.kind === "erase" || item.groupId) continue;
    if (!isClosedOutline(item)) continue;
    const b = getItemBBox(item);
    if (!b) continue;
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    const maxDim = Math.max(w, h);
    if (w <= targetW || h <= targetH) continue;
    if (maxDim > targetMax * 4) continue;
    if (!corners.every((p) => pointInPolygon(p, item.points))) continue;
    const centerDistance = Math.hypot(
      (b.x0 + b.x1 - box.x0 - box.x1) / 2,
      (b.y0 + b.y1 - box.y0 - box.y1) / 2
    );
    if (centerDistance > Math.max(24, Math.min(targetW, targetH) * 0.6)) continue;
    if (maxDim < bestMax) {
      bestMax = maxDim;
      best = item;
    }
  }
  return best;
}

/** Whether all of an item's visible geometry is inside a closed shape. */
function isFullyInsideShape(item: WhiteboardItem, shape: Point[]): boolean {
  if (item.kind === "text") {
    const box = getItemBBox(item);
    if (!box) return false;
    return [
      { x: box.x0, y: box.y0 },
      { x: box.x1, y: box.y0 },
      { x: box.x1, y: box.y1 },
      { x: box.x0, y: box.y1 },
    ].every((point) => pointInPolygon(point, shape));
  }

  return item.points.length > 0 && item.points.every((point) => pointInPolygon(point, shape));
}

function isVisualShapeCompanion(
  target: Exclude<WhiteboardItem, { kind: "text" | "erase" }>,
  candidate: Exclude<WhiteboardItem, { kind: "text" | "erase" }>,
  items: WhiteboardItem[]
): boolean {
  if (!isClosedOutline(candidate)) return false;
  const targetBox = getItemBBox(target);
  const candidateBox = getItemBBox(candidate);
  if (!targetBox || !candidateBox) return false;

  const targetWidth = targetBox.x1 - targetBox.x0;
  const targetHeight = targetBox.y1 - targetBox.y0;
  const candidateWidth = candidateBox.x1 - candidateBox.x0;
  const candidateHeight = candidateBox.y1 - candidateBox.y0;
  const centerDistance = Math.hypot(
    (targetBox.x0 + targetBox.x1 - candidateBox.x0 - candidateBox.x1) / 2,
    (targetBox.y0 + targetBox.y1 - candidateBox.y0 - candidateBox.y1) / 2
  );
  const similarSize =
    candidateWidth >= targetWidth * 0.75 && candidateWidth <= targetWidth * 1.33 &&
    candidateHeight >= targetHeight * 0.75 && candidateHeight <= targetHeight * 1.33;
  if (similarSize && centerDistance <= Math.max(12, Math.min(targetWidth, targetHeight) * 0.12)) return true;

  // This also repairs a fill/outline pair that was partially dragged before
  // grouping was available: both still surround the same text label.
  return items.some(
    (item) =>
      item.kind === "text" &&
      isFullyInsideShape(item, target.points) &&
      isFullyInsideShape(item, candidate.points)
  );
}

function isClosedOutline(item: Exclude<WhiteboardItem, { kind: "text" | "erase" }>): boolean {
  if (item.kind === "shape" && item.closed) return true;
  if (item.points.length < 3) return false;
  const first = item.points[0];
  const last = item.points[item.points.length - 1];
  return Math.hypot(last.x - first.x, last.y - first.y) <= Math.max(8, item.width * 2);
}

/** Check if a point hits an item in world space. */
export function hitTestItem(item: WhiteboardItem, p: Point, tolerance = 8): boolean {
  const box = getItemBBox(item);
  if (!box) return false;
  const pad = tolerance;
  if (p.x < box.x0 - pad || p.x > box.x1 + pad || p.y < box.y0 - pad || p.y > box.y1 + pad) {
    return false;
  }
  if (item.kind === "text") return true;

  // Check proximity to stroke / shape points or filled interior for closed shapes.
  // For both filled and unfilled closed shapes, the click must be geometrically
  // inside the outline polygon — never short-circuit on item.fill alone, because
  // that would make ANY bounding-box hit count as a selection.
  if (item.kind === "shape" && item.closed) {
    if (pointInPolygon(p, item.points)) return true;
  }

  // A hand-drawn closed loop (a pen stroke that joins back on itself) is the
  // same visual shape as a toolbar rectangle: grabbing ANYWHERE inside it — not
  // just on its 7px stroke — should select it and drag the whole shape, instead
  // of falling through to a marquee selection.
  if (item.kind === "stroke" && isClosedOutline(item) && pointInPolygon(p, item.points)) return true;

  const tolSq = (tolerance + item.width * 0.5) ** 2;
  for (let i = 0; i < item.points.length - 1; i++) {
    const a = item.points[i];
    const b = item.points[i + 1];
    if (distToSegmentSq(p, a, b) <= tolSq) return true;
  }
  if (item.points.length === 1) {
    const dx = item.points[0].x - p.x;
    const dy = item.points[0].y - p.y;
    if (dx * dx + dy * dy <= tolSq) return true;
  }
  return false;
}

function distToSegmentSq(p: Point, a: Point, b: Point): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * (b.x - a.x);
  const projY = a.y + t * (b.y - a.y);
  return (p.x - projX) ** 2 + (p.y - projY) ** 2;
}

import type { TransformHandle } from "@/types/whiteboard";

export function getHandlePositions(box: BBox): Record<TransformHandle, Point> {
  const mx = (box.x0 + box.x1) / 2;
  const my = (box.y0 + box.y1) / 2;
  return {
    nw: { x: box.x0, y: box.y0 },
    n: { x: mx, y: box.y0 },
    ne: { x: box.x1, y: box.y0 },
    e: { x: box.x1, y: my },
    se: { x: box.x1, y: box.y1 },
    s: { x: mx, y: box.y1 },
    sw: { x: box.x0, y: box.y1 },
    w: { x: box.x0, y: my },
  };
}

export function hitTestHandle(
  box: BBox,
  p: Point,
  zoom = 1,
  handleHitRadiusWorld = 10
): TransformHandle | null {
  const handles = getHandlePositions(box);
  const tolSq = (handleHitRadiusWorld / zoom) ** 2;
  const keys: TransformHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  for (const h of keys) {
    const hp = handles[h];
    const dx = p.x - hp.x;
    const dy = p.y - hp.y;
    if (dx * dx + dy * dy <= tolSq) return h;
  }
  return null;
}
