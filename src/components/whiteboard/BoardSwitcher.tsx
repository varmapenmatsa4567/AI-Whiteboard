"use client";

import { useEffect, useRef, useState } from "react";
import { useWhiteboardManager } from "@/lib/store/whiteboard-manager";
import { BoardIcon, CheckIcon, ChevronDownIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons";

export default function BoardSwitcher() {
  const boards = useWhiteboardManager((s) => s.boards);
  const activeBoardId = useWhiteboardManager((s) => s.activeBoardId);
  const create = useWhiteboardManager((s) => s.create);
  const remove = useWhiteboardManager((s) => s.remove);
  const setActive = useWhiteboardManager((s) => s.setActive);
  const rename = useWhiteboardManager((s) => s.rename);

  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = boards.find((b) => b.id === activeBoardId);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setRenamingId(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Focus the rename input when it appears.
  useEffect(() => {
    if (renamingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renamingId]);

  const handleCreate = () => {
    create();
    setOpen(false);
  };

  const startRename = (id: string, name: string) => {
    setRenamingId(id);
    setDraftName(name);
  };

  const commitRename = () => {
    if (renamingId) rename(renamingId, draftName);
    setRenamingId(null);
  };

  const handleDelete = (id: string) => {
    if (boards.length <= 1) return;
    if (!window.confirm("Delete this whiteboard? This cannot be undone.")) return;
    remove(id);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        title="Switch whiteboard"
      >
        <BoardIcon width={15} height={15} className="text-slate-500" />
        <span className="max-w-[140px] truncate">{active?.name ?? "Whiteboard"}</span>
        <ChevronDownIcon width={14} height={14} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Whiteboards</span>
            <button
              onClick={handleCreate}
              className="flex items-center gap-1 rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-slate-700"
            >
              <PlusIcon width={12} height={12} />
              New
            </button>
          </div>

          <ul className="max-h-72 overflow-y-auto py-1">
            {boards.map((b) => {
              const isActive = b.id === activeBoardId;
              const isRenaming = renamingId === b.id;
              return (
                <li key={b.id}>
                  {isRenaming ? (
                    <div className="flex items-center gap-1 px-2 py-1">
                      <input
                        ref={inputRef}
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        onBlur={commitRename}
                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-slate-500"
                      />
                    </div>
                  ) : (
                    <div
                      className={`group flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                        isActive ? "bg-slate-50 text-slate-900" : "text-slate-600 hover:bg-slate-50"
                      }`}
                      onClick={() => {
                        setActive(b.id);
                        setOpen(false);
                      }}
                      onDoubleClick={() => startRename(b.id, b.name)}
                      title="Click to switch · Double-click to rename"
                    >
                      <span className="min-w-0 flex-1 truncate">{b.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(b.id, b.name);
                        }}
                        className="shrink-0 rounded p-0.5 text-slate-300 opacity-0 transition-opacity hover:bg-slate-200 hover:text-slate-700 group-hover:opacity-100"
                        title="Rename board"
                      >
                        <PencilIcon width={13} height={13} />
                      </button>
                      {isActive && <CheckIcon width={14} height={14} className="shrink-0 text-slate-900" />}
                      {!isActive && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(b.id);
                          }}
                          className="shrink-0 rounded p-0.5 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                          title="Delete board"
                        >
                          <TrashIcon width={13} height={13} />
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}