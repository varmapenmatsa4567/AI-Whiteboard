"use client";

import { create } from "zustand";
import type { WhiteboardMeta } from "@/types/whiteboard";
import {
  createBoard as persistCreateBoard,
  deleteBoard as persistDeleteBoard,
  getBoard,
  listBoards,
  loadActiveBoardId,
  renameBoard as persistRenameBoard,
  uid,
} from "./whiteboard-persistence";

interface WhiteboardManagerState {
  boards: WhiteboardMeta[];
  activeBoardId: string | null;
  ready: boolean;

  load: () => void;
  create: (name?: string) => string;
  rename: (id: string, name: string) => void;
  remove: (id: string) => string | null;
  setActive: (id: string) => void;
}

export const useWhiteboardManager = create<WhiteboardManagerState>()((set, get) => ({
  boards: [],
  activeBoardId: null,
  ready: false,

  load: () => {
    let boards = listBoards();
    if (boards.length === 0) {
      // First launch — create a default board so there is always one.
      const board = persistCreateBoard();
      boards = [
        {
          id: board.id,
          name: board.name,
          createdAt: board.createdAt,
          updatedAt: board.updatedAt,
        },
      ];
      set({ boards, activeBoardId: board.id, ready: true });
      return;
    }
    const storedActive = loadActiveBoardId();
    let active = storedActive && boards.some((b) => b.id === storedActive) ? storedActive : null;
    if (!active) active = boards[0].id;
    set({ boards, activeBoardId: active, ready: true });
  },

  create: (name) => {
    const board = persistCreateBoard(name);
    set((s) => ({
      boards: [
        {
          id: board.id,
          name: board.name,
          createdAt: board.createdAt,
          updatedAt: board.updatedAt,
        },
        ...s.boards,
      ],
      activeBoardId: board.id,
    }));
    return board.id;
  },

  rename: (id, name) => {
    persistRenameBoard(id, name);
    set((s) => ({
      boards: s.boards.map((b) => (b.id === id ? { ...b, name: name.trim() || "Untitled board", updatedAt: Date.now() } : b)),
    }));
  },

  remove: (id) => {
    const { boards, activeBoardId } = get();
    if (boards.length <= 1) return null;
    const nextBoards = boards.filter((b) => b.id !== id);
    persistDeleteBoard(id);
    let nextActive = activeBoardId === id ? null : activeBoardId;
    if (!nextActive) nextActive = nextBoards[0].id;
    set({ boards: nextBoards, activeBoardId: nextActive });
    return nextActive;
  },

  setActive: (id) => {
    if (get().boards.some((b) => b.id === id)) {
      set({ activeBoardId: id });
    }
  },
}));

export { uid, getBoard };