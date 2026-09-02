"use client";

import { create } from "zustand";
import type { Camera, ChatMessage, DrawingSpeed, Tool, WhiteboardItem } from "@/types/whiteboard";

const MAX_HISTORY = 120;

interface Viewport {
  width: number;
  height: number;
}

interface WhiteboardState {
  items: WhiteboardItem[];
  history: WhiteboardItem[][];
  future: WhiteboardItem[][];
  camera: Camera;
  tool: Tool;
  speed: DrawingSpeed;
  drawingBusy: boolean;
  panelOpen: boolean;
  viewport: Viewport;
  chat: ChatMessage[];
  lastError: string | null;

  addItems: (items: WhiteboardItem[], record?: boolean) => void;
  undo: () => void;
  redo: () => void;
  clearCanvas: () => void;

  setCamera: (camera: Camera) => void;
  panBy: (dx: number, dy: number) => void;
  zoomBy: (factor: number, anchor?: { x: number; y: number }, vp?: Viewport) => void;
  resetCamera: () => void;
  fitDrawing: () => void;

  setTool: (tool: Tool) => void;
  setSpeed: (speed: DrawingSpeed) => void;
  setBusy: (busy: boolean) => void;
  setPanelOpen: (open: boolean) => void;
  setViewport: (viewport: Viewport) => void;
  addChat: (role: ChatMessage["role"], content: string, provider?: string) => void;
  setError: (error: string | null) => void;
}

const clampZoom = (z: number) => Math.max(0.15, Math.min(8, z));

export const useWhiteboardStore = create<WhiteboardState>()((set, get) => ({
  items: [],
  history: [],
  future: [],
  camera: { x: 0, y: 0, zoom: 1 },
  tool: "draw",
  speed: "normal",
  drawingBusy: false,
  panelOpen: true,
  viewport: { width: 1200, height: 768 },
  chat: [],
  lastError: null,

  addItems: (items, record = true) => {
    if (items.length === 0) return;
    const state = get();
    const next = [...state.items, ...items];
    if (!record) {
      set({ items: next });
      return;
    }
    const history = [...state.history, state.items].slice(-MAX_HISTORY);
    set({ items: next, history, future: [] });
  },

  undo: () => {
    const { history, items: current, future } = get();
    const prev = history[history.length - 1];
    if (!prev) return;
    set({ items: prev, history: history.slice(0, -1), future: [...future, current] });
  },

  redo: () => {
    const { future, items: current, history } = get();
    const next = future[future.length - 1];
    if (!next) return;
    set({ items: next, future: future.slice(0, -1), history: [...history, current] });
  },

  clearCanvas: () => {
    const { items, history } = get();
    if (items.length === 0) return;
    set({ items: [], history: [...history, items].slice(-MAX_HISTORY), future: [] });
  },

  setCamera: (camera) => set({ camera: { ...camera, zoom: clampZoom(camera.zoom) } }),

  panBy: (dx, dy) => {
    const { camera } = get();
    set({
      camera: {
        ...camera,
        x: camera.x - dx / camera.zoom,
        y: camera.y - dy / camera.zoom,
      },
    });
  },

  zoomBy: (factor, anchor, vp) => {
    const { camera, viewport } = get();
    const ref = vp ?? viewport;
    const next = clampZoom(camera.zoom * factor);
    if (anchor) {
      const wx = camera.x + (anchor.x - ref.width / 2) / camera.zoom;
      const wy = camera.y + (anchor.y - ref.height / 2) / camera.zoom;
      set({
        camera: {
          zoom: next,
          x: wx - (anchor.x - ref.width / 2) / next,
          y: wy - (anchor.y - ref.height / 2) / next,
        },
      });
    } else {
      set({ camera: { ...camera, zoom: next } });
    }
  },

  resetCamera: () => set({ camera: { x: 0, y: 0, zoom: 1 } }),

  fitDrawing: () => {
    const { items, viewport } = get();
    if (items.length === 0) {
      set({ camera: { x: 0, y: 0, zoom: 1 } });
      return;
    }
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const it of items) {
      if (it.kind === "text") {
        x0 = Math.min(x0, it.x);
        y0 = Math.min(y0, it.y - it.fontSize);
        x1 = Math.max(x1, it.x + it.text.length * it.fontSize * 0.55);
        y1 = Math.max(y1, it.y + it.fontSize * 0.6);
        continue;
      }
      for (const p of it.points) {
        if (p.x < x0) x0 = p.x;
        if (p.y < y0) y0 = p.y;
        if (p.x > x1) x1 = p.x;
        if (p.y > y1) y1 = p.y;
      }
    }
    if (!Number.isFinite(x0)) {
      set({ camera: { x: 0, y: 0, zoom: 1 } });
      return;
    }
    const bw = Math.max(x1 - x0, 60);
    const bh = Math.max(y1 - y0, 60);
    const zoom = clampZoom(Math.min(viewport.width / bw, viewport.height / bh) * 0.92);
    set({ camera: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, zoom } });
  },

  setTool: (tool) => set({ tool }),
  setSpeed: (speed) => set({ speed }),
  setBusy: (drawingBusy) => set({ drawingBusy }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setViewport: (viewport) => set({ viewport }),
  addChat: (role, content, provider) =>
    set((s) => ({
      chat: [
        ...s.chat.slice(-80),
        { id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, role, content, provider, ts: Date.now() },
      ],
    })),
  setError: (lastError) => set({ lastError }),
}));