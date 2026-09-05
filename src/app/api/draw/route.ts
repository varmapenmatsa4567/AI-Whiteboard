import type { DrawingRequestContext } from "@/types/drawing";
import { getDrawingAI } from "@/lib/ai/provider";
import { AIParseError } from "@/lib/ai/schema";
import { z } from "zod";

const RequestSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  canvas: z
    .object({ width: z.number().min(1).max(20000), height: z.number().min(1).max(20000) })
    .optional(),
  region: z.object({
    x: z.number().min(-1e6).max(1e6),
    y: z.number().min(-1e6).max(1e6),
    width: z.number().min(1).max(1e6),
    height: z.number().min(1).max(1e6),
  }),
  existingDrawing: z.string().max(20000).optional(),
  conversation: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .max(30)
    .optional(),
  selectionContext: z.array(z.string().min(1).max(2000)).max(50).optional(),
  requestIndex: z.number().int().min(0).optional(),
});

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

/**
 * POST /api/draw
 * Browser → route → AI provider (the API key never reaches the browser).
 */
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: "Request body must be valid JSON." }, 400);
  }

  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return json(
      { ok: false, error: `Invalid request — ${issue ? `${issue.path.join(".")}: ${issue.message}` : "unknown"}` },
      400
    );
  }

  const input = parsed.data;
  const context: DrawingRequestContext = {
    prompt: input.prompt,
    canvas: input.canvas ?? { width: 1200, height: 800 },
    region: input.region,
    existingDrawing: input.existingDrawing,
    conversation: input.conversation,
    selectionContext: input.selectionContext,
    requestIndex: input.requestIndex,
  };

  try {
    const ai = getDrawingAI();
    const plan = await ai.generateDrawing(context);
    return json({ ok: true, provider: ai.id, plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (err instanceof AIParseError) {
      return json({ ok: false, error: message, detail: err.raw?.slice(0, 4000) ?? null }, 422);
    }
    return json({ ok: false, error: message }, 502);
  }
}