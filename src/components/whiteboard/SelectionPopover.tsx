"use client";

import { useMemo } from "react";
import { useWhiteboardStore } from "@/lib/store/whiteboard-store";
import { worldToScreen } from "@/lib/drawing/coordinates";
import { itemsInside, selectionBBox, textLabels } from "@/lib/drawing/selection";
import { CloseIcon } from "./icons";

const CARD_WIDTH = 240;

export default function SelectionPopover() {
  const selection = useWhiteboardStore((s) => s.selection);
  const camera = useWhiteboardStore((s) => s.camera);
  const viewport = useWhiteboardStore((s) => s.viewport);
  const items = useWhiteboardStore((s) => s.items);
  const setSelection = useWhiteboardStore((s) => s.setSelection);
  const addSelectionContext = useWhiteboardStore((s) => s.addSelectionContext);

  const content = useMemo(() => {
    if (!selection) return null;
    const inside = itemsInside(items, selection.poly);
    return {
      labels: textLabels(inside),
      box: selectionBBox(selection.poly),
    };
  }, [selection, items]);

  if (!selection || !content || !content.box) return null;

  const topLeft = worldToScreen({ x: content.box.x0, y: content.box.y0 }, camera, viewport);
  const h = (content.box.y1 - content.box.y0) * camera.zoom;
  const pad = 16;

  let left = topLeft.x;
  let top = topLeft.y - 12;
  if (left + CARD_WIDTH > viewport.width - pad) left = viewport.width - CARD_WIDTH - pad;
  left = Math.max(pad, left);
  if (top < pad) top = topLeft.y + h + 12;
  top = Math.min(Math.max(pad, top), viewport.height - 96);

  return (
    <div
      className="pointer-events-auto absolute z-30 w-[240px] rounded-xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur"
      style={{ left, top, width: CARD_WIDTH }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Selected text</span>
        <button
          onClick={() => setSelection(null)}
          className="rounded-md p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          title="Clear selection (Esc)"
          aria-label="Clear selection"
        >
          <CloseIcon width={14} height={14} />
        </button>
      </div>

      {content.labels.length > 0 ? (
        <ul className="mt-1.5 flex list-none flex-col gap-0.5">
          {content.labels.map((label, i) => (
            <li key={`${label}_${i}`} className="truncate text-sm text-slate-800">
              <span className="mr-1 text-slate-300">·</span>
              {label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-sm text-slate-600">No text found in the selection.</p>
      )}

      <button
        onClick={() => {
          addSelectionContext(content.labels);
          setSelection(null);
        }}
        className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-700"
        disabled={content.labels.length === 0}
      >
        Ask
      </button>

      <p className="mt-2 text-[10px] text-slate-400">Press Esc to clear the selection.</p>
    </div>
  );
}
