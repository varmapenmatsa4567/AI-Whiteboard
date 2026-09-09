import type { DrawingAI, DrawingPlan, DrawingRequestContext } from "@/types/drawing";
import { MockDrawingAI } from "./mock-drawing-ai";
import { RealDrawingAI } from "./real-drawing-ai";
import { stabilizeLegacyPlan } from "../layout/legacy-plan-layout";

export type ProviderId = "auto" | "mock" | "openai";

function resolvedProvider(): ProviderId {
  const raw = (process.env.AI_PROVIDER ?? "auto").toLowerCase();
  if (raw === "mock" || raw === "openai") return raw;
  return "auto";
}

class LayoutAwareDrawingAI implements DrawingAI {
  readonly id: string;
  constructor(private readonly inner: DrawingAI) { this.id = inner.id; }
  async generateDrawing(request: DrawingRequestContext): Promise<DrawingPlan> {
    const plan = await this.inner.generateDrawing(request);
    return stabilizeLegacyPlan(plan);
  }
}

export function getDrawingAI(): DrawingAI {
  const provider = resolvedProvider();
  const ai = provider === "mock" ? new MockDrawingAI() : provider === "openai" ? new RealDrawingAI() : process.env.AI_API_KEY ? new RealDrawingAI() : new MockDrawingAI();
  return new LayoutAwareDrawingAI(ai);
}

export function describeProvider(): { provider: string; mock: boolean } {
  const mock = getDrawingAI().id === "mock";
  return { provider: mock ? "mock" : "openai", mock };
}