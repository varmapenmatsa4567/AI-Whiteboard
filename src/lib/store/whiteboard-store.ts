"use client";

import { create } from "zustand";
import type { Camera, ChatMessage, DrawingSpeed, Selection, Tool, WhiteboardItem } from "@/types/whiteboard";

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
  planStep: { canBack: boolean; canForward: boolean; index: number; total: number } | null;
  subtitle: string | null;
  selection: Selection | null;
  selectionContext: string[];
  selectedItemId: string | null;
  selectedItemIds: string[];

  addItems: (items: WhiteboardItem[], record?: boolean) => void;
  undo: () => void;
  redo: () => void;
  clearCanvas: () => void;

  selectItem: (id: string | null) => void;
  selectItems: (ids: string[]) => void;
  toggleSelectItem: (id: string) => void;
  deleteSelectedItem: () => void;
  deleteSelectedItems: () => void;
  duplicateSelectedItem: () => void;
  duplicateSelectedItems: () => void;
  updateSelectedItem: (updates: Partial<WhiteboardItem>) => void;
  updateSelectedItems: (updates: Partial<WhiteboardItem>) => void;
  moveSelectedItem: (dx: number, dy: number, record?: boolean) => void;
  moveSelectedItems: (dx: number, dy: number, record?: boolean) => void;
  resizeSelectedItem: (scaleX: number, scaleY: number, origin: { x: number; y: number }, record?: boolean) => void;
  resizeSelectedItems: (scaleX: number, scaleY: number, origin: { x: number; y: number }, record?: boolean) => void;
  reorderSelectedItem: (direction: "front" | "back") => void;
  reorderSelectedItems: (direction: "front" | "back") => void;

  setPlanStep: (planStep: WhiteboardState["planStep"]) => void;
  setSubtitle: (subtitle: string | null) => void;
  setSelection: (selection: Selection | null) => void;
  addSelectionContext: (labels: string[]) => void;
  removeSelectionContext: (index: number) => void;
  clearSelectionContext: () => void;

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
  planStep: null,
  subtitle: null,
  selection: null,
  selectionContext: [],
  selectedItemId: null,
  selectedItemIds: [],

  selectItems: (ids) => set({ selectedItemIds: ids, selectedItemId: ids.length === 1 ? ids[0] : null }),
  selectItem: (id) => get().selectItems(id ? [id] : []),
  toggleSelectItem: (id) => {
    const { selectedItemIds } = get();
    const setIds = new Set(selectedItemIds);
    if (setIds.has(id)) setIds.delete(id);
    else setIds.add(id);
    const next = Array.from(setIds);
    get().selectItems(next);
  },

  deleteSelectedItems: () => {
    const { items, selectedItemIds, history } = get();
    if (selectedItemIds.length === 0) return;
    const deleteSet = new Set(selectedItemIds);
    const next = items.filter((it) => !deleteSet.has(it.id));
    if (next.length === items.length) return;
    set({
      items: next,
      history: [...history, items].slice(-MAX_HISTORY),
      future: [],
      selectedItemIds: [],
      selectedItemId: null,
    });
  },
  deleteSelectedItem: () => get().deleteSelectedItems(),

  duplicateSelectedItems: () => {
    const { items, selectedItemIds, history } = get();
    if (selectedItemIds.length === 0) return;
    const targetSet = new Set(selectedItemIds);
    const targets = items.filter((it) => targetSet.has(it.id));
    if (targets.length === 0) return;
    const offset = 24;
    const newIds: string[] = [];
    const clones: WhiteboardItem[] = targets.map((target) => {
      const newId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      newIds.push(newId);
      if (target.kind === "text") {
        return { ...target, id: newId, x: target.x + offset, y: target.y + offset };
      }
      return {
        ...target,
        id: newId,
        points: target.points.map((p) => ({ x: p.x + offset, y: p.y + offset })),
      } as WhiteboardItem;
    });

    set({
      items: [...items, ...clones],
      history: [...history, items].slice(-MAX_HISTORY),
      future: [],
      selectedItemIds: newIds,
      selectedItemId: newIds.length === 1 ? newIds[0] : null,
    });
  },
  duplicateSelectedItem: () => get().duplicateSelectedItems(),

  updateSelectedItems: (updates) => {
    const { items, selectedItemIds, history } = get();
    if (selectedItemIds.length === 0) return;
    const targetSet = new Set(selectedItemIds);
    const next = items.map((it) => {
      if (!targetSet.has(it.id)) return it;
      return { ...it, ...updates } as WhiteboardItem;
    });
    set({
      items: next,
      history: [...history, items].slice(-MAX_HISTORY),
      future: [],
    });
  },
  updateSelectedItem: (updates) => get().updateSelectedItems(updates),

  moveSelectedItems: (dx, dy, record = true) => {
    const { items, selectedItemIds, history } = get();
    if (selectedItemIds.length === 0 || (dx === 0 && dy === 0)) return;
    const targetSet = new Set(selectedItemIds);
    const next = items.map((it) => {
      if (!targetSet.has(it.id)) return it;
      if (it.kind === "text") {
        return { ...it, x: it.x + dx, y: it.y + dy };
      }
      return {
        ...it,
        points: it.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      };
    });
    if (!record) {
      set({ items: next });
      return;
    }
    set({
      items: next,
      history: [...history, items].slice(-MAX_HISTORY),
      future: [],
    });
  },
  moveSelectedItem: (dx, dy, record = true) => get().moveSelectedItems(dx, dy, record),

  resizeSelectedItems: (scaleX, scaleY, origin, record = true) => {
    const { items, selectedItemIds, history } = get();
    if (selectedItemIds.length === 0) return;
    const targetSet = new Set(selectedItemIds);
    const next = items.map((it) => {
      if (!targetSet.has(it.id)) return it;
      if (it.kind === "text") {
        const nx = origin.x + (it.x - origin.x) * scaleX;
        const ny = origin.y + (it.y - origin.y) * scaleY;
        const newFontSize = Math.max(8, Math.round(it.fontSize * Math.abs(scaleY)));
        return { ...it, x: nx, y: ny, fontSize: newFontSize };
      }
      return {
        ...it,
        points: it.points.map((p) => ({
          x: origin.x + (p.x - origin.x) * scaleX,
          y: origin.y + (p.y - origin.y) * scaleY,
        })),
      };
    });
    if (!record) {
      set({ items: next });
      return;
    }
    set({
      items: next,
      history: [...history, items].slice(-MAX_HISTORY),
      future: [],
    });
  },
  resizeSelectedItem: (scaleX, scaleY, origin, record = true) => get().resizeSelectedItems(scaleX, scaleY, origin, record),

  reorderSelectedItems: (direction) => {
    const { items, selectedItemIds, history } = get();
    if (selectedItemIds.length === 0) return;
    const targetSet = new Set(selectedItemIds);
    const selected = items.filter((it) => targetSet.has(it.id));
    const unselected = items.filter((it) => !targetSet.has(it.id));
    const next = direction === "front" ? [...unselected, ...selected] : [...selected, ...unselected];
    set({
      items: next,
      history: [...history, items].slice(-MAX_HISTORY),
      future: [],
    });
  },
  reorderSelectedItem: (direction) => get().reorderSelectedItems(direction),

  setPlanStep: (planStep) => set({ planStep }),
  setSubtitle: (subtitle) => set({ subtitle }),
  setSelection: (selection) => set({ selection }),
  addSelectionContext: (labels) =>
    set((s) => {
      const existing = new Set(s.selectionContext);
      const fresh = labels.filter((l) => !existing.has(l));
      if (fresh.length === 0) return s;
      return { selectionContext: [...s.selectionContext, ...fresh].slice(-50) };
    }),
  removeSelectionContext: (index) =>
    set((s) => ({
      selectionContext: s.selectionContext.filter((_, i) => i !== index),
    })),
  clearSelectionContext: () => set({ selectionContext: [] }),

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
    set({ items: [], history: [...history, items].slice(-MAX_HISTORY), future: [], selection: null, selectionContext: [] });
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