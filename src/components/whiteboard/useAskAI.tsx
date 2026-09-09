"use client";

import { useCallback } from "react";
import { useWhiteboardStore } from "@/lib/store/whiteboard-store";
import { liveEngine } from "./DrawingEngine";
import { cameraForRegion, nextDrawingRegion } from "@/lib/drawing/coordinates";
import { planToSteps, summarizeExisting, uid } from "@/lib/drawing/commands";
import { parseDrawingPlan } from "@/lib/ai/schema";
import type { DrawingSpeed } from "@/types/whiteboard";
import type { DrawingPlan } from "@/types/drawing";
import type { Region } from "@/types/drawing";

type PlanResponse = {
  ok: boolean;
  plan?: DrawingPlan;
  provider?: string;
  error?: string;
  detail?: string;
};

export function useAskAI() {
  const drawingBusy = useWhiteboardStore((s) => s.drawingBusy);
  const lastError = useWhiteboardStore((s) => s.lastError);

  const playPlan = useCallback(
    (plan: DrawingPlan, region: Region, provider?: string, descriptionOverride?: string) => {
      useWhiteboardStore.setState((state) => ({
        chat: [
          ...state.chat,
          {
            id: uid(),
            role: "assistant",
            content: descriptionOverride || plan.description || "Here you go.",
            provider,
            ts: Date.now(),
          },
        ],
        camera: cameraForRegion(region, state.viewport),
      }));
      const steps = planToSteps(plan, region);
      const engine = liveEngine.current;
      if (engine) engine.playSteps(steps);
    },
    []
  );

  /** Give the next drawing its own sheet of empty canvas so it never overlaps existing content. */
  const pickRegion = useCallback((region?: Region): Region => {
    if (region) return region;
    const s = useWhiteboardStore.getState();
    return nextDrawingRegion(s.items, s.viewport, s.camera);
  }, []);

  const ask = useCallback(async (rawPrompt: string) => {
    const trimmed = rawPrompt.trim();
    const s = useWhiteboardStore.getState();
    if (!trimmed || s.drawingBusy) return;

    s.addChat("user", trimmed);
    s.setBusy(true);
    s.setError(null);
    s.setPanelOpen(true);

    const region = nextDrawingRegion(s.items, s.viewport, s.camera);
    const existingDrawing = summarizeExisting(s.items, region);
    const conversation = s.chat.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    const requestIndex = s.chat.filter((m) => m.role === "user").length;
    const selectionContext = s.selectionContext;

    try {
      const res = await fetch("/api/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          canvas: { width: s.viewport.width, height: s.viewport.height },
          region,
          existingDrawing,
          conversation,
          selectionContext,
          requestIndex,
        }),
      });
      const data = (await res.json()) as PlanResponse;
      if (!res.ok || !data.ok || !data.plan) {
        throw new Error(data?.error ?? data?.detail ?? `Request failed (${res.status})`);
      }

      const { plan } = data;
      playPlan(plan, region, data.provider);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      useWhiteboardStore.setState((state) => ({
        chat: [
          ...state.chat,
          { id: uid(), role: "assistant", content: `I couldn't draw that. ${message}`, ts: Date.now() },
        ],
      }));
      s.setError(message);
    } finally {
      s.setBusy(false);
    }
  }, [playPlan]);

  /**
   * Render a ChatGPT-produced drawing plan that the user pasted in.
   * Works fully offline — no API key required. Reuses the same parser the
   * provider path uses (tolerant JSON extraction, repair and normalization).
   */
  const askChatGPT = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      const s = useWhiteboardStore.getState();
      if (!trimmed || s.drawingBusy) return false;

      s.setBusy(true);
      s.setError(null);
      s.setPanelOpen(false);
      try {
        const { plan } = parseDrawingPlan(trimmed);
        playPlan(plan, pickRegion(), "chatgpt", plan.description || "Drew from ChatGPT output.");
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        s.setError(`Couldn't parse ChatGPT output. ${message}`);
        throw err;
      } finally {
        s.setBusy(false);
      }
    },
    [playPlan, pickRegion]
  );

  const stop = useCallback(() => {
    liveEngine.current?.stopDrawing();
    useWhiteboardStore.getState().setBusy(false);
  }, []);

  return { ask, askChatGPT, stop, drawingBusy, lastError: lastError ?? undefined };
}

export function AiStatusBadge() {
  const drawingBusy = useWhiteboardStore((s) => s.drawingBusy);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        drawingBusy
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${drawingBusy ? "animate-pulse bg-sky-500" : "bg-emerald-500"}`}
      />
      {drawingBusy ? "AI is thinking…" : "AI ready"}
    </span>
  );
}

export function SpeedControl() {
  const speed = useWhiteboardStore((s) => s.speed);
  const setSpeed = useWhiteboardStore((s) => s.setSpeed);
  const options: DrawingSpeed[] = ["slow", "normal", "fast"];
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => setSpeed(o)}
          className={`rounded-md px-2 py-1 text-[11px] font-medium capitalize transition-colors ${
            speed === o ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export const EXAMPLES = [
  "Draw a simple car",
  "Explain binary search",
  "Draw a house with a chimney and a tree",
  "Draw a heart and label its parts",
  "Explain TCP 3-way handshake",
];

/**
 * A ready-to-paste prompt for ChatGPT that produces the semantic diagram JSON
 * consumed by the whiteboard layout engine. ChatGPT describes WHAT belongs in
 * the diagram; the application decides positions, sizes, wrapping, collisions,
 * and connector routing.
 */
export function buildChatGPTPrompt(prompt: string, selectionContext: string[] = []): string {
  const lines: string[] = [];

  lines.push(`You are the semantic planning layer of an AI whiteboard.`);
  lines.push(`Your job is to understand WHAT the user wants to learn or visualize and describe the semantic structure of the diagram.`);
  lines.push(`The whiteboard application is responsible for deciding WHERE and HOW BIG everything is.`);
  lines.push(``);
  lines.push(`The application will automatically handle text measurement, text wrapping, node sizing, node positioning, spacing, collision avoidance, viewport fitting, connector routing, and layout validation.`);
  lines.push(``);
  lines.push(`NEVER output pixel coordinates, dimensions, drawing commands, SVG, HTML, canvas instructions, or manually routed connector paths.`);
  lines.push(`NEVER output x, y, x1, y1, x2, y2, width, height, cx, cy, rx, ry, points, fontSize, strokeWidth, or any other geometry.`);
  lines.push(`Do not estimate how large a box should be. The application measures the content and sizes the box automatically.`);
  lines.push(``);
  lines.push(`Return ONLY one valid JSON object. Do not use markdown fences. Do not add commentary before or after the JSON.`);
  lines.push(``);
  lines.push(`JSON SHAPE:`);
  lines.push(`{"description":"short summary of the diagram","direction":"top-to-bottom","nodes":[...],"edges":[...],"groups":[...]}`);
  lines.push(``);
  lines.push(`direction must be exactly one of: "top-to-bottom", "left-to-right", or "freeform". Prefer top-to-bottom for explanations and flows, and left-to-right for pipelines or sequences.`);
  lines.push(``);
  lines.push(`NODE SHAPE:`);
  lines.push(`{"id":"unique-id","type":"card","title":"Short title","description":"Useful explanation","items":["Important point 1","Important point 2"]}`);
  lines.push(`Use concise titles. Put explanatory detail in description and items instead of making titles long.`);
  lines.push(`Each node must have a stable unique semantic id. For an existing concept that is being expanded, preserve its existing semantic id when that id is provided in the context.`);
  lines.push(``);
  lines.push(`EDGE SHAPE:`);
  lines.push(`{"id":"unique-edge-id","source":"source-node-id","target":"target-node-id","label":"optional relationship"}`);
  lines.push(`Edges describe relationships only. The application decides where and how the connector is drawn.`);
  lines.push(``);
  lines.push(`GROUP SHAPE:`);
  lines.push(`{"id":"unique-group-id","title":"Group title","children":["node-id-1","node-id-2"]}`);
  lines.push(`Use groups when several nodes clearly belong to the same conceptual area. Groups are optional.`);
  lines.push(``);
  lines.push(`CONTENT RULES:`);
  lines.push(`1. Focus on teaching the requested concept clearly.`);
  lines.push(`2. Prefer a coherent structure over many tiny nodes.`);
  lines.push(`3. Create nodes for meaningful concepts, components, steps, or entities.`);
  lines.push(`4. Use edges to express data flow, dependency, sequence, communication, or other relationships.`);
  lines.push(`5. Keep titles short enough to work well as card headings.`);
  lines.push(`6. Use descriptions and items when the user asks for an explanation or more detail.`);
  lines.push(`7. Do not duplicate concepts just to place them somewhere else.`);
  lines.push(`8. If the user asks to explain, expand, or add detail to an existing item, modify or enrich that semantic node rather than inventing coordinates.`);
  lines.push(`9. If the user asks to explain something "in the same place", interpret that as keeping the same semantic node/id. Do not output a position.`);
  lines.push(`10. If the request needs a new related concept, create a new semantic node and connect it with an edge.`);
  lines.push(`11. Do not include geometry or renderer-specific properties even if the user asks for them.`);
  lines.push(``);

  if (selectionContext.length > 0) {
    lines.push(`EXISTING USER-SELECTED CONTEXT:`);
    for (const label of selectionContext) lines.push(`- ${label}`);
    lines.push(`Treat these selected items as the focus of the request. Preserve their semantic identity when possible.`);
    lines.push(``);
  }

  lines.push(`USER REQUEST:`);
  lines.push(prompt);
  lines.push(``);
  lines.push(`Return ONLY the JSON object now.`);

  return lines.join("\n");
}
