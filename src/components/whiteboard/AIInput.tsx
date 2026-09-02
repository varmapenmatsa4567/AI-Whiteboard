"use client";

import { useState } from "react";
import { useAskAI } from "./useAskAI";
import { SendIcon, StopIcon, SparkIcon } from "./icons";

export default function AIInput() {
  const { ask, stop, drawingBusy } = useAskAI();
  const [value, setValue] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v || drawingBusy) return;
    void ask(v);
    setValue("");
  };

  return (
    <form
      onSubmit={submit}
      className="pointer-events-auto absolute bottom-4 left-1/2 z-20 w-[min(680px,calc(100%-2rem))] -translate-x-1/2"
    >
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-lg backdrop-blur">
        <SparkIcon width={16} height={16} className="ml-2 shrink-0 text-slate-400" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={drawingBusy}
          placeholder={
            drawingBusy
              ? "The AI is drawing…"
              : 'Ask the AI to draw: "Draw a car", "Explain binary search", "Add wheels to the car"…'
          }
          className="min-w-0 flex-1 bg-transparent px-1 text-sm text-slate-800 placeholder-slate-400 outline-none disabled:cursor-not-allowed"
        />
        {drawingBusy ? (
          <button
            type="button"
            onClick={stop}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white transition-colors hover:bg-slate-700"
            title="Stop drawing"
          >
            <StopIcon width={16} height={16} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!value.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white transition-colors hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400"
            title="Ask the AI"
          >
            <SendIcon width={16} height={16} />
          </button>
        )}
      </div>
    </form>
  );
}