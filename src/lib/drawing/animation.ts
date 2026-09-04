import type { DrawingSpeed } from "@/types/whiteboard";

/** World-space px drawn per second for each speed. */
export const SPEED_PX: Record<DrawingSpeed, number> = {
  slow: 140,
  normal: 300,
  fast: 560,
};

export function pxPerSecond(speed: DrawingSpeed): number {
  return SPEED_PX[speed];
}

export function speedMultiplier(speed: DrawingSpeed): number {
  return SPEED_PX[speed] / SPEED_PX.normal;
}

export function strokeDurationMs(points: { x: number; y: number }[], speed: DrawingSpeed): number {
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) {
    len += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  const px = Math.max(pxPerSecond(speed), 30);
  return Math.max(120, (len / px) * 1000);
}

export function textDurationMs(text: string, speed: DrawingSpeed): number {
  const charsPerMs = 0.11 * speedMultiplier(speed);
  return Math.max(120, text.length / Math.max(0.01, charsPerMs));
}

/** Constant idle beat between strokes — feels like a teacher pausing. Scales down on faster speeds. */
export function interStrokeDelayMs(speed: DrawingSpeed = "normal"): number {
  const base = 120 + Math.random() * 100;
  return base / Math.max(1, speedMultiplier(speed));
}

export function easeInOut(f: number): number {
  return f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
}

/** Very short ease-in so strokes accelerate off the page naturally. */
export function easeInOutSoft(f: number): number {
  return f <= 0 ? 0 : f >= 1 ? 1 : f * f * (3 - 2 * f);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}