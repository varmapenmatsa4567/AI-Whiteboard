import type { DrawingCommand, DrawingPlan } from "@/types/drawing";

interface Rect { x: number; y: number; width: number; height: number }
interface TextBox extends Rect { index: number; fontSize: number; text: string }

const PAD = 24;
const TITLE_GAP = 12;
const CHAR_FACTOR = 0.56;

/**
 * Compatibility layout pass for the existing command protocol.
 * The model can still describe diagrams with rect/text/arrow commands, but
 * geometry is corrected here so labels stay inside their containers and
 * arrows terminate at container boundaries.
 */
export function stabilizeLegacyPlan(plan: DrawingPlan): DrawingPlan {
  const commands = plan.commands.map((c) => ({ ...c } as DrawingCommand));
  const rects = commands
    .map((command, index) => ({ command, index }))
    .filter((x): x is { command: Extract<DrawingCommand, { type: "rect" }>; index: number } => x.command.type === "rect");
  const texts = commands
    .map((command, index) => ({ command, index }))
    .filter((x): x is { command: Extract<DrawingCommand, { type: "text" }>; index: number } => x.command.type === "text");

  if (rects.length === 0 || texts.length === 0) return plan;

  const textBoxes: TextBox[] = texts.map(({ command, index }) => ({
    index,
    x: command.x,
    y: command.y - (command.fontSize ?? 22),
    width: estimateTextWidth(command.text, command.fontSize ?? 22),
    height: (command.fontSize ?? 22) * 1.25,
    fontSize: command.fontSize ?? 22,
    text: command.text,
  }));

  // Assign each text to the smallest containing rectangle; otherwise nearest.
  const assignments = new Map<number, number[]>();
  for (const text of textBoxes) {
    let best = -1;
    let bestArea = Infinity;
    for (const { command, index } of rects) {
      const r = command;
      if (contains({ x: r.x, y: r.y, width: r.width, height: r.height }, text)) {
        const area = r.width * r.height;
        if (area < bestArea) {
          best = index;
          bestArea = area;
        }
      }
    }
    if (best < 0) best = nearestRect(text, rects.map((r) => ({ ...r.command, index: r.index })));
    if (best >= 0) assignments.set(best, [...(assignments.get(best) ?? []), text.index]);
  }

  // Grow containers to accommodate their assigned content, then place labels.
  for (const { command, index } of rects) {
    const assigned = assignments.get(index) ?? [];
    if (assigned.length === 0) continue;
    const r = command;
    const minWidth = Math.max(r.width, ...assigned.map((i) => textBoxes.find((t) => t.index === i)?.width ?? 0).map((w) => w + PAD * 2));
    const requiredHeight = assigned.reduce((sum, i) => sum + (textBoxes.find((t) => t.index === i)?.height ?? 24), 0) + PAD * 2 + Math.max(0, assigned.length - 1) * TITLE_GAP;
    r.width = Math.min(2000, Math.max(r.width, minWidth));
    r.height = Math.min(2000, Math.max(r.height, requiredHeight));

    let y = r.y + PAD;
    for (const textIndex of assigned) {
      const textCommand = commands[textIndex];
      if (textCommand.type !== "text") continue;
      const size = textCommand.fontSize ?? 22;
      const maxWidth = Math.max(40, r.width - PAD * 2);
      if (estimateTextWidth(textCommand.text, size) > maxWidth) {
        textCommand.fontSize = Math.max(14, Math.floor(maxWidth / Math.max(1, textCommand.text.length * CHAR_FACTOR)));
      }
      textCommand.x = r.x + PAD;
      textCommand.y = y + (textCommand.fontSize ?? 22);
      y += (textCommand.fontSize ?? 22) * 1.25 + TITLE_GAP;
    }
  }

  // Reposition every arrow so it connects container boundaries instead of
  // crossing through their interiors. Preserve the model's source/target
  // intent by selecting the containers closest to each endpoint.
  for (const command of commands) {
    if (command.type !== "arrow" && command.type !== "darrow") continue;
    const source = containingRect(command.x1, command.y1, rects);
    const target = containingRect(command.x2, command.y2, rects);
    if (!source || !target || source.index === target.index) continue;
    const start = boundary(source.command, center(target.command));
    const end = boundary(target.command, center(source.command));
    command.x1 = start.x;
    command.y1 = start.y;
    command.x2 = end.x;
    command.y2 = end.y;
  }

  return { ...plan, commands };
}

function estimateTextWidth(text: string, fontSize: number): number {
  return Math.max(fontSize, text.trim().length * fontSize * CHAR_FACTOR);
}

function contains(r: Rect, b: Rect): boolean {
  return b.x >= r.x && b.y >= r.y && b.x + b.width <= r.x + r.width && b.y + b.height <= r.y + r.height;
}

function center(r: Rect) { return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }

function nearestRect(text: TextBox, rects: Array<Rect & { index: number }>): number {
  const tx = text.x + text.width / 2;
  const ty = text.y + text.height / 2;
  let best = -1;
  let distance = Infinity;
  for (const r of rects) {
    const c = center(r);
    const d = Math.hypot(tx - c.x, ty - c.y);
    if (d < distance) { distance = d; best = r.index; }
  }
  return best;
}

function containingRect(x: number, y: number, rects: Array<{ command: Extract<DrawingCommand, { type: "rect" }>; index: number }>) {
  return rects.find(({ command }) => x >= command.x && x <= command.x + command.width && y >= command.y && y <= command.y + command.height);
}

function boundary(r: Rect, toward: { x: number; y: number }) {
  const c = center(r);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? { x: r.x + r.width, y: c.y } : { x: r.x, y: c.y };
  return dy >= 0 ? { x: c.x, y: r.y + r.height } : { x: c.x, y: r.y };
}