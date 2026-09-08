"use client";

import TopBar from "@/components/whiteboard/TopBar";
import DrawingToolbar from "@/components/whiteboard/DrawingToolbar";
import Whiteboard from "@/components/whiteboard/Whiteboard";
import AIInput from "@/components/whiteboard/AIInput";
import AIPanel from "@/components/whiteboard/AIPanel";
import SelectionPopover from "@/components/whiteboard/SelectionPopover";
import { useWhiteboardPersistence } from "@/lib/store/useWhiteboardPersistence";

export default function Home() {
  useWhiteboardPersistence();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white text-slate-900 antialiased">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <DrawingToolbar />
        <div className="relative min-w-0 flex-1">
          <Whiteboard />
          <SelectionPopover />
          <AIInput />
        </div>
        <AIPanel />
      </div>
    </div>
  );
}