"use client";

import { useWhiteboardStore } from "@/lib/store/whiteboard-store";
import { ZoomInIcon, ZoomOutIcon, FitIcon } from "./icons";
import { liveEngine } from "./DrawingEngine";

export default function DrawingToolbar() {
  const tool = useWhiteboardStore((s) => s.tool);
  const setTool = useWhiteboardStore((s) => s.setTool);
  const canUndo = useWhiteboardStore((s) => s.history.length > 0);
  const canRedo = useWhiteboardStore((s) => s.future.length > 0);
  const hasItems = useWhiteboardStore((s) => s.items.length > 0);
  const camera = useWhiteboardStore((s) => s.camera);
  const planStep = useWhiteboardStore((s) => s.planStep);

  const actions = {
    undo: () => useWhiteboardStore.getState().undo(),
    redo: () => useWhiteboardStore.getState().redo(),
    clear: () => useWhiteboardStore.getState().clearCanvas(),
    fit: () => useWhiteboardStore.getState().fitDrawing(),
    zoom: (f: number) => useWhiteboardStore.getState().zoomBy(f),
    stepBack: () => liveEngine.current?.stepBack(),
    stepForward: () => liveEngine.current?.stepForward(),
  };

  const tools = [
    { id: "draw" as const, label: "Draw", key: "D", icon: <PenGlyph /> },
    { id: "erase" as const, label: "Erase", key: "E", icon: <EraserGlyph /> },
    { id: "select" as const, label: "Circle / Select", key: "S", icon: <SelectGlyph /> },
    { id: "pan" as const, label: "Pan", key: "H", icon: <HandGlyph /> },
  ];

  const shapes = [
    { id: "rect" as const, label: "Rectangle", key: "R", icon: <RectGlyph /> },
    { id: "ellipse" as const, label: "Ellipse", key: "O", icon: <EllipseGlyph /> },
    { id: "line" as const, label: "Line", key: "L", icon: <LineGlyph /> },
    { id: "arrow" as const, label: "Arrow", key: "A", icon: <ArrowGlyph /> },
    { id: "triangle" as const, label: "Triangle", key: "T", icon: <TriangleGlyph /> },
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

      <div className="flex flex-col gap-1">
        {shapes.map((t) => (
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

      <div className="flex flex-col items-center gap-0.5">
        <button
          title="Previous step (⇧⌘←)"
          onClick={actions.stepBack}
          disabled={!planStep?.canBack}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-200/70 disabled:opacity-30"
        >
          <StepBackGlyph />
        </button>
        <button
          title="Next step (⇧⌘→)"
          onClick={actions.stepForward}
          disabled={!planStep?.canForward}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-200/70 disabled:opacity-30"
        >
          <StepForwardGlyph />
        </button>
        <div className="min-h-[13px] select-none text-center text-[9px] font-semibold tabular-nums text-slate-400">
          {planStep ? `${planStep.index}/${planStep.total}` : "\u2013/\u2013"}
        </div>
      </div>

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
function SelectGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" strokeDasharray="3 2.4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
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
function RectGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5" width="16" height="14" rx="1" />
    </svg>
  );
}
function EllipseGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="12" rx="8" ry="5.5" />
    </svg>
  );
}
function LineGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20 20 4" />
    </svg>
  );
}
function ArrowGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h14" />
      <path d="m14 6 6 6-6 6" />
    </svg>
  );
}
function StepBackGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 5v14" />
      <path d="M20 6.5 10.5 12l9.5 5.5z" />
    </svg>
  );
}
function StepForwardGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 5v14" />
      <path d="M4 6.5 13.5 12 4 17.5z" />
    </svg>
  );
}
function TriangleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4 21 19H3z" />
    </svg>
  );
}