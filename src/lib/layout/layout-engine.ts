import type { SemanticDiagram, LayoutEdge, LayoutResult, LaidOutNode } from "./model";
import { boundsOf, inflateRect, orthogonalRoute, pointsCrossRect, rectsOverlap, type Rect } from "./geometry";
import { measureCardSize } from "./text-measure";

const NODE_GAP = 56;
const LAYER_GAP = 100;
const GROUP_PADDING = 32;

export interface LayoutOptions {
  originX?: number;
  originY?: number;
  maxColumns?: number;
}

export function layoutDiagram(diagram: SemanticDiagram, options: LayoutOptions = {}): LayoutResult {
  const originX = options.originX ?? 80;
  const originY = options.originY ?? 80;
  const nodes = diagram.nodes.map((node) => {
    const size = measureCardSize(node);
    return { ...node, rect: { x: 0, y: 0, width: size.width, height: size.height } } as LaidOutNode;
  });

  const depth = assignDepths(diagram);
  const layers = new Map<number, LaidOutNode[]>();
  for (const node of nodes) {
    const d = depth.get(node.id) ?? 0;
    const layer = layers.get(d) ?? [];
    layer.push(node);
    layers.set(d, layer);
  }

  const direction = diagram.direction === "top-to-bottom" ? "tb" : "lr";
  const orderedLayers = [...layers.keys()].sort((a, b) => a - b);
  let cursor = direction === "lr" ? originX : originY;
  const crossCursor = direction === "lr" ? originY : originX;

  for (const key of orderedLayers) {
    const layer = layers.get(key) ?? [];
    let cross = crossCursor;
    let layerSize = 0;
    for (const node of layer) layerSize += direction === "lr" ? node.rect.height : node.rect.width;
    layerSize += Math.max(0, layer.length - 1) * NODE_GAP;
    for (const node of layer) {
      if (direction === "lr") {
        node.rect.x = cursor;
        node.rect.y = cross;
        cross += node.rect.height + NODE_GAP;
        layerSize = Math.max(layerSize, node.rect.height);
      } else {
        node.rect.x = cross;
        node.rect.y = cursor;
        cross += node.rect.width + NODE_GAP;
        layerSize = Math.max(layerSize, node.rect.width);
      }
    }
    cursor += layerSize + LAYER_GAP;
  }

  relaxCollisions(nodes);

  const edges: LayoutEdge[] = diagram.edges.flatMap((edge) => {
    const source = nodes.find((n) => n.id === edge.source);
    const target = nodes.find((n) => n.id === edge.target);
    if (!source || !target) return [];
    let points = orthogonalRoute(source.rect, target.rect);
    const obstacles = nodes.filter((n) => n.id !== source.id && n.id !== target.id).map((n) => n.rect);
    if (obstacles.some((o) => pointsCrossRect(points, o, 8))) points = rerouteAroundObstacles(source.rect, target.rect, obstacles);
    return [{ ...edge, points }];
  });

  const groups = diagram.groups.map((group) => {
    const children = nodes.filter((n) => group.children.includes(n.id)).map((n) => n.rect);
    const rect = boundsOf(children, GROUP_PADDING) ?? { x: originX, y: originY, width: 100, height: 80 };
    return { ...group, rect };
  });

  return { nodes, edges, groups };
}

function assignDepths(diagram: SemanticDiagram): Map<string, number> {
  const depth = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const node of diagram.nodes) incoming.set(node.id, 0);
  for (const edge of diagram.edges) incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  const queue = diagram.nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0).map((n) => n.id);
  for (const id of queue) depth.set(id, 0);
  const remaining = new Set(diagram.nodes.map((n) => n.id));
  while (queue.length) {
    const id = queue.shift()!;
    remaining.delete(id);
    const d = depth.get(id) ?? 0;
    for (const edge of diagram.edges.filter((e) => e.source === id)) {
      depth.set(edge.target, Math.max(depth.get(edge.target) ?? 0, d + 1));
      if (![...queue].includes(edge.target)) queue.push(edge.target);
    }
  }
  for (const id of remaining) depth.set(id, 0);
  return depth;
}

function relaxCollisions(nodes: LaidOutNode[]): void {
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i].rect;
        const b = nodes[j].rect;
        if (!rectsOverlap(inflateRect(a, NODE_GAP / 2), b)) continue;
        const dx = a.x + a.width / 2 - (b.x + b.width / 2);
        const dy = a.y + a.height / 2 - (b.y + b.height / 2);
        if (Math.abs(dx) >= Math.abs(dy)) {
          const shift = (a.width + b.width) / 2 + NODE_GAP - Math.abs(dx);
          const sign = dx >= 0 ? 1 : -1;
          a.x += (shift * sign) / 2;
          b.x -= (shift * sign) / 2;
        } else {
          const shift = (a.height + b.height) / 2 + NODE_GAP - Math.abs(dy);
          const sign = dy >= 0 ? 1 : -1;
          a.y += (shift * sign) / 2;
          b.y -= (shift * sign) / 2;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function rerouteAroundObstacles(source: Rect, target: Rect, obstacles: Rect[]): { x: number; y: number }[] {
  const base = orthogonalRoute(source, target, 40);
  const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const candidates = [
    [sourceCenter.x, Math.min(source.y, target.y) - 60, targetCenter.x, Math.min(source.y, target.y) - 60],
    [sourceCenter.x, Math.max(source.y + source.height, target.y + target.height) + 60, targetCenter.x, Math.max(source.y + source.height, target.y + target.height) + 60],
  ];
  for (const [sx, sy, tx, ty] of candidates) {
    const start = { x: sx, y: sy };
    const end = { x: tx, y: ty };
    const points = [sourceCenter, start, end, targetCenter];
    if (!obstacles.some((o) => pointsCrossRect(points, o, 8))) return points;
  }
  return base;
}