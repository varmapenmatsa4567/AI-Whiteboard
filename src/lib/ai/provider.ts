import type { DrawingAI, DrawingPlan, DrawingRequestContext } from "@/types/drawing";
import { MockDrawingAI } from "./mock-drawing-ai";
import { RealDrawingAI } from "./real-drawing-ai";
import { stabilizeLegacyPlan } from "../layout/legacy-plan-layout";
import { planToSemantic } from "../layout/model";
import { semanticToDrawingPlan } from "../layout/semantic-to-plan";
import { semanticMockForPrompt } from "../layout/mock-semantic";

export type ProviderId = "auto" | "mock" | "openai";
function resolvedProvider(): ProviderId { const raw = (process.env.AI_PROVIDER ?? "auto").toLowerCase(); return raw === "mock" || raw === "openai" ? raw : "auto"; }

class LayoutAwareDrawingAI implements DrawingAI {
  readonly id: string;
  constructor(private readonly inner: DrawingAI) { this.id = inner.id; }
  async generateDrawing(request: DrawingRequestContext): Promise<DrawingPlan> {
    if (this.inner.id === "mock") {
      const semanticFixture = semanticMockForPrompt(request.prompt);
      if (semanticFixture) return semanticToDrawingPlan(semanticFixture);
    }
    const plan = await this.inner.generateDrawing(request);
    if (this.inner.id === "openai") return plan;
    const semantic = planToSemantic(plan);
    if (semantic) {
      try { return semanticToDrawingPlan(semantic); }
      catch { /* keep the offline template if it is not safely convertible */ }
    }
    return stabilizeLegacyPlan(plan);
  }
}

export function getDrawingAI(): DrawingAI {
  const provider = resolvedProvider();
  const ai = provider === "mock" ? new MockDrawingAI() : provider === "openai" ? new RealDrawingAI() : process.env.AI_API_KEY ? new RealDrawingAI() : new MockDrawingAI();
  return new LayoutAwareDrawingAI(ai);
}
export function describeProvider(): { provider: string; mock: boolean } { const mock = getDrawingAI().id === "mock"; return { provider: mock ? "mock" : "openai", mock }; }
