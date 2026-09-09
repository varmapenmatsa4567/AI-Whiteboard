import type { DrawingCommand, DrawingPlan, Point } from "@/types/drawing";
import type { SemanticDiagram } from "./model";
import { layoutDiagram } from "./layout-engine";
import { measureText } from "./text-measure";
import { validateLayout } from "./validate";
import { displayNodeContent } from "./display-content";

const PAD = 18;
const HEADER_GAP = 8;
const BODY_LINE_HEIGHT = 1.3;

export function semanticToDrawingPlan(diagram: SemanticDiagram): DrawingPlan {
  const layout = layoutDiagram(diagram, {
    originX: 0,
    originY: 0,
    maxColumns: diagram.nodes.length > 14 ? 5 : 4,
  });
  const issues = validateLayout(layout);

  // Validation is deliberately visible in the browser console. Warnings do
  // not make a useful semantic diagram disappear; fatal geometry issues still
  // throw because drawing invalid geometry cannot be made safe downstream.
  if (issues.length) {
    console.groupCollapsed(`[AI Whiteboard] Layout validation: ${issues.length} issue(s)`);
    for (const issue of issues) console.warn(`[${issue.code}] ${issue.message}`);
    console.groupEnd();
  }
  const fatal = issues.filter((issue) => issue.code === "invalid-node" || issue.code === "invalid-edge" || issue.code === "node-overlap");
  if (fatal.length) {
    console.error("[AI Whiteboard] Fatal layout validation failure", fatal);
    throw new Error(`Layout validation failed: ${fatal.map((e) => e.message).join("; ")}`);
  }

  const allRects = [...layout.nodes.map((n) => n.rect), ...layout.groups.map((g) => g.rect)];
  const minX = Math.min(...allRects.map((r) => r.x), 0);
  const minY = Math.min(...allRects.map((r) => r.y), 0);
  const maxX = Math.max(...allRects.map((r) => r.x + r.width), 1);
  const maxY = Math.max(...allRects.map((r) => r.y + r.height), 1);
  const rawWidth = Math.max(1, maxX - minX);
  const rawHeight = Math.max(1, maxY - minY);
  const scale = Math.min(860 / rawWidth, 860 / rawHeight);
  console.info("[AI Whiteboard] Semantic layout", {
    nodes: diagram.nodes.length,
    edges: diagram.edges.length,
    groups: diagram.groups.length,
    rawWidth,
    rawHeight,
    scale,
    minRenderedFont: Math.max(8, 18 * Math.min(1, scale)),
  });

  const sx = (x: number) => 70 + (x - minX) * scale;
  const sy = (y: number) => 70 + (y - minY) * scale;
  const sw = (w: number) => w * scale;
  const sh = (h: number) => h * scale;
  const pad = Math.max(6, PAD * Math.min(1, scale));
  const gap = Math.max(4, HEADER_GAP * Math.min(1, scale));
  // Keep text proportional to the card geometry. A fixed 9px minimum was the
  // source of the previous overflow: tiny scaled cards still received large
  // text. The world renderer itself enforces a safe 8px floor.
  const font = (size: number) => Math.max(8, Math.min(28, size * scale));
  const commands: DrawingCommand[] = [];

  for (const group of layout.groups) {
    commands.push({ type: "rect", x: sx(group.rect.x), y: sy(group.rect.y), width: sw(group.rect.width), height: sh(group.rect.height), strokeWidth: 3, color: "#64748b" });
    if (group.title) commands.push({ type: "text", x: sx(group.rect.x) + pad, y: sy(group.rect.y) + Math.max(18, 26 * scale), text: group.title, fontSize: font(20), color: "#475569" });
  }

  for (const edge of layout.edges) {
    const points = edge.points.map((p) => ({ x: sx(p.x), y: sy(p.y) }));
    commands.push(...polylineCommands(points, edge.label, font(14)));
  }

  for (const node of layout.nodes) {
    const content = displayNodeContent(node, diagram.nodes.length);
    const r = node.rect;
    const x = sx(r.x) + pad;
    const availableWidth = Math.max(24, sw(r.width) - pad * 2);
    if (node.type !== "label") commands.push({ type: "rect", x: sx(r.x), y: sy(r.y), width: sw(r.width), height: sh(r.height), strokeWidth: 4, color: "#1e293b", fill: "#f8fafc" });

    let y = sy(r.y) + Math.max(18, 28 * scale);
    if (content.title) { const size = font(diagram.nodes.length > 14 ? 20 : 24); y = drawTextLines(commands, wrapText(content.title, size, availableWidth, 1.1), x, y, size, 1.1, "#0f172a"); y += gap; }
    if (content.description) { const size = font(diagram.nodes.length > 14 ? 14 : 18); y = drawTextLines(commands, wrapText(content.description, size, availableWidth, BODY_LINE_HEIGHT), x, y, size, BODY_LINE_HEIGHT, "#334155"); y += gap; }
    for (const item of content.items) { const size = font(diagram.nodes.length > 14 ? 14 : 18); y = drawTextLines(commands, wrapText(`• ${item}`, size, availableWidth, BODY_LINE_HEIGHT), x, y, size, BODY_LINE_HEIGHT, "#334155"); y += gap; }

    const bottom = sy(r.y + r.height) - pad;
    if (y > bottom + 1) console.error(`[AI Whiteboard] text-overflow node=${node.id}`, { bottom, renderedBottom: y, rect: r });
  }

  return {
    description: diagram.description ?? "Generated a structured diagram with automatic layout.",
    commands: [{ type: "pause", duration: 250, explain: "First, I place the diagram structure so every part has room to breathe." }, ...commands],
  };
}

function drawTextLines(commands: DrawingCommand[], lines: string[], x: number, y: number, fontSize: number, lineHeight: number, color: string): number {
  for (const line of lines) { commands.push({ type: "text", x, y, text: line, fontSize, color }); y += fontSize * lineHeight; }
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
    if (!current || measureText(candidate, { fontSize, lineHeight }, maxWidth).lines === 1) current = candidate;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.flatMap((line) => {
    if (measureText(line, { fontSize, lineHeight }, maxWidth).width <= maxWidth) return [line];
    const chunks: string[] = []; let chunk = "";
    for (const char of line) {
      const candidate = chunk + char;
      if (chunk && measureText(candidate, { fontSize, lineHeight }, maxWidth).width > maxWidth) { chunks.push(chunk); chunk = char; }
      else chunk = candidate;
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
    out.push({ type: last ? "arrow" : "line", x1: points[i].x, y1: points[i].y, x2: points[i + 1].x, y2: points[i + 1].y, strokeWidth: 3, color: "#64748b" });
  }
  if (label) { const mid = points[Math.floor(points.length / 2)]; out.push({ type: "text", x: mid.x + 8, y: mid.y - 8, text: label, fontSize: labelSize, color: "#475569" }); }
  return out;
}
