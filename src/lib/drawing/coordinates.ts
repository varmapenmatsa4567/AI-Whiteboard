import type { Point, Region } from "@/types/drawing";
import type { Camera, WhiteboardItem } from "@/types/whiteboard";

/** Normalized space is always 0..1000 on both axes and maps 1:1 onto the current region. */
export const NORMALIZED = 1000;

export const SPRING = 1;

export function computeRegion(cam: Camera, vp: { width: number; height: number }): Region {
  const w = Math.max(vp.width / cam.zoom, 120) * SPRING;
  const h = Math.max(vp.height / cam.zoom, 120) * SPRING;
  return {
    x: cam.x - w / 2,
    y: cam.y - h / 2,
    width: w,
    height: h,
  };
}

/** World-space bounding box of the given items (points + text anchors). */
export function itemsWorldBounds(items: WhiteboardItem[]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const it of items) {
    if (it.kind === "text") {
      const h = it.fontSize * 0.9;
      const w = Math.max(8, it.text.length * it.fontSize * 0.62);
      if (it.x < x0) x0 = it.x;
      if (it.y - h < y0) y0 = it.y - h;
      if (it.x + w > x1) x1 = it.x + w;
      if (it.y + it.fontSize * 0.2 > y1) y1 = it.y + it.fontSize * 0.2;
      continue;
    }
    const pad = it.width + 6;
    for (const p of it.points) {
      if (p.x - pad < x0) x0 = p.x - pad;
      if (p.y - pad < y0) y0 = p.y - pad;
      if (p.x + pad > x1) x1 = p.x + pad;
      if (p.y + pad > y1) y1 = p.y + pad;
    }
  }
  if (!Number.isFinite(x0)) return null;
  return { x0, y0, x1, y1 };
}

const GAP = 160;

function centeredRegion(w: number, h: number, cx: number, cy: number): Region {
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

/**
 * Pick a place on the infinite canvas for the next drawing so it never
 * overlaps existing content. The board is an infinite 2D plane: each request
 * gets its own viewport-sized "sheet" of paper placed in empty space to the
 * right of (and, descending, below) whatever is already drawn. Returns a
 * normalized Region, where 0..1000 maps onto that sheet.
 */
export function nextDrawingRegion(items: WhiteboardItem[], vp: { width: number; height: number }, camera: Camera): Region {
  const w = Math.max(vp.width / camera.zoom, 240);
  const h = Math.max(vp.height / camera.zoom, 240);
  if (items.length === 0) return centeredRegion(w, h, camera.x, camera.y);

  const bounds = itemsWorldBounds(items);
  if (!bounds) return centeredRegion(w, h, camera.x, camera.y);

  const bh = bounds.y1 - bounds.y0;
  // Candidates, in order: to the right, then below alongside, else centered.
  const candidates: Array<[number, number]> = [
    [bounds.x1 + GAP, bounds.y0 - (h - bh) / 2],
    [bounds.x0, bounds.y1 + GAP],
    [bounds.x1 + GAP, bounds.y1 + GAP],
  ];
  for (const [cx, cy] of candidates) {
    const reg: Region = { x: cx, y: cy, width: w, height: h };
    if (!regionIntersects(items, reg)) return reg;
  }
  // Fall back to a spot offset diagonally from the current view.
  return centeredRegion(w, h, camera.x + w + GAP, camera.y);
}

function regionIntersects(items: WhiteboardItem[], region: Region): boolean {
  const { x, y, width, height } = region;
  for (const it of items) {
    const box = itemBox(it);
    if (!box) continue;
    const overlaps =
      box.x1 >= x && box.x0 <= x + width && box.y1 >= y && box.y0 <= y + height;
    if (overlaps) return true;
  }
  return false;
}

function itemBox(it: WhiteboardItem): { x0: number; y0: number; x1: number; y1: number } | null {
  if (it.kind === "text") {
    const h = it.fontSize * 0.9;
    const w = Math.max(8, it.text.length * it.fontSize * 0.62);
    return { x0: it.x, y0: it.y - h, x1: it.x + w, y1: it.y + it.fontSize * 0.2 };
  }
  if (it.points.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const pad = it.width + 6;
  for (const p of it.points) {
    if (p.x - pad < x0) x0 = p.x - pad;
    if (p.y - pad < y0) y0 = p.y - pad;
    if (p.x + pad > x1) x1 = p.x + pad;
    if (p.y + pad > y1) y1 = p.y + pad;
  }
  return { x0, y0, x1, y1 };
}

/** A camera that centers on a region and fits it on screen, for clean reveal. */
export function cameraForRegion(region: Region, vp: { width: number; height: number }): Camera {
  const cx = region.x + region.width / 2;
  const cy = region.y + region.height / 2;
  let zoom = 1;
  if (region.width > 0 && region.height > 0) {
    zoom = Math.max(0.15, Math.min(8, Math.min(vp.width / region.width, vp.height / region.height) * 0.98));
  }
  return { x: cx, y: cy, zoom };
}

export function normalizedToWorld(nx: number, ny: number, region: Region): Point {
  return {
    x: region.x + (nx / NORMALIZED) * region.width,
    y: region.y + (ny / NORMALIZED) * region.height,
  };
}

export function worldToNormalized(p: Point, region: Region): Point {
  return {
    x: ((p.x - region.x) / region.width) * NORMALIZED,
    y: ((p.y - region.y) / region.height) * NORMALIZED,
  };
}

export function clampNormalized(v: number): number {
  return Math.max(-150, Math.min(1150, v));
}

export function screenToWorld(sx: number, sy: number, cam: Camera, vp: { width: number; height: number }): Point {
  return {
    x: cam.x + (sx - vp.width / 2) / cam.zoom,
    y: cam.y + (sy - vp.height / 2) / cam.zoom,
  };
}

export function worldToScreen(p: Point, cam: Camera, vp: { width: number; height: number }): Point {
  return {
    x: (p.x - cam.x) * cam.zoom + vp.width / 2,
    y: (p.y - cam.y) * cam.zoom + vp.height / 2,
  };
}

/** World-space rectangle currently visible, expanded by a small margin. */
export function visibleWorldRect(cam: Camera, vp: { width: number; height: number }, margin = 40): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  const hw = vp.width / 2 / cam.zoom;
  const hh = vp.height / 2 / cam.zoom;
  return {
    x0: cam.x - hw - margin,
    y0: cam.y - hh - margin,
    x1: cam.x + hw + margin,
    y1: cam.y + hh + margin,
  };
}

/** Scale factor that converts normalized drawing units into world units. */
export function normalizedScale(region: Region): number {
  return region.width / NORMALIZED;
}