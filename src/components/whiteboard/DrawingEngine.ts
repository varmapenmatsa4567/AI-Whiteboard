"use client";

import type { Point } from "@/types/drawing";
import type { Tool, WhiteboardItem } from "@/types/whiteboard";
import { useWhiteboardStore } from "@/lib/store/whiteboard-store";
import { classifyItem, drawSprite, intersectsBox, type Sprite, buildRibbonPath, INK, colorFor } from "@/lib/drawing/renderer";
import { dedupe, pathLength, resample, revealCut } from "@/lib/drawing/smoothing";
import { pxPerSecond, speedMultiplier, interStrokeDelayMs, easeInOut } from "@/lib/drawing/animation";
import { screenToWorld as screenToWorldPoint, visibleWorldRect } from "@/lib/drawing/coordinates";
import type { PlannedStep } from "@/lib/drawing/commands";
import { uid, shapeFromDrag, type ShapeKind } from "@/lib/drawing/commands";

const GRID_BASE = 48;

/** Module-level handle so UI widgets can drive the mounted engine. */
export const liveEngine: { current: DrawingEngine | null } = { current: null };

const SHAPE_TOOLS = new Set<Tool>(["rect", "ellipse", "line", "arrow", "triangle"]);

/** Prefer the macOS "Samantha" voice for narrations, falling back to the browser default. */
function pickNarrationVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return voices.find((v) => /^en/i.test(v.lang) && /samantha/i.test(v.name)) ?? null;
}

function shapeKindForTool(tool: Tool): ShapeKind | null {
  return (SHAPE_TOOLS.has(tool) ? (tool as ShapeKind) : null);
}

interface AnimCursor {
  step: PlannedStep;
  revealed: number;
  total: number;
  textChars: number;
}

export interface EngineState {
  animating: boolean;
}

export class DrawingEngine {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private raf = 0;
  private disposed = false;
  private needsRender = true;
  private lastTime = 0;
  private unsub: (() => void) | null = null;

  private queue: PlannedStep[] = [];
  private current: AnimCursor | null = null;
  private idle = 0;
  private speechActive = false;
  private waitForSpeech = false;
  private speechTimeout: number | null = null;

  private pointerStroke: { item: WhiteboardItem; pts: Point[]; pressures: number[] } | null = null;
  private shapeDraft: { tool: ShapeKind; anchor: Point; current: Point } | null = null;

  private spriteCache = new Map<string, Sprite>();
  private animating = false;

  onState?: (state: EngineState) => void;

  /**
   * Start the narration speech for the current step in parallel with its
   * drawing. The step only advances once BOTH the drawing and the speech have
   * finished (tracked via {@link speechActive} / {@link waitForSpeech}).
   */
  private speakText(text: string): void {
    this.speechActive = false;
    if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    this.speechActive = true;
    // Safety net: if the utterance never fires its onend/onerror callbacks the
    // engine would stall forever, so release after a generous timeout.
    this.speechTimeout = window.setTimeout(() => this.onSpeechDone(), 15000);

    const start = (): void => {
      if (this.speechTimeout === null) return; // cancelled in the meantime
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = pickNarrationVoice(window.speechSynthesis.getVoices());
      if (voice) utterance.voice = voice;
      utterance.onend = () => this.onSpeechDone();
      utterance.onerror = () => this.onSpeechDone();
      window.speechSynthesis.speak(utterance);
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      // Voices populate asynchronously after page load; wait for them so even
      // the very first narration can use Samantha.
      window.speechSynthesis.addEventListener("voiceschanged", start, { once: true });
      // Fallback: if voices never populate, speak with the default voice anyway.
      window.setTimeout(() => {
        if (this.speechTimeout !== null && window.speechSynthesis.getVoices().length === 0) start();
      }, 400);
    } else {
      start();
    }
  }

  /** Called when the current narration finishes speaking. */
  private onSpeechDone(): void {
    if (this.speechTimeout !== null) {
      clearTimeout(this.speechTimeout);
      this.speechTimeout = null;
    }
    this.speechActive = false;
    if (this.waitForSpeech) {
      this.waitForSpeech = false;
      // Resume the idle clock so the next step starts.
      this.idle = Math.max(16, this.idle);
    }
  }

  /** Begin drawing (or pausing) a step immediately. */
  private resumeStep(step: PlannedStep): void {
    if (step.kind === "pause") {
      this.idle = step.duration ?? 400;
      return;
    }
    const item = step.item!;
    let total: number;
    let textChars = 0;
    if (item.kind === "text") {
      textChars = item.text.length;
      total = item.text.length;
    } else {
      total = Math.max(1, pathLength(item.points));
    }
    this.current = { step, revealed: 0, total, textChars };
    this.setAnimating(true);
  }

  private cancelSpeech(): void {
    this.speechActive = false;
    this.waitForSpeech = false;
    if (this.speechTimeout !== null) {
      clearTimeout(this.speechTimeout);
      this.speechTimeout = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.lastTime = performance.now();
    this.unsub = useWhiteboardStore.subscribe(() => {
      this.needsRender = true;
    });
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unsub?.();
    this.queue = [];
    this.current = null;
    this.pointerStroke = null;
    this.shapeDraft = null;
    this.spriteCache.clear();
    this.cancelSpeech();
    if (liveEngine.current === this) liveEngine.current = null;
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(cssWidth * this.dpr));
    const h = Math.max(1, Math.round(cssHeight * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.needsRender = true;
  }

  requestRender(): void {
    this.needsRender = true;
  }

  // ── AI plan playback ────────────────────────────────────────────────

  playSteps(steps: PlannedStep[]): void {
    this.stopDrawing();
    this.queue = steps;
    this.idle = 160;
    this.advance(0);
    this.setAnimating(true);
    this.needsRender = true;
  }

  stopDrawing(): void {
    this.queue = [];
    this.current = null;
    this.setAnimating(false);
    this.cancelSpeech();
    this.needsRender = true;
  }

  get isAnimating(): boolean {
    return this.animating;
  }

  private setAnimating(v: boolean): void {
    if (this.animating !== v) {
      this.animating = v;
      this.onState?.({ animating: v });
    }
  }

  // ── Manual drawing ──────────────────────────────────────────────────

  startStroke(world: Point, tool: Tool): void {
    if (this.pointerStroke) this.endStroke();
    const width = tool === "erase" ? 26 : tool === "draw" ? 4 : 0;
    if (width <= 0) return;
    const item: WhiteboardItem =
      tool === "erase"
        ? { id: uid(), kind: "erase", points: [], width, seed: 0 }
        : { id: uid(), kind: "stroke", points: [], width, seed: 0, pressure: [] };
    this.pointerStroke = { item, pts: item.points, pressures: [] };
    this.pushPointerPoint(world, 0.5);
    this.needsRender = true;
  }

  moveStroke(world: Point, pressure = 0.5): void {
    if (!this.pointerStroke) return;
    this.pushPointerPoint(world, pressure);
    this.needsRender = true;
  }

  private pushPointerPoint(p: Point, pressure: number): void {
    const ps = this.pointerStroke;
    if (!ps) return;
    const last = ps.pts[ps.pts.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.6) return;
    ps.pts.push(p);
    if (ps.item.kind === "stroke" && ps.item.pressure) ps.item.pressure.push(pressure);
    if (ps.pts.length > 12000) this.endStroke();
  }

  endStroke(): void {
    const ps = this.pointerStroke;
    if (!ps) return;
    this.pointerStroke = null;
    if (ps.pts.length < 3 || ps.item.kind === "text") {
      this.needsRender = true;
      return;
    }
    const spacing = ps.item.kind === "erase" ? 8 : 2.4;
    const pts = dedupe(resample(ps.pts, spacing), 0.5);
    if (pts.length < 2) {
      this.needsRender = true;
      return;
    }
    const item = ps.item;
    if (item.kind === "erase") {
      item.points = pts;
    } else {
      item.points = pts;
    }
    useWhiteboardStore.getState().addItems([item]);
    this.needsRender = true;
  }

  cancelStroke(): void {
    this.pointerStroke = null;
    this.needsRender = true;
  }

  // ── Manual shapes (toolbar drag) ────────────────────────────────────

  startShape(world: Point, tool: Tool): void {
    if (this.pointerStroke) this.endStroke();
    const kind = shapeKindForTool(tool);
    if (!kind) return;
    this.shapeDraft = { tool: kind, anchor: world, current: world };
    this.needsRender = true;
  }

  moveShape(world: Point): void {
    if (!this.shapeDraft) return;
    this.shapeDraft.current = world;
    this.needsRender = true;
  }

  endShape(): void {
    const d = this.shapeDraft;
    this.shapeDraft = null;
    if (!d) return;
    if (Math.hypot(d.current.x - d.anchor.x, d.current.y - d.anchor.y) < 2) {
      this.needsRender = true;
      return;
    }
    const items = shapeFromDrag(d.tool, d.anchor, d.current, INK);
    if (items.length) useWhiteboardStore.getState().addItems(items);
    this.needsRender = true;
  }

  cancelShape(): void {
    this.shapeDraft = null;
    this.needsRender = true;
  }

  // ── Main loop ───────────────────────────────────────────────────────

  private tick = (t: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, (t - this.lastTime) / 1000);
    this.lastTime = t;
    if (this.current || this.queue.length > 0 || this.idle > 0 || this.waitForSpeech) {
      this.advance(dt * 1000);
      this.needsRender = true;
    }
    if (this.needsRender) {
      this.draw();
      this.needsRender = false;
    }
  };

  private advance(ms: number): void {
    const speed = useWhiteboardStore.getState().speed;

    // A completed step's narration is still speaking — hold until it finishes
    // before starting the next step.
    if (this.waitForSpeech) {
      this.setAnimating(true);
      return;
    }

    if (this.idle > 0) {
      this.idle -= ms;
      if (this.idle <= 0) {
        if (this.current === null) {
          // Wait for the step's narration to finish before advancing, so the
          // next step starts only once BOTH drawing and speech are complete.
          if (this.speechActive) {
            this.waitForSpeech = true;
            this.setAnimating(true);
          } else if (this.queue.length > 0) {
            this.startNext();
          } else {
            this.setAnimating(false);
          }
        }
      }
      return;
    }

    if (!this.current && this.queue.length > 0) {
      this.startNext();
      return;
    }

    const cur = this.current;
    if (!cur) return;
    if (!cur.step.item) return;

    const item = cur.step.item;
    if (item.kind === "text") {
      cur.revealed += 70 * speedMultiplier(speed) * (ms / 1000);
      if (cur.revealed >= cur.total) {
        this.commitItem(item);
        this.current = null;
        this.idle = interStrokeDelayMs(speed);
      }
      return;
    }

    cur.revealed += pxPerSecond(speed) * (ms / 1000);
    if (cur.revealed >= cur.total) {
      this.commitItem(item);
      this.current = null;
      this.idle = interStrokeDelayMs(speed);
    }
  }

  private startNext(): void {
    const step = this.queue.shift();
    if (!step) {
      this.setAnimating(false);
      return;
    }
    // Speak narration and begin drawing/pausing the step at the same time.
    this.waitForSpeech = false;
    if (step.explain) {
      this.speakText(step.explain);
    }
    this.resumeStep(step);
  }

  private commitItem(item: WhiteboardItem): void {
    this.spriteCache.delete(item.id);
    useWhiteboardStore.getState().addItems([item]);
  }

  // ── Rendering ───────────────────────────────────────────────────────

  private draw(): void {
    const { camera, viewport, items } = useWhiteboardStore.getState();
    const ctx = this.ctx;
    const dpr = this.dpr;
    const cssW = viewport.width;
    const cssH = viewport.height;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();

    const k = camera.zoom * dpr;
    ctx.setTransform(k, 0, 0, k, (cssW / 2 - camera.x * camera.zoom) * dpr, (cssH / 2 - camera.y * camera.zoom) * dpr);

    this.drawGrid(ctx, camera, viewport);

    const rect = visibleWorldRect(camera, viewport, 64);
    for (const item of items) {
      const sprite = this.sprite(item);
      if (!intersectsBox(sprite.box, rect.x0, rect.y0, rect.x1, rect.y1)) continue;
      drawSprite(ctx, sprite, item);
    }

    this.drawPointer(ctx);
    this.drawShapePreview(ctx);
    this.drawAnimating(ctx);
  }

  private drawGrid(ctx: CanvasRenderingContext2D, camera: { x: number; y: number; zoom: number }, viewport: { width: number; height: number }): void {
    if (camera.zoom < 0.18) return;
    let spacingPx = GRID_BASE * camera.zoom * this.dpr;
    let mult = 1;
    while (spacingPx < 26) {
      spacingPx *= 2;
      mult *= 2;
    }
    const worldSpacing = GRID_BASE * mult;
    const margin = worldSpacing;
    const sRect = visibleWorldRect(camera, viewport, margin);
    const x0 = Math.floor(sRect.x0 / worldSpacing) * worldSpacing;
    const y0 = Math.floor(sRect.y0 / worldSpacing) * worldSpacing;
    const dot = 1.5 / camera.zoom;
    ctx.fillStyle = "rgba(148,163,184,0.4)";
    for (let wx = x0; wx <= sRect.x1; wx += worldSpacing) {
      for (let wy = y0; wy <= sRect.y1; wy += worldSpacing) {
        ctx.fillRect(wx - dot / 2, wy - dot / 2, dot, dot);
      }
    }
  }

  private sprite(item: WhiteboardItem): Sprite {
    let s = this.spriteCache.get(item.id);
    if (!s) {
      if (this.spriteCache.size > 6000) this.spriteCache.clear();
      s = classifyItem(item);
      this.spriteCache.set(item.id, s);
    }
    return s;
  }

  private drawPointer(ctx: CanvasRenderingContext2D): void {
    const ps = this.pointerStroke;
    if (!ps || ps.pts.length < 1 || ps.item.kind === "text") return;
    const item = ps.item;
    ctx.save();
    if (item.kind === "erase") ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = item.kind === "erase" ? "#000" : INK;
    if (ps.pts.length === 1) {
      ctx.beginPath();
      ctx.arc(ps.pts[0].x, ps.pts[0].y, item.width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fill(buildRibbonPath(ps.pts, item.width, item.kind === "stroke" ? item.pressure : undefined), "nonzero");
    }
    ctx.restore();
  }

  /** Live preview while dragging a shape tool. */
  private drawShapePreview(ctx: CanvasRenderingContext2D): void {
    const d = this.shapeDraft;
    if (!d) return;
    const items = shapeFromDrag(d.tool, d.anchor, d.current, INK);
    for (const item of items) {
      if (item.kind !== "shape") continue;
      ctx.save();
      if (item.fill && item.closed && item.points.length > 0) {
        const fp = new Path2D();
        fp.moveTo(item.points[0].x, item.points[0].y);
        for (let i = 1; i < item.points.length; i++) fp.lineTo(item.points[i].x, item.points[i].y);
        fp.closePath();
        ctx.fillStyle = item.fill;
        ctx.fill(fp, "nonzero");
      }
      ctx.fillStyle = colorFor(item);
      ctx.fill(buildRibbonPath(item.points, item.width), "nonzero");
      ctx.restore();
    }
  }

  private drawAnimating(ctx: CanvasRenderingContext2D): void {
    const cur = this.current;
    if (!cur || !cur.step.item) return;
    const item = cur.step.item;
    const frac = Math.min(1, Math.max(0, cur.revealed / cur.total));
    const eased = easeInOut(frac);

    ctx.save();
    if (item.kind === "erase") ctx.globalCompositeOperation = "destination-out";

    if (item.kind === "text") {
      const n = Math.max(0, Math.min(item.text.length, Math.round(eased * cur.textChars)));
      ctx.font = `${item.fontSize}px "Chalkboard SE", "Segoe Print", "Comic Sans MS", "Marker Felt", cursive, sans-serif`;
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = item.color ?? INK;
      ctx.fillText(item.text.slice(0, n), item.x, item.y);
    } else {
      const length = pathLength(item.points);
      const partial = revealCut(item.points, eased * length);
      if (item.kind === "erase") {
        ctx.fillStyle = "#000";
      } else {
        ctx.fillStyle = item.color ?? INK;
        ctx.globalAlpha = item.opacity ?? 1;
      }
      if (partial.length >= 2) {
        ctx.fill(buildRibbonPath(partial, item.width, item.kind === "stroke" ? item.pressure : undefined), "nonzero");
      }
    }
    ctx.restore();
  }

  /** Convert CSS client coordinates (relative to the canvas element's rect) to world coordinates. */
  screenToWorld(clientX: number, clientY: number, cssRect: DOMRect): Point {
    const { camera, viewport } = useWhiteboardStore.getState();
    return screenToWorldPoint(clientX - cssRect.left, clientY - cssRect.top, camera, viewport);
  }
}