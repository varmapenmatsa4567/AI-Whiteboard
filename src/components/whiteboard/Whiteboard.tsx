"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWhiteboardStore } from "@/lib/store/whiteboard-store";
import { DrawingEngine, liveEngine } from "./DrawingEngine";

import ObjectToolbar from "./ObjectToolbar";

type Modality = "draw" | "shape" | "select" | "pan" | "pinch" | null;

interface PinchState {
  dist: number;
  midX: number;
  midY: number;
}

export default function Whiteboard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<DrawingEngine | null>(null);
  const [ready, setReady] = useState(false);

  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const modeRef = useRef<Modality>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const spaceRef = useRef(false);

  const setTool = useWhiteboardStore((s) => s.setTool);
  const tool = useWhiteboardStore((s) => s.tool);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let engine: DrawingEngine;
    try {
      engine = new DrawingEngine(canvas);
    } catch (err) {
      console.error("Failed to create drawing engine", err);
      return;
    }
    engineRef.current = engine;
    liveEngine.current = engine;
    const rafId = requestAnimationFrame(() => setReady(true));

    const applySize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      engine.resize(width, height);
      useWhiteboardStore.getState().setViewport({ width, height });
    };
    applySize();
    const ro = new ResizeObserver(applySize);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const canvasRect = useCallback(() => canvasRef.current?.getBoundingClientRect() ?? null, []);

  const enterPinch = () => {
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return;
    pinchRef.current = {
      dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
      midX: (pts[0].x + pts[1].x) / 2,
      midY: (pts[0].y + pts[1].y) / 2,
    };
    modeRef.current = "pinch";
    engineRef.current?.cancelStroke();
  };

  const updatePinch = () => {
    const pts = [...pointersRef.current.values()].slice(0, 2);
    if (pts.length < 2 || !pinchRef.current) return;
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const midX = (pts[0].x + pts[1].x) / 2;
    const midY = (pts[0].y + pts[1].y) / 2;
    const prev = pinchRef.current;
    const rect = canvasRect();
    if (!rect) return;
    if (prev.dist > 0) {
      const factor = dist / Math.max(prev.dist, 4);
      if (Math.abs(factor - 1) > 0.001) {
        useWhiteboardStore.getState().zoomBy(factor, { x: prev.midX - rect.left, y: prev.midY - rect.top }, { width: rect.width, height: rect.height });
      }
    }
    useWhiteboardStore.getState().panBy(midX - prev.midX, midY - prev.midY);
    pinchRef.current = { dist, midX, midY };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const rect = canvasRect();
    if (!rect) return;
    e.preventDefault();
    if (e.pointerType === "mouse" && e.button === 2) return;

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (pointersRef.current.size >= 2) {
      enterPinch();
      return;
    }

    const middlePan = e.pointerType === "mouse" && e.button === 1;
    const spacePan = spaceRef.current;
    if (middlePan || spacePan || tool === "pan") {
      modeRef.current = "pan";
      return;
    }

    const world = engineRef.current?.screenToWorld(e.clientX, e.clientY, rect);

    if (tool === "select") {
      modeRef.current = "select";
      if (world) {
        // Try to grab a resize handle or an existing object.
        // If nothing is hit (empty space click), start a marquee selection instead.
        const hit = engineRef.current?.startObjectDragOrHandle(world, e.shiftKey);
        if (!hit) {
          engineRef.current?.startSelection(world, e.altKey ? "lasso" : "ellipse");
        }
      }
      return;
    }

    const isShape = tool === "rect" || tool === "ellipse" || tool === "line" || tool === "arrow" || tool === "darrow" || tool === "triangle";
    if (tool !== "draw" && tool !== "erase" && !isShape) return;

    modeRef.current = isShape ? "shape" : "draw";
    if (world) {
      if (isShape) engineRef.current?.startShape(world, tool);
      else engineRef.current?.startStroke(world, tool);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = canvasRect();
    if (!rect) return;
    const prev = pointersRef.current.get(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!prev) return;

    if (modeRef.current === "pinch") {
      updatePinch();
      return;
    }
    if (modeRef.current === "pan") {
      const rap = pointersRef.current.get(e.pointerId);
      if (rap) useWhiteboardStore.getState().panBy(e.clientX - prev.x, e.clientY - prev.y);
      return;
    }
    if (modeRef.current === "draw") {
      const world = engineRef.current?.screenToWorld(e.clientX, e.clientY, rect);
      if (world) engineRef.current?.moveStroke(world, e.pressure && e.pressure > 0 ? e.pressure : 0.5);
    } else if (modeRef.current === "shape") {
      const world = engineRef.current?.screenToWorld(e.clientX, e.clientY, rect);
      if (world) engineRef.current?.moveShape(world);
    } else if (modeRef.current === "select") {
      const world = engineRef.current?.screenToWorld(e.clientX, e.clientY, rect);
      if (world) {
        const dragged = engineRef.current?.moveObjectDragOrHandle(world);
        if (!dragged) engineRef.current?.moveSelection(world);
      }
    }
  };

  const onPointerEnd = (e: React.PointerEvent, cancel: boolean) => {
    pointersRef.current.delete(e.pointerId);
    engineRef.current?.endObjectDragOrHandle();
    if (modeRef.current === "draw") {
      if (cancel) engineRef.current?.cancelStroke();
      else engineRef.current?.endStroke();
      modeRef.current = null;
    } else if (modeRef.current === "shape") {
      if (cancel) engineRef.current?.cancelShape();
      else engineRef.current?.endShape();
      modeRef.current = null;
    } else if (modeRef.current === "select") {
      if (cancel) engineRef.current?.cancelSelection();
      else engineRef.current?.finishSelection();
      modeRef.current = null;
    } else if (modeRef.current === "pan") {
      modeRef.current = null;
    } else if (modeRef.current === "pinch") {
      pinchRef.current = null;
      if (pointersRef.current.size >= 2) enterPinch();
      else if (pointersRef.current.size === 1) modeRef.current = null;
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = Math.pow(1.0016, e.deltaY);
      useWhiteboardStore.getState().zoomBy(
        factor,
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        { width: rect.width, height: rect.height }
      );
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) useWhiteboardStore.getState().redo();
        else useWhiteboardStore.getState().undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        useWhiteboardStore.getState().redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        useWhiteboardStore.getState().duplicateSelectedItems();
        return;
      }
      if (mod && e.key === "]") {
        e.preventDefault();
        useWhiteboardStore.getState().reorderSelectedItems("front");
        return;
      }
      if (mod && e.key === "[") {
        e.preventDefault();
        useWhiteboardStore.getState().reorderSelectedItems("back");
        return;
      }
      if (e.key === " ") {
        spaceRef.current = true;
        e.preventDefault();
        return;
      }
      if (e.key === "Escape") {
        useWhiteboardStore.getState().setSelection(null);
        useWhiteboardStore.getState().selectItems([]);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const selectedIds = useWhiteboardStore.getState().selectedItemIds;
        if (selectedIds.length > 0) {
          useWhiteboardStore.getState().deleteSelectedItems();
        } else {
          useWhiteboardStore.getState().undo();
        }
        return;
      }

      const selectedIds = useWhiteboardStore.getState().selectedItemIds;
      if (selectedIds.length > 0) {
        const step = e.shiftKey ? 10 : 2;
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          useWhiteboardStore.getState().moveSelectedItems(-step, 0);
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          useWhiteboardStore.getState().moveSelectedItems(step, 0);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          useWhiteboardStore.getState().moveSelectedItems(0, -step);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          useWhiteboardStore.getState().moveSelectedItems(0, step);
          return;
        }
      }

      const k = e.key.toLowerCase();
      if (k === "v" || k === "d") setTool("draw");
      else if (k === "e") setTool("erase");
      else if (k === "h") setTool("pan");
      else if (k === "s") setTool("select");
      else if (k === "r") setTool("rect");
      else if (k === "o") setTool("ellipse");
      else if (k === "l") setTool("line");
      else if (k === "a") setTool("arrow");
      else if (k === "w") setTool("darrow");
      else if (k === "t") setTool("triangle");
      else if (k === "0") useWhiteboardStore.getState().resetCamera();
      else if (k === "1") useWhiteboardStore.getState().fitDrawing();
      else if (k === "f") useWhiteboardStore.getState().fitDrawing();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") spaceRef.current = false;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [setTool]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-white">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{
          cursor: tool === "pan" ? "grab" : "crosshair",
          transition: "cursor 120ms",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => onPointerEnd(e, false)}
        onPointerCancel={(e) => onPointerEnd(e, true)}
        onLostPointerCapture={(e) => onPointerEnd(e, true)}
        onContextMenu={(e) => e.preventDefault()}
      />
      {ready && <Hud ready={ready} />}
      <ObjectToolbar />
      <SubtitleBar />
    </div>
  );
}

function SubtitleBar() {
  const subtitle = useWhiteboardStore((s) => s.subtitle);
  if (!subtitle) return null;
  return (
    <div className="pointer-events-none absolute bottom-24 left-1/2 z-10 w-max max-w-[min(92%,44rem)] -translate-x-1/2 rounded-xl border border-slate-200 bg-white/90 px-5 py-2.5 text-center text-[15px] font-medium leading-snug text-slate-700 shadow-md backdrop-blur">
      {subtitle}
    </div>
  );
}

function Hud({ ready }: { ready: boolean }) {
  const [animating, setAnimating] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const engine = liveEngine.current;
    if (!engine) return;
    const update = (s: { animating: boolean }) => setAnimating(s.animating);
    update({ animating: engine.isAnimating });
    engine.onState = update;
    return () => {
      if (liveEngine.current === engine) engine.onState = undefined;
    };
  }, [ready]);

  if (!animating) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-slate-200 bg-white/90 px-4 py-1.5 text-xs font-medium text-slate-600 shadow-sm backdrop-blur">
      AI is drawing…
    </div>
  );
}