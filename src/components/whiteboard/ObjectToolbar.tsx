"use client";

import { useMemo, useState } from "react";
import { useWhiteboardStore } from "@/lib/store/whiteboard-store";
import { worldToScreen } from "@/lib/drawing/coordinates";
import { getGroupBBox } from "@/lib/drawing/selection";
import { CloseIcon } from "./icons";

const COLOR_SWATCHES = [
  { label: "Slate", hex: "#1e293b" },
  { label: "Red", hex: "#ef4444" },
  { label: "Blue", hex: "#2563eb" },
  { label: "Emerald", hex: "#059669" },
  { label: "Amber", hex: "#d97706" },
  { label: "Purple", hex: "#7c3aed" },
];

const FILL_SWATCHES = [
  { label: "None", hex: undefined },
  { label: "Soft Red", hex: "rgba(239, 68, 68, 0.15)" },
  { label: "Soft Blue", hex: "rgba(37, 99, 235, 0.15)" },
  { label: "Soft Green", hex: "rgba(5, 150, 105, 0.15)" },
  { label: "Soft Yellow", hex: "rgba(217, 119, 6, 0.15)" },
  { label: "Soft Purple", hex: "rgba(124, 58, 237, 0.15)" },
];

const WIDTH_PRESETS = [
  { label: "Thin", val: 2 },
  { label: "Normal", val: 4 },
  { label: "Thick", val: 8 },
  { label: "Extra Thick", val: 14 },
];

const FONT_PRESETS = [
  { label: "S", val: 18 },
  { label: "M", val: 24 },
  { label: "L", val: 36 },
  { label: "XL", val: 48 },
];

export default function ObjectToolbar() {
  const selectedItemIds = useWhiteboardStore((s) => s.selectedItemIds);
  const items = useWhiteboardStore((s) => s.items);
  const camera = useWhiteboardStore((s) => s.camera);
  const viewport = useWhiteboardStore((s) => s.viewport);

  const selectItems = useWhiteboardStore((s) => s.selectItems);
  const deleteSelectedItems = useWhiteboardStore((s) => s.deleteSelectedItems);
  const duplicateSelectedItems = useWhiteboardStore((s) => s.duplicateSelectedItems);
  const updateSelectedItems = useWhiteboardStore((s) => s.updateSelectedItems);
  const reorderSelectedItems = useWhiteboardStore((s) => s.reorderSelectedItems);

  const [editingText, setEditingText] = useState(false);
  const [textValue, setTextValue] = useState("");

  const selectedItems = useMemo(() => {
    if (selectedItemIds.length === 0) return [];
    const setIds = new Set(selectedItemIds);
    return items.filter((it) => setIds.has(it.id));
  }, [items, selectedItemIds]);

  const primaryItem = selectedItems.length === 1 ? selectedItems[0] : null;

  const screenPos = useMemo(() => {
    if (selectedItems.length === 0) return null;
    const box = getGroupBBox(selectedItems);
    if (!box) return null;
    const topCenterWorld = { x: (box.x0 + box.x1) / 2, y: box.y0 };
    const pt = worldToScreen(topCenterWorld, camera, viewport);
    const pad = 16;
    let left = Math.max(pad, Math.min(viewport.width - 360, pt.x - 180));
    let top = Math.max(pad, pt.y - 58);
    if (top < pad + 50) top = pt.y + (box.y1 - box.y0) * camera.zoom + 20;
    return { left, top };
  }, [selectedItems, camera, viewport]);

  if (selectedItems.length === 0 || !screenPos) return null;

  const curColor = primaryItem ? (primaryItem as { color?: string }).color ?? "#1e293b" : "#1e293b";
  const curFill = primaryItem ? (primaryItem as { fill?: string }).fill : undefined;
  const curWidth = primaryItem ? (primaryItem as { width?: number }).width ?? 4 : 4;
  const curFontSize = primaryItem ? (primaryItem as { fontSize?: number }).fontSize ?? 24 : 24;

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (primaryItem && primaryItem.kind === "text") {
      updateSelectedItems({ text: textValue });
    }
    setEditingText(false);
  };

  const hasClosedShape = selectedItems.some((it) => it.kind === "shape" && it.closed);

  return (
    <div
      className="pointer-events-auto absolute z-30 flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-xl backdrop-blur"
      style={{ left: screenPos.left, top: screenPos.top }}
    >
      {selectedItems.length > 1 && (
        <span className="rounded-lg bg-sky-100 px-2 py-1 text-[11px] font-bold text-sky-700">
          {selectedItems.length} selected
        </span>
      )}

      {editingText && primaryItem?.kind === "text" ? (
        <form onSubmit={handleTextSubmit} className="flex items-center gap-1.5 px-1">
          <input
            type="text"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            autoFocus
            className="w-48 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-800 outline-none focus:border-slate-900"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-slate-700"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditingText(false)}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <CloseIcon width={14} height={14} />
          </button>
        </form>
      ) : (
        <>
          {/* Color palette */}
          <div className="flex items-center gap-1 px-1">
            {COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch.hex}
                title={`Color: ${swatch.label}`}
                onClick={() => updateSelectedItems({ color: swatch.hex })}
                className={`h-5 w-5 rounded-full transition-transform hover:scale-110 ${
                  curColor === swatch.hex ? "ring-2 ring-slate-900 ring-offset-1" : ""
                }`}
                style={{ backgroundColor: swatch.hex }}
              />
            ))}
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* Stroke Width or Font Size */}
          {primaryItem && primaryItem.kind === "text" ? (
            <div className="flex items-center gap-0.5">
              {FONT_PRESETS.map((f) => (
                <button
                  key={f.label}
                  title={`Font size ${f.val}px`}
                  onClick={() => updateSelectedItems({ fontSize: f.val })}
                  className={`rounded-lg px-2 py-0.5 text-xs font-semibold transition-colors ${
                    curFontSize === f.val ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <button
                title="Edit text content"
                onClick={() => {
                  setTextValue(primaryItem.text);
                  setEditingText(true);
                }}
                className="ml-0.5 rounded-lg border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Edit
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {WIDTH_PRESETS.map((w) => (
                <button
                  key={w.val}
                  title={w.label}
                  onClick={() => updateSelectedItems({ width: w.val })}
                  className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${
                    curWidth === w.val ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span
                    className="rounded-full bg-current"
                    style={{ width: Math.max(3, w.val * 0.7), height: Math.max(3, w.val * 0.7) }}
                  />
                </button>
              ))}
            </div>
          )}

          {/* Shape fill swatch selector */}
          {hasClosedShape && (
            <>
              <div className="h-4 w-px bg-slate-200" />
              <div className="flex items-center gap-1 px-0.5">
                {FILL_SWATCHES.map((swatch, idx) => (
                  <button
                    key={swatch.label}
                    title={`Fill: ${swatch.label}`}
                    onClick={() => updateSelectedItems({ fill: swatch.hex })}
                    className={`h-5 w-5 rounded-full border border-slate-300 transition-transform hover:scale-110 ${
                      curFill === swatch.hex ? "ring-2 ring-slate-900 ring-offset-1" : ""
                    }`}
                    style={{ backgroundColor: swatch.hex ?? "transparent" }}
                  >
                    {idx === 0 && <span className="block text-[10px] text-slate-400">∅</span>}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="h-4 w-px bg-slate-200" />

          {/* Layering & Actions */}
          <div className="flex items-center gap-0.5">
            <button
              title="Bring to Front (⌘])"
              onClick={() => reorderSelectedItems("front")}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <FrontGlyph />
            </button>
            <button
              title="Send to Back (⌘[)"
              onClick={() => reorderSelectedItems("back")}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <BackGlyph />
            </button>
            <button
              title="Duplicate (⌘D)"
              onClick={duplicateSelectedItems}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <CopyGlyph />
            </button>
            <button
              title="Delete (Delete / Backspace)"
              onClick={deleteSelectedItems}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-600"
            >
              <TrashGlyph />
            </button>

            <button
              title="Deselect"
              onClick={() => selectItems([])}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <CloseIcon width={14} height={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function FrontGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function BackGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 22 2 17 12 12 22 17 12 22" />
      <polyline points="2 7 12 2 22 7" />
      <polyline points="2 12 12 7 22 12" />
    </svg>
  );
}

function CopyGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
