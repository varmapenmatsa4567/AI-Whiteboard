import type { DrawingPlan, Point, Region } from "@/types/drawing";
import type { WhiteboardItem } from "@/types/whiteboard";
import {
  clampNormalized,
  normalizedScale,
  normalizedToWorld,
  worldToNormalized,
} from "./coordinates";
import { dedupe, resample } from "./smoothing";

export interface PlannedStep {
  token: string;
  kind: "stroke" | "text" | "erase" | "pause";
  item?: WhiteboardItem;
  duration?: number;
}

let uidCounter = 0;
export function uid(): string {
  uidCounter += 1;
  return `w_${Date.now().toString(36)}_${uidCounter}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function mulberry32(a: number): () => number {
  let seed = a >>> 0;
  return () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Small procedural wobble so AI strokes have a hand-drawn feel.
 * Deterministic per (points, seed) so the progressive reveal matches the
 * final committed stroke exactly.
 */
export function applyHandDrawnNoise(points: Point[], amp: number, seed: number): Point[] {
  if (points.length < 3 || amp <= 0.0001) return points;
  const rng = mulberry32(seed);
  const phaseX = rng() * Math.PI * 2;
  const phaseY = rng() * Math.PI * 2;
  const n = points.length;
  const out: Point[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const taper = Math.min(1, i / 5, (n - 1 - i) / 5);
    const o = (rng() - 0.5) * 2 * amp * taper;
    const wave = (Math.sin(i * 0.42 + phaseX) + Math.sin(i * 0.17 + phaseY)) * 0.5 * amp * taper;
    out[i] = { x: points[i].x + o + wave, y: points[i].y - o * 0.6 + wave * 0.4 };
  }
  return out;
}

function mapStroke(points: Point[], width: number | undefined, opacity: number | undefined, region: Region, seed: number): WhiteboardItem {
  const scale = normalizedScale(region);
  const mapped = points.map((p) => normalizedToWorld(clampNormalized(p.x), clampNormalized(p.y), region));
  const spacing = Math.max(2, Math.min(scale * 5, 14));
  let pts = dedupe(resample(mapped, spacing), 0.4);
  if (pts.length < 2) pts = mapped.slice(0, 2);
  const noiseAmp = scale * 1.4;
  pts = applyHandDrawnNoise(pts, noiseAmp, seed);
  const widthWorld = Math.max(1, Math.min(40, (width ?? 4) * scale));
  return { id: uid(), kind: "stroke", points: pts, width: widthWorld, opacity, seed };
}

function mapErase(x: number, y: number, width: number | undefined, region: Region, seed: number): WhiteboardItem {
  const scale = normalizedScale(region);
  const p = normalizedToWorld(clampNormalized(x), clampNormalized(y), region);
  const w = Math.max(4, Math.min(120, (width ?? 24) * scale));
  return { id: uid(), kind: "erase", points: [p], width: w, seed };
}

function mapText(x: number, y: number, text: string, fontSize: number | undefined, region: Region): WhiteboardItem {
  const scale = normalizedScale(region);
  const p = normalizedToWorld(clampNormalized(x), clampNormalized(y), region);
  const size = Math.max(8, Math.min(160, (fontSize ?? 22) * scale));
  return { id: uid(), kind: "text", x: p.x, y: p.y, text: text.slice(0, 400), fontSize: size };
}

/**
 * Layer 2 — the drawing command engine.
 * Convert a normalized drawing plan into world-space steps the canvas can replay.
 */
export function planToSteps(plan: DrawingPlan, region: Region, seed?: number): PlannedStep[] {
  const s = seed ?? (Date.now() & 0xffffffff);
  const steps: PlannedStep[] = [];
  const walk = (commands: DrawingPlan["commands"]) => {
    for (const c of commands) {
      if (c.type === "group") {
        walk(c.commands);
        continue;
      }
      const token = uid();
      if (c.type === "stroke") {
        steps.push({ token, kind: "stroke", item: mapStroke(c.points, c.width, c.opacity, region, hashSeed(token + s.toString())) });
      } else if (c.type === "text") {
        steps.push({ token, kind: "text", item: mapText(c.x, c.y, c.text, c.fontSize, region) });
      } else if (c.type === "erase") {
        steps.push({ token, kind: "erase", item: mapErase(c.x, c.y, c.width, region, hashSeed(token + s.toString())) });
      } else if (c.type === "pause") {
        steps.push({ token, kind: "pause", duration: Math.max(0, Math.min(12000, c.duration)) });
      }
    }
  };
  walk(plan.commands ?? []);
  return steps;
}

/**
 * Build a concise normalized summary of existing content so the AI can add to
 * or modify the board instead of drawing into a void.
 */
export function summarizeExisting(items: WhiteboardItem[], region: Region, maxItems = 34, maxPoints = 26): string {
  const n = Math.min(items.length, maxItems);
  if (n === 0) return "(board is empty)";
  const lines: string[] = [];
  const spaced = " ".repeat(2);
  for (let i = 0; i < n; i++) {
    const it = items[i];
    if (it.kind === "stroke") {
      const pts = resample(it.points, Math.max(2, Math.hypot(it.points[0]?.x || 0, it.points[0]?.y || 0) + 1)).slice(0, maxPoints);
      const norm = pts.slice(0, maxPoints).map((p) => {
        const q = worldToNormalized(p, region);
        return `[${q.x.toFixed(1)},${q.y.toFixed(1)}]`;
      });
      lines.push(`${spaced}- stroke: points ${norm.join(" ")}, width ${it.width.toFixed(1)}`);
    } else if (it.kind === "text") {
      const q = worldToNormalized({ x: it.x, y: it.y }, region);
      lines.push(`${spaced}- text "${it.text}" at [${q.x.toFixed(1)},${q.y.toFixed(1)}], fontSize ${it.fontSize.toFixed(1)}`);
    } else {
      lines.push(`${spaced}- erased/clear region`);
    }
  }
  if (items.length > n) lines.push(`${spaced}- ... and ${items.length - n} more items`);
  return lines.join("\n");
}