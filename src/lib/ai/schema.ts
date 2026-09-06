import { z } from "zod";
import { jsonrepair } from "jsonrepair";
import type { DrawingCommand, DrawingPlan } from "@/types/drawing";
import { NORMALIZED } from "../drawing/coordinates";

const PointSchema = z.object({
  x: z.number().min(-800).max(4000),
  y: z.number().min(-800).max(4000),
});

const Explain = z.string().max(500).optional();

const StrokeSchema = z.object({
  type: z.literal("stroke"),
  points: z.array(PointSchema).min(2).max(4096),
  width: z.number().min(0.5).max(80).optional(),
  opacity: z.number().min(0).max(1).optional(),
  pressure: z.array(z.number().min(0).max(1)).max(4096).optional(),
  color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "color must be a hex color like #e11d48").optional(),
  explain: Explain,
});

const TextSchema = z.object({
  type: z.literal("text"),
  x: z.number().min(-800).max(4000),
  y: z.number().min(-800).max(4000),
  text: z.string().max(500),
  fontSize: z.number().min(6).max(200).optional(),
  color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "color must be a hex color like #e11d48").optional(),
  explain: Explain,
});

const HEX = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "color must be a hex color like #e11d48")
  .optional();

const LineSchema = z.object({
  type: z.literal("line"),
  x1: z.number().min(-800).max(4000),
  y1: z.number().min(-800).max(4000),
  x2: z.number().min(-800).max(4000),
  y2: z.number().min(-800).max(4000),
  strokeWidth: z.number().min(0.5).max(80).optional(),
  color: HEX,
  explain: Explain,
});

const RectSchema = z.object({
  type: z.literal("rect"),
  x: z.number().min(-800).max(4000),
  y: z.number().min(-800).max(4000),
  width: z.number().min(0.5).max(2000),
  height: z.number().min(0.5).max(2000),
  strokeWidth: z.number().min(0.5).max(80).optional(),
  color: HEX,
  fill: HEX,
  explain: Explain,
});

const EllipseSchema = z.object({
  type: z.literal("ellipse"),
  cx: z.number().min(-800).max(4000),
  cy: z.number().min(-800).max(4000),
  rx: z.number().min(0.5).max(2000),
  ry: z.number().min(0.5).max(2000),
  strokeWidth: z.number().min(0.5).max(80).optional(),
  color: HEX,
  fill: HEX,
  explain: Explain,
});

const TriangleSchema = z.object({
  type: z.literal("triangle"),
  x1: z.number().min(-800).max(4000),
  y1: z.number().min(-800).max(4000),
  x2: z.number().min(-800).max(4000),
  y2: z.number().min(-800).max(4000),
  x3: z.number().min(-800).max(4000),
  y3: z.number().min(-800).max(4000),
  strokeWidth: z.number().min(0.5).max(80).optional(),
  color: HEX,
  explain: Explain,
});

const ArrowSchema = z.object({
  type: z.literal("arrow"),
  x1: z.number().min(-800).max(4000),
  y1: z.number().min(-800).max(4000),
  x2: z.number().min(-800).max(4000),
  y2: z.number().min(-800).max(4000),
  strokeWidth: z.number().min(0.5).max(80).optional(),
  color: HEX,
  explain: Explain,
});

const EraseSchema = z.object({
  type: z.literal("erase"),
  x: z.number().min(-800).max(4000),
  y: z.number().min(-800).max(4000),
  width: z.number().min(2).max(300).optional(),
  explain: Explain,
});

const PauseSchema = z.object({
  type: z.literal("pause"),
  duration: z.number().min(0).max(20000).optional().default(400),
  explain: Explain,
});

const GroupSchema = z.object({
  type: z.literal("group"),
  commands: z.array(z.lazy(() => CommandSchema as z.ZodType<unknown>)).max(200),
  explain: Explain,
});

export const CommandSchema: z.ZodType<DrawingCommand> = z.union([
  StrokeSchema,
  TextSchema,
  LineSchema,
  RectSchema,
  EllipseSchema,
  TriangleSchema,
  ArrowSchema,
  EraseSchema,
  PauseSchema,
  GroupSchema,
]) as unknown as z.ZodType<DrawingCommand>;

export const DrawingPlanSchema: z.ZodType<DrawingPlan> = z.object({
  description: z.string().max(2000).optional().default(""),
  commands: z.array(CommandSchema as z.ZodType<DrawingPlan["commands"][number]>).max(400),
});

export type ParsedPlan = { plan: DrawingPlan; raw: string };

/**
 * Normalize a parsed JSON command into our canonical discriminated-union form.
 * Providers differ in how they serialize commands:
 *   - canonical:  {"type":"stroke","points":[{x,y},...],...}
 *   - keyed:      {"stroke":{"points":[[x,y],...],"width":6}}
 *   - points may be objects ({x,y}) or short arrays ([x,y]).
 * Returns null when the shape is unrecognizable.
 */
function normalizePoints(value: unknown): { x: number; y: number }[] | null {
  if (!Array.isArray(value)) return null;
  const out: { x: number; y: number }[] = [];
  for (const p of value) {
    if (!Array.isArray(p) || p.length < 2 || typeof p[0] !== "number" || typeof p[1] !== "number") return null;
    out.push({ x: p[0], y: p[1] });
  }
  return out;
}

function normalizeCommand(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;

  // Canonical form already has a type and any points are objects — pass through.
  if (typeof obj.type === "string") {
    if (obj.points !== undefined && Array.isArray(obj.points)) {
      const pts = normalizePoints(obj.points);
      if (pts) obj.points = pts as unknown;
    }
    return obj;
  }

  // Keyed form: exactly one key that is a known command type.
  const keyTypes = ["stroke", "text", "line", "rect", "ellipse", "triangle", "arrow", "erase", "pause", "group"];
  const keys = Object.keys(obj).filter((k) => keyTypes.includes(k));
  if (keys.length === 1) {
    const key = keys[0];
    const inner = obj[key] as Record<string, unknown> | null | undefined;
    if (inner === null || typeof inner !== "object" || Array.isArray(inner)) {
      return raw;
    }
    const merged: Record<string, unknown> = { ...inner, type: key };
    if (merged.points !== undefined && Array.isArray(merged.points)) {
      const pts = normalizePoints(merged.points);
      if (pts) merged.points = pts as unknown;
    }
    if (key === "group" && Array.isArray(merged.commands)) {
      merged.commands = merged.commands.map(normalizeCommand);
    }
    return merged;
  }

  return raw;
}

/** Normalize a whole plan object's `commands` array before schema validation. */
function normalizePlan(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.commands)) {
    obj.commands = obj.commands.map(normalizeCommand) as unknown;
  }
  return obj;
}

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/** Accumulate the normalized-space bounding box of a command (recursing into groups). */
function commandBounds(command: DrawingCommand, box: Bounds | null): Bounds | null {
  const grow = (x: number, y: number) => {
    if (box) {
      if (x < box.minX) box.minX = x;
      if (y < box.minY) box.minY = y;
      if (x > box.maxX) box.maxX = x;
      if (y > box.maxY) box.maxY = y;
    } else {
      box = { minX: x, minY: y, maxX: x, maxY: y };
    }
  };
  switch (command.type) {
    case "stroke":
      for (const p of command.points) grow(p.x, p.y);
      break;
    case "text":
    case "erase":
      grow(command.x, command.y);
      break;
    case "line":
    case "arrow":
      grow(command.x1, command.y1);
      grow(command.x2, command.y2);
      break;
    case "rect":
      grow(command.x, command.y);
      grow(command.x + command.width, command.y + command.height);
      break;
    case "ellipse":
      grow(command.cx - command.rx, command.cy - command.ry);
      grow(command.cx + command.rx, command.cy + command.ry);
      break;
    case "triangle":
      grow(command.x1, command.y1);
      grow(command.x2, command.y2);
      grow(command.x3, command.y3);
      break;
    case "group":
      for (const sub of command.commands) box = commandBounds(sub, box);
      break;
    case "pause":
      break;
  }
  return box;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Re-map a command by scale `s` plus translation, preserving shape geometry. */
function scaleCommand(command: DrawingCommand, s: number, tx: number, ty: number): DrawingCommand {
  const both = (x: number, y: number) => [round3(x * s + tx), round3(y * s + ty)] as const;
  switch (command.type) {
    case "stroke":
      return { ...command, points: command.points.map((p) => ({ ...p, ...both(p.x, p.y) })) };
    case "text":
      {
        const [x, y] = both(command.x, command.y);
        return { ...command, x, y };
      }
    case "erase":
      {
        const [x, y] = both(command.x, command.y);
        return { ...command, x, y };
      }
    case "line":
    case "arrow":
      {
        const [x1, y1] = both(command.x1, command.y1);
        const [x2, y2] = both(command.x2, command.y2);
        return { ...command, x1, y1, x2, y2 };
      }
    case "rect":
      return {
        ...command,
        x: round3(command.x * s + tx),
        y: round3(command.y * s + ty),
        width: round3(command.width * s),
        height: round3(command.height * s),
      };
    case "ellipse":
      return {
        ...command,
        cx: round3(command.cx * s + tx),
        cy: round3(command.cy * s + ty),
        rx: round3(command.rx * s),
        ry: round3(command.ry * s),
      };
    case "triangle":
      {
        const [x1, y1] = both(command.x1, command.y1);
        const [x2, y2] = both(command.x2, command.y2);
        const [x3, y3] = both(command.x3, command.y3);
        return { ...command, x1, y1, x2, y2, x3, y3 };
      }
    case "group":
      return { ...command, commands: command.commands.map((sub) => scaleCommand(sub, s, tx, ty)) };
    case "pause":
      return command;
  }
}

/**
 * Models occasionally plan content that overshoots the 0..1000 normalized sheet
 * (e.g. a very tall diagram stacking several sections with y exceeding 1000).
 * Rather than reject or clip such plans, scale and re-center them so the whole
 * drawing lands on the sheet and stays fully visible.
 */
export function fitPlanToSheet(plan: DrawingPlan, pad = 40): DrawingPlan {
  const commands = plan.commands ?? [];
  let box: Bounds | null = null;
  for (const c of commands) box = commandBounds(c, box);
  if (!box) return plan;

  if (box.minX >= -pad && box.minY >= -pad && box.maxX <= NORMALIZED + pad && box.maxY <= NORMALIZED + pad) {
    return plan;
  }

  const width = Math.max(1, box.maxX - box.minX);
  const height = Math.max(1, box.maxY - box.minY);
  const scale = Math.min((NORMALIZED - pad * 2) / width, (NORMALIZED - pad * 2) / height);
  const tx = NORMALIZED / 2 - (scale * (box.minX + box.maxX)) / 2;
  const ty = NORMALIZED / 2 - (scale * (box.minY + box.maxY)) / 2;
  return { ...plan, commands: commands.map((c) => scaleCommand(c, scale, tx, ty)) };
}

export class AIParseError extends Error {
  readonly raw: string | null;
  constructor(message: string, raw: string | null) {
    super(message);
    this.name = "AIParseError";
    this.raw = raw;
  }
}

/** Extract the first balanced JSON block from model output (handles fences/text). */
export function extractJsonObject(text: string): string | null {
  if (!text) return null;
  const t = text.trim();

  // Strip a fenced code block, if present.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : t;

  // Fast path: the whole thing is already valid JSON.
  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    /* fall through */
  }

  // Collect every balanced {…} region, tolerating leading/trailing prose.
  const regions: { start: number; end: number }[] = [];
  {
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < candidate.length; i++) {
      const ch = candidate[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") {
        if (start === -1) start = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (start !== -1 && depth === 0) {
          regions.push({ start, end: i });
          start = -1;
        }
      }
    }
  }

  // Try the largest balanced region first, then progressively trim nested ones.
  regions.sort((a, b) => b.end - b.start - (a.end - a.start));
  for (const { start, end } of regions) {
    const slice = candidate.slice(start, end + 1);
    try {
      if (JSON.parse(slice)) return slice;
    } catch {
      /* try repair */
    }
    try {
      jsonrepair(slice);
      return slice;
    } catch {
      /* keep trying other candidates */
    }
  }

  // Last resort: run jsonrepair over the whole candidate.
  try {
    const repaired = jsonrepair(candidate);
    if (repaired) return repaired;
  } catch {
    /* give up */
  }
  return null;
}

/**
 * Never trust model output:
 * 1. safely extract a JSON object,
 * 2. validate it against the strict Zod schema,
 * 3. fail with a descriptive error otherwise.
 */
export function parseDrawingPlan(content: string): ParsedPlan {
  const json = extractJsonObject(content);
  if (!json) throw new AIParseError("The model did not return a JSON object.", content.slice(0, 2000));
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch (e) {
    throw new AIParseError(`Invalid JSON returned by the model: ${(e as Error).message}`, json.slice(0, 2000));
  }
  const normalized = normalizePlan(obj);
  const result = DrawingPlanSchema.safeParse(normalized);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new AIParseError(`AI output failed schema validation — ${issues}`, json.slice(0, 2000));
  }
  return { plan: fitPlanToSheet(result.data), raw: json };
}