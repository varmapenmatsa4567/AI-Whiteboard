"use client";

import { useWhiteboardStore } from "@/lib/store/whiteboard-store";
import { AiStatusBadge } from "./useAskAI";
import { PanelIcon, CloseIcon } from "./icons";
import BoardSwitcher from "./BoardSwitcher";

export default function TopBar() {
  const panelOpen = useWhiteboardStore((s) => s.panelOpen);
  const setPanelOpen = useWhiteboardStore((s) => s.setPanelOpen);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19l7-7 3 3-7 7-3-3z" />
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
            <path d="M2 2l7.586 7.586" />
          </svg>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-slate-900">AI Whiteboard</span>
          <span className="hidden text-[11px] text-slate-400 sm:block">
            Describe it — the AI draws it on the board
          </span>
        </div>
        <div className="ml-2 flex items-center gap-2">
          <div className="h-4 w-px bg-slate-200" />
          <BoardSwitcher />
          <div className="h-4 w-px bg-slate-200" />
          <AiStatusBadge />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden text-[11px] text-slate-400 lg:block">
          Draw with pen · <kbd className="rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-500">Space</kbd>+drag pan · scroll zoom
        </span>
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          {panelOpen ? <CloseIcon width={14} height={14} /> : <PanelIcon width={14} height={14} />}
          <span>{panelOpen ? "Hide chat" : "AI chat"}</span>
        </button>
      </div>
    </header>
  );
}