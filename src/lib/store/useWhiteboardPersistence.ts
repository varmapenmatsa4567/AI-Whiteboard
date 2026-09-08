"use client";

import { useEffect, useRef } from "react";
import { useWhiteboardManager } from "./whiteboard-manager";
import { useWhiteboardStore } from "./whiteboard-store";
import { getBoard, saveBoard } from "./whiteboard-persistence";

/**
 * Loads the active whiteboard into the store on mount, saves any changes back
 * to localStorage, and handles switching between boards.
 */
export function useWhiteboardPersistence() {
  const ready = useWhiteboardManager((s) => s.ready);
  const activeBoardId = useWhiteboardManager((s) => s.activeBoardId);
  const load = useWhiteboardManager((s) => s.load);

  const loadingRef = useRef(false);

  // Initial load of board list + active board.
  useEffect(() => {
    load();
  }, [load]);

  // When the active board changes, load it into the store.
  useEffect(() => {
    if (!ready || !activeBoardId) return;
    const board = getBoard(activeBoardId);
    loadingRef.current = true;
    useWhiteboardStore.setState({
      items: board?.items ?? [],
      chat: board?.chat ?? [],
      camera: board?.camera ?? { x: 0, y: 0, zoom: 1 },
      history: [],
      future: [],
      selection: null,
      selectionContext: [],
      selectedItemId: null,
      selectedItemIds: [],
    });
    // Defer clearing the loading flag so the save effect doesn't immediately
    // fire with the freshly-loaded state.
    requestAnimationFrame(() => {
      loadingRef.current = false;
    });
  }, [ready, activeBoardId]);

  // Persist state changes back to localStorage.
  useEffect(() => {
    if (!ready || !activeBoardId) return;
    const unsub = useWhiteboardStore.subscribe((state) => {
      if (loadingRef.current) return;
      saveBoard(activeBoardId, {
        items: state.items,
        camera: state.camera,
        chat: state.chat,
      });
    });
    // Save immediately on mount so the board exists with current state.
    const s = useWhiteboardStore.getState();
    if (!loadingRef.current) {
      saveBoard(activeBoardId, { items: s.items, camera: s.camera, chat: s.chat });
    }

    // When switching boards, persist the outgoing board's state so no
    // unsaved changes are lost.
    return () => {
      if (getBoard(activeBoardId)) {
        const st = useWhiteboardStore.getState();
        saveBoard(activeBoardId, { items: st.items, camera: st.camera, chat: st.chat });
      }
      unsub();
    };
  }, [ready, activeBoardId]);
}