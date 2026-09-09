import type { DrawingAI, DrawingPlan, DrawingRequestContext } from "@/types/drawing";
import { extractJsonObject } from "./schema";
import { buildUserPrompt, SYSTEM_PROMPT, REPAIR_SYSTEM_PROMPT } from "./prompts";
import { parseSemanticDiagram } from "../layout/semantic-schema";
import { semanticToDrawingPlan } from "../layout/semantic-to-plan";

function env(name: string, fallback: string): string { const v = process.env[name]; return v && v.trim() !== "" ? v : fallback; }
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
export interface RealDrawingAIInit { apiKey?: string; baseUrl?: string; model?: string; jsonMode?: boolean; fetchFn?: typeof fetch; }

export class RealDrawingAI implements DrawingAI {
  readonly id = "openai";
  private readonly apiKey: string; private readonly baseUrl: string; private readonly model: string; private readonly jsonMode: boolean; private readonly fetchFn: typeof fetch;
  constructor(init: RealDrawingAIInit = {}) {
    this.apiKey = init.apiKey ?? env("AI_API_KEY", ""); this.baseUrl = (init.baseUrl ?? env("AI_BASE_URL", DEFAULT_BASE_URL)).replace(/\/+$/, ""); this.model = init.model ?? env("AI_MODEL", DEFAULT_MODEL); this.jsonMode = init.jsonMode ?? process.env.AI_JSON_MODE !== "0"; this.fetchFn = init.fetchFn ?? fetch;
  }
  async generateDrawing(request: DrawingRequestContext): Promise<DrawingPlan> {
    if (!this.apiKey) throw new Error("AI_API_KEY is not set. Add it to .env or set AI_PROVIDER=mock to use the local mock.");
    let lastError = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const body: Record<string, unknown> = { model: this.model, temperature: attempt === 0 ? 0.35 : 0.1, max_tokens: 8000, messages: [{ role: "system", content: attempt === 0 ? SYSTEM_PROMPT : `${SYSTEM_PROMPT}\n\n${REPAIR_SYSTEM_PROMPT}` }, { role: "user", content: buildUserPrompt(request) }] };
      if (this.jsonMode) body.response_format = { type: "json_object" };
      let res: Response;
      try { res = await this.fetchFn(`${this.baseUrl}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) }); }
      catch (e) { if ((e as Error).name === "TimeoutError") throw new Error("The AI provider timed out after 120s."); throw new Error(`Failed to reach AI provider: ${(e as Error).message}`); }
      if (!res.ok) { const detail = await res.text().catch(() => ""); throw new Error(`AI provider error (${res.status}): ${detail.slice(0, 300)}`); }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("AI provider returned an empty response.");
      try {
        const json = extractJsonObject(content);
        if (!json) throw new Error("No JSON object found in AI response.");
        return semanticToDrawingPlan(parseSemanticDiagram(json));
      } catch (e) {
        lastError = e instanceof Error ? e.message : "Invalid semantic diagram";
        if (attempt === 2) throw new Error(lastError);
      }
    }
    throw new Error(lastError || "AI provider failed to produce a valid semantic diagram.");
  }
}
