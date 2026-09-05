"use client";

import type { Point } from "@/types/drawing";
import type { SelectionKind, Tool, WhiteboardItem } from "@/types/whiteboard";
import { useWhiteboardStore } from "@/lib/store/whiteboard-store";
import { classifyItem, drawSprite, intersectsBox, type Sprite, buildRibbonPath, INK, colorFor } from "@/lib/drawing/renderer";
import { dedupe, pathLength, resample, revealCut } from "@/lib/drawing/smoothing";
import { pxPerSecond, speedMultiplier, interStrokeDelayMs, easeInOut } from "@/lib/drawing/animation";
import { screenToWorld as screenToWorldPoint, visibleWorldRect } from "@/lib/drawing/coordinates";
import type { PlannedStep } from "@/lib/drawing/commands";
import { uid, shapeFromDrag, type ShapeKind } from "@/lib/drawing/commands";
import { polygonFromEllipse } from "@/lib/drawing/selection";

const GRID_BASE = 48;
const SELECTION_COLOR = "#e11d48";
const SELECTION_LOOP_MIN = 2;

/** Module-level handle so UI widgets can drive the mounted engine. */
export const liveEngine: { current: DrawingEngine | null } = { current: null };

const SHAPE_TOOLS = new Set<Tool>(["rect", "ellipse", "line", "arrow", "triangle"]);

/** Fixed reveal window (ms at normal speed) for shapes — they snap in quickly. */
const SHAPE_REVEAL_MS = 250;

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
  canStepBack: boolean;
  canStepForward: boolean;
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

  private planSteps: PlannedStep[] = [];
  private planCursor = 0;
  /** Items committed by the plan, indexed by step; null for pause steps. */
  private committedByStep: (WhiteboardItem | null)[] = [];
  private current: AnimCursor | null = null;
  private idle = 0;
  private speechActive = false;
  private waitForSpeech = false;
  private speechTimeout: number | null = null;

  private pointerStroke: { item: WhiteboardItem; pts: Point[]; pressures: number[] } | null = null;
  private shapeDraft: { tool: ShapeKind; anchor: Point; current: Point } | null = null;
  private selectionDraft: { kind: SelectionKind; anchor: Point; current: Point; path: Point[] } | null = null;

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
    useWhiteboardStore.getState().setSubtitle(text);
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
    useWhiteboardStore.getState().setSubtitle(null);
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
    } else if (item.kind === "shape") {
      total = SHAPE_REVEAL_MS;
    } else {
      total = Math.max(1, pathLength(item.points));
    }
    this.current = { step, revealed: 0, total, textChars };
    this.setAnimating(true);
  }

  private cancelSpeech(): void {
    this.speechActive = false;
    this.waitForSpeech = false;
    useWhiteboardStore.getState().setSubtitle(null);
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
    this.planSteps = [];
    this.planCursor = 0;
    this.committedByStep = [];
    this.current = null;
    this.pointerStroke = null;
    this.shapeDraft = null;
    this.selectionDraft = null;
    this.spriteCache.clear();
    this.cancelSpeech();
    this.pushState();
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
    this.planSteps = steps;
    this.committedByStep = new Array(steps.length).fill(null);
    this.idle = 160;
    this.advance(0);
    this.setAnimating(true);
    this.needsRender = true;
    this.pushState();
  }

  stopDrawing(): void {
    this.planSteps = [];
    this.planCursor = 0;
    this.committedByStep = [];
    this.current = null;
    this.idle = 0;
    this.setAnimating(false);
    this.cancelSpeech();
    this.needsRender = true;
    this.pushState();
  }

  /**
   * Move the AI plan forward one step. A step that is mid-animation is fast-
   * forwarded to its finished state; otherwise the next pending step starts
   * playing. Playback then continues through the remaining steps on its own.
   */
  stepForward(): boolean {
    if (this.planSteps.length === 0) return false;
    if (this.current !== null) {
      const cur = this.current;
      cur.revealed = cur.total;
      this.cancelSpeech();
      this.commitCurrentStep();
      this.needsRender = true;
      return true;
    }
    if (this.planCursor >= this.planSteps.length) return false;
    this.startNext();
    this.needsRender = true;
    return true;
  }

  /**
   * Move the AI plan back one step each time it is pressed. Any mid-flight
   * drawing is cancelled and the previous step's committed items are removed,
   * so holding/pressing Back repeatedly retreats any number of steps. Playback
   * then re-plays from the retreated position and continues through the end.
   */
  stepBack(): boolean {
    if (this.planSteps.length === 0) return false;
    if (this.current !== null) {
      this.current = null;
      this.idle = 0;
    }
    if (this.planCursor <= 0) return false;
    const prevItem = this.committedByStep[this.planCursor - 1];
    this.committedByStep[this.planCursor - 1] = null;
    this.planCursor -= 1;
    if (prevItem) {
      useWhiteboardStore.setState((s) => ({ items: s.items.filter((i) => i.id !== prevItem.id) }));
    }
    this.cancelSpeech();
    this.setAnimating(false);
    this.needsRender = true;
    this.pushState();
    return true;
  }

  get isAnimating(): boolean {
    return this.animating;
  }

  private canStepBack(): boolean {
    return this.planSteps.length > 0 && (this.current !== null || this.planCursor > 0);
  }

  private canStepForward(): boolean {
    return this.planSteps.length > 0 && (this.current !== null || this.planCursor < this.planSteps.length);
  }

  private pushState(): void {
    const animating = this.animating;
    const canStepBack = this.canStepBack();
    const canStepForward = this.canStepForward();
    this.onState?.({ animating, canStepBack, canStepForward });
    useWhiteboardStore.getState().setPlanStep(
      this.planSteps.length > 0
        ? {
            canBack: canStepBack,
            canForward: canStepForward,
            index: Math.min(this.planCursor + (this.current !== null ? 1 : 0), this.planSteps.length),
            total: this.planSteps.length,
          }
        : null,
    );
  }

  private setAnimating(v: boolean): void {
    this.animating = v;
    this.pushState();
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

  // ── Region selection (circle / lasso marquee) ────────────────────────

  startSelection(world: Point, kind: SelectionKind): void {
    this.selectionDraft = { kind, anchor: world, current: world, path: [world] };
    this.needsRender = true;
  }

  moveSelection(world: Point): void {
    const d = this.selectionDraft;
    if (!d) return;
    if (d.kind === "lasso") {
      const last = d.path[d.path.length - 1];
      if (last && Math.hypot(world.x - last.x, world.y - last.y) < 1.5) return;
      d.path.push(world);
    }
    d.current = world;
    this.needsRender = true;
  }

  cancelSelection(): void {
    this.selectionDraft = null;
    this.needsRender = true;
  }

  finishSelection(): void {
    const d = this.selectionDraft;
    this.selectionDraft = null;
    if (!d) return;
    let poly: Point[];
    if (d.kind === "ellipse") {
      const rx = Math.abs(d.current.x - d.anchor.x) / 2;
      const ry = Math.abs(d.current.y - d.anchor.y) / 2;
      if (rx < SELECTION_LOOP_MIN && ry < SELECTION_LOOP_MIN) {
        this.needsRender = true;
        return;
      }
      poly = polygonFromEllipse((d.anchor.x + d.current.x) / 2, (d.anchor.y + d.current.y) / 2, rx, ry);
    } else {
      poly = d.path;
      if (poly.length < 3) {
        this.needsRender = true;
        return;
      }
      let min = Infinity;
      let max = -Infinity;
      for (const p of poly) {
        min = Math.min(min, p.x, p.y);
        max = Math.max(max, p.x, p.y);
      }
      // Close the loop and reject near-degenerate scribbles.
      if (max - min < SELECTION_LOOP_MIN) {
        this.needsRender = true;
        return;
      }
      const first = poly[0];
      const last = poly[poly.length - 1];
      if (Math.hypot(last.x - first.x, last.y - first.y) > 0.01) poly.push(first);
    }
    useWhiteboardStore.getState().setSelection({ kind: d.kind, poly });
    this.needsRender = true;
  }

  // ── Main loop ───────────────────────────────────────────────────────

  private tick = (t: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, (t - this.lastTime) / 1000);
    this.lastTime = t;
    if (
      this.current ||
      this.idle > 0 ||
      this.waitForSpeech ||
      this.planCursor < this.planSteps.length
    ) {
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
          } else if (this.planCursor < this.planSteps.length) {
            this.startNext();
          } else {
            this.setAnimating(false);
            this.pushState();
          }
        }
      }
      return;
    }

    if (!this.current) {
      if (this.planCursor < this.planSteps.length) {
        this.startNext();
        return;
      }
      return;
    }

    const cur = this.current;
    if (!cur) return;
    if (!cur.step.item) return;

    const item = cur.step.item;
    if (item.kind === "text") {
      cur.revealed += 70 * speedMultiplier(speed) * (ms / 1000);
    } else if (item.kind === "shape") {
      cur.revealed += speedMultiplier(speed) * ms;
    } else {
      cur.revealed += pxPerSecond(speed) * (ms / 1000);
    }
    if (cur.revealed >= cur.total) {
      this.commitCurrentStep();
    }
  }

  private startNext(): void {
    this.waitForSpeech = false;
    if (this.planCursor >= this.planSteps.length) {
      this.setAnimating(false);
      this.pushState();
      return;
    }
    const step = this.planSteps[this.planCursor];
    // Pause steps carry no item; consume them and just honour the delay.
    if (step.kind === "pause") {
      this.planCursor += 1;
      this.idle = step.duration ?? 400;
      if (step.explain) {
        this.speakText(step.explain);
      } else {
        useWhiteboardStore.getState().setSubtitle(null);
      }
      this.pushState();
      return;
    }
    // Speak narration and begin drawing the step at the same time.
    if (step.explain) {
      this.speakText(step.explain);
    } else {
      useWhiteboardStore.getState().setSubtitle(null);
    }
    this.resumeStep(step);
    this.pushState();
  }

  private commitCurrentStep(): void {
    const cur = this.current;
    const item = cur?.step.item;
    if (!item) return;
    this.commitItem(item);
    this.committedByStep[this.planCursor] = item;
    this.current = null;
    this.planCursor += 1;
    this.idle = interStrokeDelayMs(useWhiteboardStore.getState().speed);
    this.pushState();
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
    this.drawSelection(ctx);
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

  /** Dashed accent marquee for the live drag and any committed selection. */
  private drawSelection(ctx: CanvasRenderingContext2D): void {
    const { camera } = useWhiteboardStore.getState();
    let poly: Point[] | null = null;
    const d = this.selectionDraft;
    if (d) {
      poly = d.kind === "ellipse"
        ? polygonFromEllipse((d.anchor.x + d.current.x) / 2, (d.anchor.y + d.current.y) / 2, Math.abs(d.current.x - d.anchor.x) / 2, Math.abs(d.current.y - d.anchor.y) / 2)
        : d.path;
    } else {
      const sel = useWhiteboardStore.getState().selection;
      if (sel) poly = sel.poly;
    }
    if (!poly || poly.length < 2) return;

    ctx.save();
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 2 / camera.zoom;
    ctx.setLineDash([6 / camera.zoom, 5 / camera.zoom]);
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    if (poly.length >= 3) {
      ctx.fillStyle = "rgba(225, 29, 72, 0.07)";
      ctx.fill();
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Convert CSS client coordinates (relative to the canvas element's rect) to world coordinates. */
  screenToWorld(clientX: number, clientY: number, cssRect: DOMRect): Point {
    const { camera, viewport } = useWhiteboardStore.getState();
    return screenToWorldPoint(clientX - cssRect.left, clientY - cssRect.top, camera, viewport);
  }
}