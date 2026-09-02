import type { Point } from "@/types/drawing";

const MAX_POINTS = 8192;

export function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pathLength(points: Point[]): number {
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) len += dist(points[i], points[i + 1]);
  return len;
}

/**
 * Resample a polyline so points are approximately `spacing` apart.
 * Produces evenly spaced points which makes progressive animation and
 * width modulation look natural and keeps the point count bounded.
 */
export function resample(points: Point[], spacing: number): Point[] {
  if (points.length < 2) return points.slice();
  const out: Point[] = [points[0]];
  let acc = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const seg = dist(a, b);
    if (seg <= 0) continue;
    let t = 0;
    while (acc + seg * (1 - t) > spacing) {
      const step = (spacing - acc) / seg;
      t += step;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      acc = 0;
      if (out.length >= MAX_POINTS - 1) {
        out.push(b);
        return out;
      }
    }
    acc += seg * (1 - t);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Remove consecutive near-duplicate points. */
export function dedupe(points: Point[], minDist = 0.5): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || dist(last, p) >= minDist) out.push(p);
  }
  if (out.length === 0) return points.slice();
  return out;
}

export function normalizePolyline(points: Point[]): Point[] {
  return dedupe(points).slice(0, MAX_POINTS);
}

export function sampleAt(points: Point[], length: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  let rest = length;
  for (let i = 0; i < points.length - 1; i++) {
    const d = dist(points[i], points[i + 1]);
    if (rest <= d) {
      const t = d === 0 ? 0 : rest / d;
      return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t };
    }
    rest -= d;
  }
  return points[points.length - 1];
}

/** Fraction of each segment covered to reach `length` along the polyline. */
export function revealCut(points: Point[], length: number): Point[] {
  if (points.length <= 2) return points.slice();
  const cut = sampleAt(points, length);
  const out: Point[] = [];
  let rest = length;
  for (let i = 0; i < points.length - 1; i++) {
    const d = dist(points[i], points[i + 1]);
    if (rest >= d) {
      out.push(points[i]);
      rest -= d;
    } else {
      out.push(points[i]);
      out.push(cut);
      return out;
    }
  }
  out.push(points[points.length - 1]);
  return out;
}