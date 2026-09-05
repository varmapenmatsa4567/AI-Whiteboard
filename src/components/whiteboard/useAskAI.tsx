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
 * A ready-to-paste prompt for ChatGPT that produces the JSON this app can draw.
 * The user copies this, gets an answer from ChatGPT, and pastes the JSON back.
 */
export function buildChatGPTPrompt(prompt: string, selectionContext: string[] = []): string {
  const lines: string[] = [];
  lines.push(`You are a whiteboard drawing planner. Translate the user's request into a JSON object of drawing commands that a program will replay as hand-drawn whiteboard strokes. Do NOT output images, code, SVGs, markdown fences, or any text other than the JSON object.`);
  lines.push(``);
  lines.push(`Each request draws on a fresh blank sheet of an infinite whiteboard. The app reserves an empty area for your drawing, so it will never overlap anything already on the board — never redraw existing content. Keep your picture nicely centered on your sheet with a modest margin around the edges so nothing is clipped, and keep labels small enough to fit comfortably (fontSize 18–34), spaced so they never collide with each other or your own shapes.`);
  lines.push(``);
  lines.push(`Use colors: include an optional "color" field (full six-digit hex, e.g. "#e11d48") on strokes and labels to add meaning (outlines dark "#1e293b", specific parts in distinct colors). Keep a small, tasteful palette.`);
  if (selectionContext.length > 0) {
    lines.push(``);
    lines.push(`USER-SELECTED ITEMS (the user circled these on the board and asked to use them as context for this request. The request below refers to them — reference these labels and treat them as the focus of the answer; you may redraw them enlarged as the centerpiece of your fresh sheet):`);
    for (const label of selectionContext) {
      lines.push(`- ${label}`);
    }
  }
  lines.push(``);
  lines.push(`Request from the user: ${prompt}`);

lines.push(``);
  lines.push(`Return ONLY valid JSON of this exact shape:`);
  lines.push(`{"description": "short summary", "commands": [COMMAND, ...]}`);
  lines.push(``);
  lines.push(`COMMAND is one of:`);
  lines.push(`- {"type":"stroke","points":[{"x":..,"y":..}, ...],"width":4,"color":"#1e293b"}  (freehand polyline; width marker size 1-20)`);
  lines.push(`- {"type":"text","x":..,"y":..,"text":"label","fontSize":22,"color":"#1e293b"}`);
  lines.push(`- {"type":"line","x1":..,"y1":..,"x2":..,"y2":..,"strokeWidth":4,"color":"#1e293b"}`);
  lines.push(`- {"type":"rect","x":..,"y":..,"width":..,"height":..,"strokeWidth":4,"color":"#1e293b","fill":"#e2e8f0"}  (x,y top-left; "fill" optional)`);
  lines.push(`- {"type":"ellipse","cx":..,"cy":..,"rx":..,"ry":..,"strokeWidth":4,"color":"#1e293b","fill":"#e2e8f0"}  (rx==ry for a circle; "fill" optional)`);
  lines.push(`- {"type":"triangle","x1":..,"y1":..,"x2":..,"y2":..,"x3":..,"y3":..,"strokeWidth":4,"color":"#1e293b"}`);
  lines.push(`- {"type":"arrow","x1":..,"y1":..,"x2":..,"y2":..,"strokeWidth":4,"color":"#1e293b"}  (tail to tip)`);
  lines.push(`- {"type":"erase","x":..,"y":..,"width":24}`);
  lines.push(`- {"type":"pause","duration":400}`);
  lines.push(`- {"type":"group","commands":[more commands]}`);
  lines.push(``);
  lines.push(`NARRATION: Every command may also include an optional "explain" field — a short spoken sentence (1 sentence, under ~140 characters) narrated aloud by a voice-over while that step draws. Write it like a teacher explaining at a whiteboard: warm, encouraging, present tense, and focused on WHY each step matters, with transitions that connect the lesson (e.g. "Now that we have the body, let's add the wheels", "See how the roof slopes down? That gives the car its shape"). Keep it conversational and easy to read aloud — never read the JSON back. Examples: {"type":"rect","x":100,"y":100,"width":200,"height":150,"explain":"Now I draw the main box; this is where everything connects"} or "I'm drawing the body of the car", "Here's the front window, right behind the hood", "Now I point to the middle of the list". Add "explain" to most steps so the narration flows while the drawing plays.`);
  lines.push(``);
  lines.push(`Use the precise shapes (rect, ellipse, line, triangle, arrow) for boxes, circles, borders, connectors and flow-arrows; use freehand "stroke" for curves and organic details.`);
  lines.push(``);
  lines.push(`Plan logically, draw large-to-small, use multiple strokes, and pause between major steps. Respond with ONLY the JSON object.`);
  return lines.join("\n");
}