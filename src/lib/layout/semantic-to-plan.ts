import type { DrawingCommand, DrawingPlan, Point } from "@/types/drawing";
import type { SemanticDiagram } from "./model";
import { layoutDiagram } from "./layout-engine";
import { measureText } from "./text-measure";
import { validateLayout } from "./validate";

const PAD = 18;
const HEADER_GAP = 8;
const BODY_LINE_HEIGHT = 1.35;

export function semanticToDrawingPlan(diagram: SemanticDiagram): DrawingPlan {
  const layout = layoutDiagram(diagram, { originX: 0, originY: 0 });
  const issues = validateLayout(layout);

  // A semantic diagram is only accepted when the deterministic geometry pass
  // produces a valid result. The router is responsible for avoiding unrelated
  // nodes; silently accepting an invalid route would reintroduce visual overlap.
  if (issues.length) {
    throw new Error(`Layout validation failed: ${issues.map((issue) => issue.message).join("; ")}`);
  }

  const allRects = [...layout.nodes.map((n) => n.rect), ...layout.groups.map((g) => g.rect)];
  const minX = Math.min(...allRects.map((r) => r.x), 0);
  const minY = Math.min(...allRects.map((r) => r.y), 0);
  const maxX = Math.max(...allRects.map((r) => r.x + r.width), 1);
  const maxY = Math.max(...allRects.map((r) => r.y + r.height), 1);
  const scale = Math.min(
    860 / Math.max(1, maxX - minX),
    860 / Math.max(1, maxY - minY)
  );
  const sx = (x: number) => 70 + (x - minX) * scale;
  const sy = (y: number) => 70 + (y - minY) * scale;
  const sw = (w: number) => w * scale;
  const sh = (h: number) => h * scale;
  const pad = Math.max(6, PAD * Math.min(1, scale));
  const gap = Math.max(4, HEADER_GAP * Math.min(1, scale));
  const font = (size: number) => Math.max(9, Math.min(28, size * Math.min(1, scale)));
  const commands: DrawingCommand[] = [];

  for (const group of layout.groups) {
    commands.push({
      type: "rect",
      x: sx(group.rect.x),
      y: sy(group.rect.y),
      width: sw(group.rect.width),
      height: sh(group.rect.height),
      strokeWidth: 3,
      color: "#64748b",
    });
    if (group.title) {
      commands.push({
        type: "text",
        x: sx(group.rect.x) + pad,
        y: sy(group.rect.y) + Math.max(20, 28 * Math.min(1, scale)),
        text: group.title,
        fontSize: font(22),
        color: "#475569",
      });
    }
  }

  for (const edge of layout.edges) {
    const points = edge.points.map((p) => ({ x: sx(p.x), y: sy(p.y) }));
    commands.push(...polylineCommands(points, edge.label, font(16)));
  }

  for (const node of layout.nodes) {
    const r = node.rect;
    const x = sx(r.x) + pad;
    const availableWidth = Math.max(24, sw(r.width) - pad * 2);

    if (node.type !== "label") {
      commands.push({
        type: "rect",
        x: sx(r.x),
        y: sy(r.y),
        width: sw(r.width),
        height: sh(r.height),
        strokeWidth: 4,
        color: "#1e293b",
        fill: "#f8fafc",
      });
    }

    let y = sy(r.y) + Math.max(20, 30 * Math.min(1, scale));
    if (node.title) {
      const size = font(24);
      const lines = wrapText(node.title, size, availableWidth, 1.15);
      y = drawTextLines(commands, lines, x, y, size, 1.15, "#0f172a");
      y += gap;
    }
    if (node.description) {
      const size = font(18);
      const lines = wrapText(node.description, size, availableWidth, BODY_LINE_HEIGHT);
      y = drawTextLines(commands, lines, x, y, size, BODY_LINE_HEIGHT, "#334155");
      y += gap;
    }
    for (const item of node.items ?? []) {
      const size = font(18);
      const lines = wrapText(`• ${item}`, size, availableWidth, BODY_LINE_HEIGHT);
      y = drawTextLines(commands, lines, x, y, size, BODY_LINE_HEIGHT, "#334155");
      y += gap;
    }
  }

  return {
    description: diagram.description ?? "Generated a structured diagram with automatic layout.",
    commands: [
      {
        type: "pause",
        duration: 250,
        explain: "First, I place the diagram structure so every part has room to breathe.",
      },
      ...commands,
    ],
  };
}

function drawTextLines(
  commands: DrawingCommand[],
  lines: string[],
  x: number,
  y: number,
  fontSize: number,
  lineHeight: number,
  color: string
): number {
  for (const line of lines) {
    commands.push({ type: "text", x, y, text: line, fontSize, color });
    y += fontSize * lineHeight;
  }
  return y;
}

function wrapText(text: string, fontSize: number, maxWidth: number, lineHeight: number): string[] {
  const normalized = text.trim();
  if (!normalized) return [];

  const words = normalized.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || measureText(candidate, { fontSize, lineHeight }, maxWidth).lines === 1) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) lines.push(current);

  return lines.flatMap((line) => {
    if (measureText(line, { fontSize, lineHeight }, maxWidth).width <= maxWidth) return [line];
    const chunks: string[] = [];
    let chunk = "";
    for (const char of line) {
      const candidate = chunk + char;
      if (chunk && measureText(candidate, { fontSize, lineHeight }, maxWidth).width > maxWidth) {
        chunks.push(chunk);
        chunk = char;
      } else {
        chunk = candidate;
      }
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  });
}

function polylineCommands(points: Point[], label?: string, labelSize = 16): DrawingCommand[] {
  if (points.length < 2) return [];
  const out: DrawingCommand[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const last = i === points.length - 2;
    out.push({
      type: last ? "arrow" : "line",
      x1: points[i].x,
      y1: points[i].y,
      x2: points[i + 1].x,
      y2: points[i + 1].y,
      strokeWidth: 3,
      color: "#64748b",
    });
  }
  if (label) {
    const mid = points[Math.floor(points.length / 2)];
    out.push({
      type: "text",
      x: mid.x + 8,
      y: mid.y - 8,
      text: label,
      fontSize: labelSize,
      color: "#475569",
    });
  }
  return out;
}
