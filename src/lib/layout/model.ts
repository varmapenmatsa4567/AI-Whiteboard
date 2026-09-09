import type { DrawingCommand, DrawingPlan, Point } from "@/types/drawing";

export type LayoutDirection = "top-to-bottom" | "left-to-right" | "freeform";
export type LayoutNodeType = "card" | "label" | "shape" | "container";

export interface SemanticNode { id: string; type: LayoutNodeType; title?: string; description?: string; items?: string[]; width?: number; height?: number; }
export interface SemanticEdge { id: string; source: string; target: string; label?: string; }
export interface SemanticGroup { id: string; title?: string; children: string[]; }
export interface SemanticDiagram { description?: string; nodes: SemanticNode[]; edges: SemanticEdge[]; groups: SemanticGroup[]; direction: LayoutDirection; }
export interface LayoutRect { x: number; y: number; width: number; height: number; }
export interface LaidOutNode extends SemanticNode { rect: LayoutRect; }
export interface LayoutEdge extends SemanticEdge { points: Point[]; }
export interface LayoutResult { nodes: LaidOutNode[]; edges: LayoutEdge[]; groups: Array<SemanticGroup & { rect: LayoutRect }>; }

/** Compatibility adapter for old command plans. It is intentionally conservative: only rect/text/arrow diagrams are converted. */
export function planToSemantic(plan: DrawingPlan): SemanticDiagram | null {
  const commands = flatten(plan.commands);
  const rects = commands.filter((c): c is Extract<DrawingCommand, { type: "rect" }> => c.type === "rect");
  const texts = commands.filter((c): c is Extract<DrawingCommand, { type: "text" }> => c.type === "text");
  const arrows = commands.filter((c): c is Extract<DrawingCommand, { type: "arrow" | "darrow" }> => c.type === "arrow" || c.type === "darrow");
  if (rects.length === 0 || texts.length === 0) return null;

  const nodes: SemanticNode[] = rects.map((r, i) => ({ id: `node-${i + 1}`, type: "card", width: r.width, height: r.height }));
  for (const text of texts) {
    const containing = rects
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => text.x >= r.x && text.x <= r.x + r.width && text.y >= r.y && text.y <= r.y + r.height)
      .sort((a, b) => a.r.width * a.r.height - b.r.width * b.r.height)[0];
    if (!containing) continue;
    const node = nodes[containing.i];
    if (!node.title) node.title = text.text;
    else node.items = [...(node.items ?? []), text.text];
  }

  const edges: SemanticEdge[] = [];
  for (let i = 0; i < arrows.length; i++) {
    const a = arrows[i];
    const source = findNodeByPoint(nodes, a.x1, a.y1, rects);
    const target = findNodeByPoint(nodes, a.x2, a.y2, rects);
    if (source && target && source !== target) edges.push({ id: `edge-${i + 1}`, source, target });
  }
  if (nodes.every((n) => !n.title)) return null;
  return { description: plan.description, nodes, edges, groups: [], direction: "left-to-right" };
}

export function flatten(commands: DrawingCommand[]): DrawingCommand[] {
  const out: DrawingCommand[] = [];
  for (const command of commands) command.type === "group" ? out.push(...flatten(command.commands)) : out.push(command);
  return out;
}

function findNodeByPoint(nodes: SemanticNode[], x: number, y: number, rects: Extract<DrawingCommand, { type: "rect" }>[]): string | null {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return nodes[i]?.id ?? null;
  }
  return null;
}
