import type { DrawingAI } from "@/types/drawing";
import { MockDrawingAI } from "./mock-drawing-ai";
import { RealDrawingAI } from "./real-drawing-ai";

export type ProviderId = "auto" | "mock" | "openai";

function resolvedProvider(): ProviderId {
  const raw = (process.env.AI_PROVIDER ?? "auto").toLowerCase();
  if (raw === "mock" || raw === "openai") return raw;
  return "auto";
}

/**
 * Live resolution of the configured AI drawing planner.
 * - openai  → talks to any OpenAI-compatible endpoint (AI_API_KEY required)
 * - mock    → local template-based planner (no key needed)
 * - auto    → mock when no key, real provider otherwise
 */
export function getDrawingAI(): DrawingAI {
  const provider = resolvedProvider();
  if (provider === "mock") return new MockDrawingAI();
  if (provider === "openai") return new RealDrawingAI();
  if (process.env.AI_API_KEY) return new RealDrawingAI();
  return new MockDrawingAI();
}

export function describeProvider(): { provider: string; mock: boolean } {
  const mock = getDrawingAI().id === "mock";
  return { provider: mock ? "mock" : "openai", mock };
}