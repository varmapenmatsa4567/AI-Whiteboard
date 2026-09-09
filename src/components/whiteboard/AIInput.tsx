"use client";

import { useMemo, useState } from "react";
import { useAskAI, buildChatGPTPrompt } from "./useAskAI";
import { useWhiteboardStore } from "@/lib/store/whiteboard-store";
import { parseSemanticDiagram } from "@/lib/layout/semantic-schema";
import { semanticToDrawingPlan } from "@/lib/layout/semantic-to-plan";
import { SendIcon, StopIcon, SparkIcon, CloseIcon } from "./icons";

export default function AIInput() {
  const { ask, askChatGPT, stop, drawingBusy } = useAskAI();
  const selectionContext = useWhiteboardStore((s) => s.selectionContext);
  const removeSelectionContext = useWhiteboardStore((s) => s.removeSelectionContext);
  const clearSelectionContext = useWhiteboardStore((s) => s.clearSelectionContext);
  const [mode, setMode] = useState<"ask" | "chatgpt">("ask");
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [chatGptResponse, setChatGptResponse] = useState("");
  const [copied, setCopied] = useState(false);

  const promptText = useMemo(
    () => buildChatGPTPrompt(value.trim() || "Draw a colorful diagram", selectionContext),
    [value, selectionContext]
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v || drawingBusy) return;
    void ask(v);
    setValue("");
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = promptText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const drawPasted = async () => {
    if (drawingBusy || !chatGptResponse.trim()) return;
    const input = chatGptResponse.trim();

    try {
      // First try the new semantic format. Once it parses successfully, do NOT
      // fall back to the legacy parser if layout fails: that would hide the
      // actual layout error behind "missing commands".
      try {
        const semantic = parseSemanticDiagram(input);
        const plan = semanticToDrawingPlan(semantic);
        const ok = await askChatGPT(JSON.stringify(plan));
        if (ok) {
          setChatGptResponse("");
          setOpen(false);
        }
        return;
      } catch (semanticError) {
        // Only continue to the legacy parser when this is genuinely not a
        // semantic diagram. If it looks like semantic JSON, surface the real
        // error instead of silently treating it as a legacy drawing plan.
        const looksSemantic = /["'](?:nodes|edges|direction)["']\s*:/.test(input);
        if (looksSemantic) {
          const message = semanticError instanceof Error ? semanticError.message : String(semanticError);
          useWhiteboardStore.getState().setError(`Semantic diagram could not be drawn. ${message}`);
          return;
        }
      }

      // Backward compatibility for older ChatGPT responses containing
      // {"description":"...","commands":[...]}.
      const ok = await askChatGPT(input);
      if (ok) {
        setChatGptResponse("");
        setOpen(false);
      }
    } catch {
      // askChatGPT already surfaces the parser error through the store.
    }
  };

  const toggle = () => {
    setMode((m) => (m === "ask" ? "chatgpt" : "ask"));
    setOpen(false);
  };

  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 z-20 w-[min(680px,calc(100%-2rem))] -translate-x-1/2">
      {mode === "chatgpt" && open && (
        <div className="mb-2 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-800">Paste what ChatGPT gave you</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Ask ChatGPT with the prompt, then paste its semantic JSON answer here. The whiteboard handles layout automatically — no API key needed.
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
              <CloseIcon width={16} height={16} />
            </button>
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Step 1 · Copy this prompt into ChatGPT</span>
              <button onClick={copyPrompt} className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-slate-700">{copied ? "Copied ✓" : "Copy prompt"}</button>
            </div>
            <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={2} readOnly placeholder="Type what you want to draw in the box below, then copy the generated prompt." className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 outline-none focus:border-slate-400" />
            <p className="mt-1.5 text-[11px] leading-snug text-slate-400">{promptText.slice(0, 180)}…</p>
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Step 2 · Paste ChatGPT’s semantic JSON response</span>
            <textarea value={chatGptResponse} onChange={(e) => setChatGptResponse(e.target.value)} rows={7} placeholder='{"description":"...","direction":"top-to-bottom","nodes":[...],"edges":[...],"groups":[]}' className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-white p-2 font-mono text-xs text-slate-800 outline-none focus:border-slate-400" />
            <button onClick={drawPasted} disabled={drawingBusy || !chatGptResponse.trim()} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400">
              <SparkIcon width={16} height={16} />
              {drawingBusy ? "Drawing…" : "Draw it"}
            </button>
          </div>
        </div>
      )}

      {selectionContext.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur">
          <span className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">In context</span>
          {selectionContext.map((label, i) => (
            <span key={`${label}_${i}`} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
              {label}
              <button type="button" onClick={() => removeSelectionContext(i)} className="text-slate-400 transition-colors hover:text-slate-600" aria-label={`Remove "${label}" from context`} title="Remove from context"><CloseIcon width={11} height={11} /></button>
            </span>
          ))}
          {selectionContext.length > 1 && <button type="button" onClick={clearSelectionContext} className="ml-auto text-[11px] font-medium text-slate-400 transition-colors hover:text-slate-600">Clear all</button>}
        </div>
      )}

      <form onSubmit={submit} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-lg backdrop-blur">
        <button type="button" onClick={toggle} className={`rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${mode === "ask" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`} title="Ask the AI with your provider">Ask AI</button>
        <button type="button" onClick={toggle} className={`rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${mode === "chatgpt" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`} title="Paste a response you got from ChatGPT">ChatGPT</button>

        {mode === "ask" ? (
          <>
            <SparkIcon width={16} height={16} className="ml-1 shrink-0 text-slate-400" />
            <input value={value} onChange={(e) => setValue(e.target.value)} disabled={drawingBusy} placeholder={drawingBusy ? "The AI is drawing…" : 'Ask the AI to draw: "Draw a car", "Explain binary search"…'} className="min-w-0 flex-1 bg-transparent px-1 text-sm text-slate-800 placeholder-slate-400 outline-none disabled:cursor-not-allowed" />
            {drawingBusy ? (
              <button type="button" onClick={stop} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white transition-colors hover:bg-slate-700" title="Stop drawing"><StopIcon width={16} height={16} /></button>
            ) : (
              <button type="submit" disabled={!value.trim()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white transition-colors hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400" title="Ask the AI"><SendIcon width={16} height={16} /></button>
            )}
          </>
        ) : (
          <>
            <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Describe something to draw (used to build the ChatGPT prompt)" className="min-w-0 flex-1 bg-transparent px-1 text-sm text-slate-800 placeholder-slate-400 outline-none" />
            <button type="button" onClick={() => setOpen((o) => !o)} disabled={!value.trim()} className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400">
              <SparkIcon width={16} height={16} />
              {open ? "Close" : "Get prompt"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
