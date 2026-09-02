"use client";

import { useCallback } from "react";
import { useWhiteboardStore } from "@/lib/store/whiteboard-store";
import { liveEngine } from "./DrawingEngine";
import { computeRegion } from "@/lib/drawing/coordinates";
import { planToSteps, summarizeExisting, uid } from "@/lib/drawing/commands";
import type { DrawingSpeed } from "@/types/whiteboard";
import type { DrawingPlan } from "@/types/drawing";

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

  const ask = useCallback(async (rawPrompt: string) => {
    const trimmed = rawPrompt.trim();
    const s = useWhiteboardStore.getState();
    if (!trimmed || s.drawingBusy) return;

    s.addChat("user", trimmed);
    s.setBusy(true);
    s.setError(null);
    s.setPanelOpen(true);

    const region = computeRegion(s.camera, s.viewport);
    const existingDrawing = summarizeExisting(s.items, region);
    const conversation = s.chat.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    const requestIndex = s.chat.filter((m) => m.role === "user").length;

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
          requestIndex,
        }),
      });
      const data = (await res.json()) as PlanResponse;
      if (!res.ok || !data.ok || !data.plan) {
        throw new Error(data?.error ?? data?.detail ?? `Request failed (${res.status})`);
      }

      const { plan } = data;
      useWhiteboardStore.setState((state) => ({
        chat: [
          ...state.chat,
          { id: uid(), role: "assistant", content: plan.description || "Here you go.", provider: data.provider, ts: Date.now() },
        ],
      }));

      const steps = planToSteps(plan, region);
      const engine = liveEngine.current;
      if (engine) engine.playSteps(steps);
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
  }, []);

  const stop = useCallback(() => {
    liveEngine.current?.stopDrawing();
    useWhiteboardStore.getState().setBusy(false);
  }, []);

  return { ask, stop, drawingBusy, lastError: lastError ?? undefined };
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