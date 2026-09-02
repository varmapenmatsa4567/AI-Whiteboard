"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWhiteboardStore } from "@/lib/store/whiteboard-store";
import { DrawingEngine, liveEngine } from "./DrawingEngine";

type Modality = "draw" | "pan" | "pinch" | null;

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
    if (tool !== "draw" && tool !== "erase") return;

    modeRef.current = "draw";
    const world = engineRef.current?.screenToWorld(e.clientX, e.clientY, rect);
    if (world) engineRef.current?.startStroke(world, tool);
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
    }
  };

  const onPointerEnd = (e: React.PointerEvent, cancel: boolean) => {
    pointersRef.current.delete(e.pointerId);
    if (modeRef.current === "draw") {
      if (cancel) engineRef.current?.cancelStroke();
      else engineRef.current?.endStroke();
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
      if (e.key === " ") {
        spaceRef.current = true;
        e.preventDefault();
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "v" || k === "d") setTool("draw");
      else if (k === "e") setTool("erase");
      else if (k === "h") setTool("pan");
      else if (k === "0") useWhiteboardStore.getState().resetCamera();
      else if (k === "1") useWhiteboardStore.getState().fitDrawing();
      else if (k === "f") useWhiteboardStore.getState().fitDrawing();
      else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        useWhiteboardStore.getState().undo();
      }
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
          cursor: tool === "draw" ? "crosshair" : tool === "erase" ? "crosshair" : "grab",
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