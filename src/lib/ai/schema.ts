import { z } from "zod";
import { jsonrepair } from "jsonrepair";
import type { DrawingCommand, DrawingPlan } from "@/types/drawing";

const PointSchema = z.object({
  x: z.number().min(-200).max(1200),
  y: z.number().min(-200).max(1200),
});

const StrokeSchema = z.object({
  type: z.literal("stroke"),
  points: z.array(PointSchema).min(2).max(4096),
  width: z.number().min(0.5).max(80).optional(),
  opacity: z.number().min(0).max(1).optional(),
  pressure: z.array(z.number().min(0).max(1)).max(4096).optional(),
});

const TextSchema = z.object({
  type: z.literal("text"),
  x: z.number().min(-200).max(1200),
  y: z.number().min(-200).max(1200),
  text: z.string().max(500),
  fontSize: z.number().min(6).max(200).optional(),
});

const EraseSchema = z.object({
  type: z.literal("erase"),
  x: z.number().min(-200).max(1200),
  y: z.number().min(-200).max(1200),
  width: z.number().min(2).max(300).optional(),
});

const PauseSchema = z.object({
  type: z.literal("pause"),
  duration: z.number().min(0).max(20000).optional().default(400),
});

const GroupSchema = z.object({
  type: z.literal("group"),
  commands: z.array(z.lazy(() => CommandSchema as z.ZodType<unknown>)).max(200),
});

export const CommandSchema: z.ZodType<DrawingCommand> = z.union([
  StrokeSchema,
  TextSchema,
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
  const keyTypes = ["stroke", "text", "erase", "pause", "group"];
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
  return { plan: result.data, raw: json };
}