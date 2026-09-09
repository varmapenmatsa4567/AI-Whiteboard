import type { LayoutResult } from "./model";
import { pointsCrossRect, rectsOverlap, inflateRect } from "./geometry";

export interface LayoutIssue {
  code: "node-overlap" | "edge-through-node" | "invalid-node" | "invalid-edge" | "group-overflow";
  message: string;
}

export function validateLayout(result: LayoutResult): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  for (const node of result.nodes) {
    if (![node.rect.x, node.rect.y, node.rect.width, node.rect.height].every(Number.isFinite) || node.rect.width <= 0 || node.rect.height <= 0) {
      issues.push({ code: "invalid-node", message: `Node ${node.id} has invalid geometry.` });
    }
  }
  for (let i = 0; i < result.nodes.length; i++) {
    for (let j = i + 1; j < result.nodes.length; j++) {
      if (rectsOverlap(inflateRect(result.nodes[i].rect, 8), result.nodes[j].rect)) {
        issues.push({ code: "node-overlap", message: `Nodes ${result.nodes[i].id} and ${result.nodes[j].id} overlap.` });
      }
    }
  }
  for (const edge of result.edges) {
    if (edge.points.length < 2 || edge.points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
      issues.push({ code: "invalid-edge", message: `Edge ${edge.id} has invalid routing.` });
      continue;
    }
    for (const node of result.nodes) {
      if (node.id === edge.source || node.id === edge.target) continue;
      if (pointsCrossRect(edge.points, node.rect, 4)) {
        issues.push({ code: "edge-through-node", message: `Edge ${edge.id} crosses node ${node.id}.` });
      }
    }
  }
  for (const group of result.groups) {
    for (const id of group.children) {
      const node = result.nodes.find((n) => n.id === id);
      if (!node || !contains(group.rect, node.rect)) issues.push({ code: "group-overflow", message: `Group ${group.id} does not contain ${id}.` });
    }
  }
  return issues;
}

function contains(outer: { x: number; y: number; width: number; height: number }, inner: { x: number; y: number; width: number; height: number }): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}