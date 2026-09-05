import type { DrawingCommand, DrawingPlan, Point, Region } from "@/types/drawing";
import type { WhiteboardItem } from "@/types/whiteboard";
import {
  NORMALIZED,
  clampNormalized,
  normalizedScale,
  normalizedToWorld,
  worldToNormalized,
} from "./coordinates";
import { dedupe, resample } from "./smoothing";
import { INK } from "./renderer";

export interface PlannedStep {
  token: string;
  kind: "stroke" | "text" | "erase" | "pause";
  item?: WhiteboardItem;
  duration?: number;
  /** Optional narration spoken aloud while this step draws. */
  explain?: string;
}

let uidCounter = 0;
export function uid(): string {
  uidCounter += 1;
  return `w_${Date.now().toString(36)}_${uidCounter}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

function mapStroke(
  points: Point[],
  width: number | undefined,
  opacity: number | undefined,
  color: string | undefined,
  region: Region,
  seed: number
): WhiteboardItem {
  const mapped = points.map((p) => normalizedToWorld(clampNormalized(p.x), clampNormalized(p.y), region));
  const worldPerNorm = region.width / NORMALIZED;
  const spacing = Math.max(2, Math.min(worldPerNorm * 5, 14));
  const pts = dedupe(resample(mapped, spacing), 0.4);
  const widthWorld = Math.max(1, Math.min(40, width ?? 4));
  return { id: uid(), kind: "stroke", points: pts, width: widthWorld, opacity, color, seed };
}

function mapErase(x: number, y: number, width: number | undefined, region: Region, seed: number): WhiteboardItem {
  const scale = normalizedScale(region);
  const p = normalizedToWorld(clampNormalized(x), clampNormalized(y), region);
  const w = Math.max(4, Math.min(120, (width ?? 24) * scale));
  return { id: uid(), kind: "erase", points: [p], width: w, seed };
}

function mapText(
  x: number,
  y: number,
  text: string,
  fontSize: number | undefined,
  color: string | undefined,
  region: Region
): WhiteboardItem {
  const p = normalizedToWorld(clampNormalized(x), clampNormalized(y), region);
  const size = Math.max(8, Math.min(96, fontSize ?? 22));
  return { id: uid(), kind: "text", x: p.x, y: p.y, text: text.slice(0, 400), fontSize: size, color };
}

// ── Shapes ─────────────────────────────────────────────────────────────
// Geometry builders return outline polylines in the caller's coordinate
// space. They are shared by the AI plan path (normalized coords) and the
// user toolbar tools (world coords).

export type ShapeKind = "rect" | "ellipse" | "line" | "arrow" | "triangle";

export function rectOutline(x: number, y: number, w: number, h: number): Point[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
    { x, y },
  ];
}

export function ellipseOutline(cx: number, cy: number, rx: number, ry: number, segs = 48): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return out;
}

export function triangleOutline(p1: Point, p2: Point, p3: Point): Point[] {
  return [p1, p2, p3, p1];
}

export interface ArrowParts {
  shaft: Point[];
  head: Point[];
}

/** Split an arrow into a shaft (line) and a filled triangular head. */
export function arrowParts(x1: number, y1: number, x2: number, y2: number, headScale = 1): ArrowParts {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const head = Math.min(26, len * 0.3) * headScale;
  const tip = { x: x2, y: y2 };
  const left = { x: x2 - ux * head + px * head * 0.45, y: y2 - uy * head + py * head * 0.45 };
  const right = { x: x2 - ux * head - px * head * 0.45, y: y2 - uy * head - py * head * 0.45 };
  return { shaft: [{ x: x1, y: y1 }, tip], head: [tip, left, right, tip] };
}

function mapOutlineToWorld(outline: Point[], region: Region): Point[] {
  const scale = normalizedScale(region);
  const spacing = Math.max(2, Math.min(scale * 5, 14));
  const mapped = outline.map((p) => normalizedToWorld(clampNormalized(p.x), clampNormalized(p.y), region));
  return dedupe(resample(mapped, spacing), 0.4);
}

function shapeWidthWorld(sw: number | undefined): number {
  return Math.max(1, Math.min(40, sw ?? 4));
}

function mapShape(
  outline: Point[],
  closed: boolean,
  strokeWidth: number | undefined,
  color: string | undefined,
  fill: string | undefined,
  region: Region,
  seed: number
): WhiteboardItem {
  const pts = mapOutlineToWorld(outline, region);
  return {
    id: uid(),
    kind: "shape",
    points: pts,
    width: shapeWidthWorld(strokeWidth),
    closed,
    color,
    fill,
    seed,
  };
}

function mapLine(c: Extract<DrawingCommand, { type: "line" }>, region: Region, seed: number): WhiteboardItem {
  return mapShape(
    [{ x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }],
    false,
    c.strokeWidth,
    c.color,
    undefined,
    region,
    seed
  );
}

function mapRect(c: Extract<DrawingCommand, { type: "rect" }>, region: Region, seed: number): WhiteboardItem {
  return mapShape(rectOutline(c.x, c.y, c.width, c.height), true, c.strokeWidth, c.color, c.fill, region, seed);
}

function mapEllipse(c: Extract<DrawingCommand, { type: "ellipse" }>, region: Region, seed: number): WhiteboardItem {
  return mapShape(ellipseOutline(c.cx, c.cy, c.rx, c.ry), true, c.strokeWidth, c.color, c.fill, region, seed);
}

function mapTriangle(c: Extract<DrawingCommand, { type: "triangle" }>, region: Region, seed: number): WhiteboardItem {
  return mapShape(
    [{ x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }, { x: c.x3, y: c.y3 }],
    true,
    c.strokeWidth,
    c.color,
    undefined,
    region,
    seed
  );
}

/**
 * Build a WhiteboardItem directly in world coordinates (used by the user's
 * toolbar shape tools). No normalized mapping — points are used as-is.
 */
export function shapeWorldItem(
  outline: Point[],
  closed: boolean,
  width: number,
  color?: string,
  fill?: string
): WhiteboardItem {
  const pts = dedupe(resample(outline, 3), 0.4);
  return { id: uid(), kind: "shape", points: pts, width, closed, color, fill, seed: 0 };
}

/**
 * Build shape items from a drag between two world points for one of the
 * user-facing shape tools. Returns one or more committed items (an arrow is
 * two: shaft + filled head).
 */
export function shapeFromDrag(kind: ShapeKind, a: Point, b: Point, color?: string): WhiteboardItem[] {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const w = x1 - x0;
  const h = y1 - y0;
  const width = 4;
  const spine = { x: (x0 + x1) / 2, y: y0 };
  if (kind === "rect") {
    return [shapeWorldItem(rectOutline(x0, y0, w, h), true, width, color)];
  }
  if (kind === "ellipse") {
    return [shapeWorldItem(ellipseOutline((x0 + x1) / 2, (y0 + y1) / 2, w / 2, h / 2, 64), true, width, color)];
  }
  if (kind === "line") {
    return [shapeWorldItem([{ x: a.x, y: a.y }, { x: b.x, y: b.y }], false, width, color)];
  }
  if (kind === "triangle") {
    return [shapeWorldItem([spine, { x: x0, y: y1 }, { x: x1, y: y1 }], true, width, color)];
  }
  if (kind === "arrow") {
    const { shaft, head } = arrowParts(a.x, a.y, b.x, b.y, 1);
    return [
      shapeWorldItem(shaft, false, width, color),
      shapeWorldItem(head, true, width, color, color),
    ];
  }
  return [];
}

/**
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
      const seedN = hashSeed(token + s.toString());
      if (c.type === "stroke") {
        steps.push({
          token,
          kind: "stroke",
          item: mapStroke(c.points, c.width, c.opacity, c.color, region, seedN),
          explain: c.explain,
        });
      } else if (c.type === "text") {
        steps.push({ token, kind: "text", item: mapText(c.x, c.y, c.text, c.fontSize, c.color, region), explain: c.explain });
      } else if (c.type === "line") {
        steps.push({ token, kind: "stroke", item: mapLine(c, region, seedN), explain: c.explain });
      } else if (c.type === "rect") {
        steps.push({ token, kind: "stroke", item: mapRect(c, region, seedN), explain: c.explain });
      } else if (c.type === "ellipse") {
        steps.push({ token, kind: "stroke", item: mapEllipse(c, region, seedN), explain: c.explain });
      } else if (c.type === "triangle") {
        steps.push({ token, kind: "stroke", item: mapTriangle(c, region, seedN), explain: c.explain });
      } else if (c.type === "arrow") {
        const { shaft, head } = arrowParts(c.x1, c.y1, c.x2, c.y2);
        steps.push({ token: uid(), kind: "stroke", item: mapShape(shaft, false, c.strokeWidth, c.color, undefined, region, seedN), explain: c.explain });
        steps.push({ token: uid(), kind: "stroke", item: mapShape(head, true, c.strokeWidth, c.color, c.color ?? INK, region, seedN) });
      } else if (c.type === "erase") {
        steps.push({ token, kind: "erase", item: mapErase(c.x, c.y, c.width, region, seedN), explain: c.explain });
      } else if (c.type === "pause") {
        steps.push({ token, kind: "pause", duration: Math.max(0, Math.min(12000, c.duration)), explain: c.explain });
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
      lines.push(
        `${spaced}- stroke: points ${norm.join(" ")}, width ${it.width.toFixed(1)}${it.color ? `, color ${it.color}` : ""}`
      );
    } else if (it.kind === "text") {
      const q = worldToNormalized({ x: it.x, y: it.y }, region);
      lines.push(
        `${spaced}- text "${it.text}" at [${q.x.toFixed(1)},${q.y.toFixed(1)}], fontSize ${it.fontSize.toFixed(1)}${
          it.color ? `, color ${it.color}` : ""
        }`
      );
    } else if (it.kind === "shape") {
      const kw = it.closed ? "shape" : "line";
      lines.push(
        `${spaced}- ${kw}: ${it.points.length} outline pts, width ${it.width.toFixed(1)}${
          it.color ? `, color ${it.color}` : ""
        }${it.fill ? `, fill ${it.fill}` : ""}`
      );
    } else {
      lines.push(`${spaced}- erased/clear region`);
    }
  }
  if (items.length > n) lines.push(`${spaced}- ... and ${items.length - n} more items`);
  return lines.join("\n");
}