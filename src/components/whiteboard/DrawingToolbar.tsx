"use client";

import { useWhiteboardStore } from "@/lib/store/whiteboard-store";
import { ZoomInIcon, ZoomOutIcon, FitIcon } from "./icons";

export default function DrawingToolbar() {
  const tool = useWhiteboardStore((s) => s.tool);
  const setTool = useWhiteboardStore((s) => s.setTool);
  const canUndo = useWhiteboardStore((s) => s.history.length > 0);
  const canRedo = useWhiteboardStore((s) => s.future.length > 0);
  const hasItems = useWhiteboardStore((s) => s.items.length > 0);
  const camera = useWhiteboardStore((s) => s.camera);

  const actions = {
    undo: () => useWhiteboardStore.getState().undo(),
    redo: () => useWhiteboardStore.getState().redo(),
    clear: () => useWhiteboardStore.getState().clearCanvas(),
    fit: () => useWhiteboardStore.getState().fitDrawing(),
    zoom: (f: number) => useWhiteboardStore.getState().zoomBy(f),
  };

  const tools = [
    { id: "draw" as const, label: "Draw", key: "D", icon: <PenGlyph /> },
    { id: "erase" as const, label: "Erase", key: "E", icon: <EraserGlyph /> },
    { id: "pan" as const, label: "Pan", key: "H", icon: <HandGlyph /> },
  ];

  return (
    <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-slate-50 py-2">
      <div className="flex flex-col gap-1">
        {tools.map((t) => (
          <button
            key={t.id}
            title={`${t.label} (${t.key})`}
            onClick={() => setTool(t.id)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              tool === t.id ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-slate-200/70 hover:text-slate-800"
            }`}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className="my-1 h-px w-6 bg-slate-200" />

      <button
        title="Undo (⌘Z)"
        onClick={actions.undo}
        disabled={!canUndo}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-200/70 disabled:opacity-30"
      >
        <UndoGlyph />
      </button>
      <button
        title="Redo (⇧⌘Z)"
        onClick={actions.redo}
        disabled={!canRedo}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-200/70 disabled:opacity-30"
      >
        <RedoGlyph />
      </button>
      <button
        title="Clear board"
        onClick={actions.clear}
        disabled={!hasItems}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
      >
        <TrashGlyph />
      </button>

      <div className="flex-1" />

      <button title="Zoom out (−)" onClick={() => actions.zoom(1 / 1.25)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70">
        <ZoomOutIcon width={15} height={15} />
      </button>
      <button
        title="Fit drawing (F)"
        onClick={actions.fit}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70"
      >
        <FitIcon width={15} height={15} />
      </button>
      <button title="Zoom in (+)" onClick={() => actions.zoom(1.25)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70">
        <ZoomInIcon width={15} height={15} />
      </button>
      <div className="mb-1 mt-0.5 select-none text-center text-[9px] font-semibold tabular-nums text-slate-400">
        {Math.round(camera.zoom * 100)}%
      </div>
    </div>
  );
}

function PenGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <path d="M2 2l7.586 7.586" />
      <circle cx="11" cy="11" r="2" />
    </svg>
  );
}
function EraserGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3.4c.6-.6 1.5-.6 2.1 0l2.5 2.5c.6.6.6 1.5 0 2.1L9.3 19.3c-.6.6-1.5.6-2.1 0l-2.5-2.5c-.6-.6-.6-1.5 0-2.1L16 3.4z" />
      <path d="M9 14l6-6" />
      <path d="M13 20h8" />
    </svg>
  );
}
function HandGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 11V6.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M11 10V5a1.5 1.5 0 0 1 3 0v5" />
      <path d="M14 10.5V6.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M17 10.5v-2a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6.5 7H12c-3 0-4.5-1-5.5-3.5L4 11.5a1.2 1.2 0 0 1 2-1.2l2 3" />
    </svg>
  );
}
function UndoGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 6 6v0a6 6 0 0 1-6 6H8" />
    </svg>
  );
}
function RedoGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0-6 6v0a6 6 0 0 0 6 6h6" />
    </svg>
  );
}
function TrashGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}