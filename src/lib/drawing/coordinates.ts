import type { Point, Region } from "@/types/drawing";
import type { Camera } from "@/types/whiteboard";

/** Normalized space is always 0..1000 on both axes. */
export const NORMALIZED = 1000;

export const SPRING = 1.4;

export function computeRegion(cam: Camera, vp: { width: number; height: number }): Region {
  const w = Math.max(vp.width / cam.zoom, 800);
  const h = Math.max(vp.height / cam.zoom, 600);
  const m = SPRING;
  return {
    x: cam.x - (w * m) / 2,
    y: cam.y - (h * m) / 2,
    width: w * m,
    height: h * m,
  };
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