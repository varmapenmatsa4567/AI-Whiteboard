import type { DrawingCommand, DrawingPlan, Point } from "@/types/drawing";
import type { SemanticDiagram } from "./model";
import { layoutDiagram } from "./layout-engine";
import { validateLayout } from "./validate";

const PAD = 18;
const HEADER_GAP = 8;

export function semanticToDrawingPlan(diagram: SemanticDiagram): DrawingPlan {
  const layout = layoutDiagram(diagram, { originX: 0, originY: 0 });
  const issues = validateLayout(layout);
  const errors = issues.filter((issue) => ["invalid-node", "invalid-edge", "node-overlap", "edge-through-node"].includes(issue.code));
  if (errors.length) throw new Error(`Layout validation failed: ${errors.map((e) => e.message).join("; ")}`);

  const allRects = [...layout.nodes.map((n) => n.rect), ...layout.groups.map((g) => g.rect)];
  const minX = Math.min(...allRects.map((r) => r.x), 0); const minY = Math.min(...allRects.map((r) => r.y), 0);
  const maxX = Math.max(...allRects.map((r) => r.x + r.width), 1); const maxY = Math.max(...allRects.map((r) => r.y + r.height), 1);
  const scale = Math.min(860 / Math.max(1, maxX - minX), 860 / Math.max(1, maxY - minY));
  const sx = (x: number) => 70 + (x - minX) * scale; const sy = (y: number) => 70 + (y - minY) * scale;
  const sw = (w: number) => w * scale; const sh = (h: number) => h * scale;
  const font = (size: number) => Math.max(12, Math.min(28, size * Math.min(1, scale)));

  const commands: DrawingCommand[] = [];
  for (const group of layout.groups) {
    commands.push({ type: "rect", x: sx(group.rect.x), y: sy(group.rect.y), width: sw(group.rect.width), height: sh(group.rect.height), strokeWidth: 3, color: "#64748b" });
    if (group.title) commands.push({ type: "text", x: sx(group.rect.x) + PAD, y: sy(group.rect.y) + 28, text: group.title, fontSize: font(22), color: "#475569" });
  }
  for (const edge of layout.edges) {
    const points = edge.points.map((p) => ({ x: sx(p.x), y: sy(p.y) })); commands.push(...polylineCommands(points, edge.label, font(16)));
  }
  for (const node of layout.nodes) {
    const r = node.rect;
    if (node.type !== "label") commands.push({ type: "rect", x: sx(r.x), y: sy(r.y), width: sw(r.width), height: sh(r.height), strokeWidth: 4, color: "#1e293b", fill: "#f8fafc" });
    let y = sy(r.y) + 30; const x = sx(r.x) + PAD;
    if (node.title) { const size = font(24); commands.push({ type: "text", x, y, text: node.title, fontSize: size, color: "#0f172a" }); y += size * 1.35 + HEADER_GAP; }
    if (node.description) { const size = font(18); commands.push({ type: "text", x, y, text: node.description, fontSize: size, color: "#334155" }); y += size * 1.35 + HEADER_GAP; }
    for (const item of node.items ?? []) { const size = font(18); commands.push({ type: "text", x, y, text: `• ${item}`, fontSize: size, color: "#334155" }); y += size * 1.35 + HEADER_GAP; }
  }
  return { description: diagram.description ?? "Generated a structured diagram with automatic layout.", commands: [{ type: "pause", duration: 250, explain: "First, I place the diagram structure so every part has room to breathe." }, ...commands] };
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
