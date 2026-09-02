"use client";

import { useEffect, useRef } from "react";
import { useWhiteboardStore } from "@/lib/store/whiteboard-store";
import { useAskAI, SpeedControl, EXAMPLES } from "./useAskAI";
import { CloseIcon, SparkIcon } from "./icons";

export default function AIPanel() {
  const open = useWhiteboardStore((s) => s.panelOpen);
  const setOpen = useWhiteboardStore((s) => s.setPanelOpen);
  const chat = useWhiteboardStore((s) => s.chat);
  const drawingBusy = useWhiteboardStore((s) => s.drawingBusy);
  const { ask, stop } = useAskAI();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length, drawingBusy]);

  if (!open) return null;

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <SparkIcon width={16} height={16} className="text-slate-700" />
          <span className="text-sm font-semibold text-slate-800">AI Whiteboard</span>
        </div>
        <div className="flex items-center gap-2">
          <SpeedControl />
          <button
            onClick={() => setOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Collapse panel"
          >
            <CloseIcon width={15} height={15} />
          </button>
        </div>
      </div>

      {drawingBusy && (
        <div className="flex items-center justify-between border-b border-sky-100 bg-sky-50 px-4 py-2">
          <span className="text-xs font-medium text-sky-700">The AI is drawing…</span>
          <button
            onClick={stop}
            className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100"
          >
            Stop
          </button>
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {chat.length === 0 ? (
          <>
            <div className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Suggestions</div>
            <div className="flex flex-col gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => void ask(ex)}
                  disabled={drawingBusy}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-600 transition-colors hover:border-slate-300 hover:bg-white disabled:opacity-50"
                >
                  {ex}
                </button>
              ))}
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
              The AI plans a drawing in normalized coordinates, the board animates each stroke with a whiteboard-marker look,
              and you can keep drawing by hand on top. Use <kbd className="font-mono">Space</kbd> to pan, scroll to zoom.
            </p>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            {chat.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="self-end max-w-[85%] rounded-2xl rounded-br-sm bg-slate-900 px-3 py-2 text-sm text-white">
                  {m.content}
                </div>
              ) : (
                <div key={m.id} className="self-start max-w-[85%]">
                  <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {m.content}
                    {m.provider && (
                      <span className="mt-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                        {m.provider === "mock" ? "local mock" : "AI"}
                      </span>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </aside>
  );
}