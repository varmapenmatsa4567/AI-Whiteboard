"use client";

import TopBar from "@/components/whiteboard/TopBar";
import DrawingToolbar from "@/components/whiteboard/DrawingToolbar";
import Whiteboard from "@/components/whiteboard/Whiteboard";
import AIInput from "@/components/whiteboard/AIInput";
import AIPanel from "@/components/whiteboard/AIPanel";

export default function Home() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white text-slate-900 antialiased">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <DrawingToolbar />
        <div className="relative min-w-0 flex-1">
          <Whiteboard />
          <AIInput />
        </div>
        <AIPanel />
      </div>
    </div>
  );
}