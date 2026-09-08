"use client";

import type { ChatMessage, StoredWhiteboard, WhiteboardItem, WhiteboardMeta } from "@/types/whiteboard";

const STORAGE_KEY = "ai-whiteboard:boards";
const ACTIVE_KEY = "ai-whiteboard:active";

const SAFE_NAME = "Untitled board";

export function uid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

interface PersistFile {
  version: 1;
  boards: StoredWhiteboard[];
}

function defaultFile(): PersistFile {
  return { version: 1, boards: [] };
}

function readFile(): PersistFile {
  if (typeof window === "undefined") return defaultFile();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultFile();
    const parsed = JSON.parse(raw) as PersistFile;
    if (!parsed || !Array.isArray(parsed.boards)) return defaultFile();
    return { version: 1, boards: parsed.boards };
  } catch {
    return defaultFile();
  }
}

function writeFile(file: PersistFile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
  } catch (err) {
    console.error("Failed to persist whiteboards", err);
  }
}

export function loadActiveBoardId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function saveActiveBoardId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function listBoards(): WhiteboardMeta[] {
  const file = readFile();
  return file.boards
    .map((b) => ({
      id: b.id,
      name: b.name || SAFE_NAME,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getBoard(id: string): StoredWhiteboard | null {
  const file = readFile();
  const board = file.boards.find((b) => b.id === id);
  return board ?? null;
}

export function saveBoard(
  id: string,
  data: {
    name?: string;
    items: WhiteboardItem[];
    camera: { x: number; y: number; zoom: number };
    chat: ChatMessage[];
  }
): void {
  const file = readFile();
  const now = Date.now();
  const existing = file.boards.find((b) => b.id === id);
  const board: StoredWhiteboard = {
    id,
    name: data.name ?? existing?.name ?? SAFE_NAME,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    items: data.items,
    camera: data.camera,
    chat: data.chat,
  };
  const rest = file.boards.filter((b) => b.id !== id);
  file.boards = [...rest, board];
  writeFile(file);
  saveActiveBoardId(id);
}

export function renameBoard(id: string, name: string): void {
  const file = readFile();
  const trimmed = name.trim() || SAFE_NAME;
  const idx = file.boards.findIndex((b) => b.id === id);
  if (idx === -1) return;
  file.boards[idx] = {
    ...file.boards[idx],
    name: trimmed,
    updatedAt: Date.now(),
  };
  writeFile(file);
}

export function createBoard(name?: string): StoredWhiteboard {
  const now = Date.now();
  const board: StoredWhiteboard = {
    id: uid(),
    name: name?.trim() || SAFE_NAME,
    createdAt: now,
    updatedAt: now,
    items: [],
    camera: { x: 0, y: 0, zoom: 1 },
    chat: [],
  };
  const file = readFile();
  file.boards = [...file.boards, board];
  writeFile(file);
  saveActiveBoardId(board.id);
  return board;
}

export function deleteBoard(id: string): void {
  const file = readFile();
  file.boards = file.boards.filter((b) => b.id !== id);
  writeFile(file);
  if (loadActiveBoardId() === id) {
    try {
      window.localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* ignore */
    }
  }
}