import type { SemanticDiagram, LayoutEdge, LayoutResult, LaidOutNode } from "./model";
import { boundsOf, inflateRect, orthogonalRoute, pointsCrossRect, rectsOverlap, type Rect } from "./geometry";
import { measureCardSize } from "./text-measure";

const NODE_GAP = 40;
const LAYER_GAP = 70;
const GROUP_PADDING = 32;
const ROUTE_CLEARANCE = 24;
const ROUTE_PADDING = 8;
const DEFAULT_MAX_COLUMNS = 5;

export interface LayoutOptions { originX?: number; originY?: number; maxColumns?: number; }

export function layoutDiagram(diagram: SemanticDiagram, options: LayoutOptions = {}): LayoutResult {
  const originX = options.originX ?? 80;
  const originY = options.originY ?? 80;
  const maxColumns = Math.max(1, Math.floor(options.maxColumns ?? DEFAULT_MAX_COLUMNS));
  const groupRank = buildGroupRank(diagram);

  const nodes = diagram.nodes.map((node) => {
    const size = measureCardSize(node, {
      minWidth: 220,
      maxWidth: 380,
      maxHeight: 520,
      titleStyle: { fontSize: 22, fontWeight: 700 },
      bodyStyle: { fontSize: 16, lineHeight: 1.3 },
    });
    return { ...node, rect: { x: 0, y: 0, width: size.width, height: size.height } } as LaidOutNode;
  });

  const depth = assignDepths(diagram);
  const layers = new Map<number, LaidOutNode[]>();
  for (const node of nodes) {
    const layer = layers.get(depth.get(node.id) ?? 0) ?? [];
    layer.push(node);
    layers.set(depth.get(node.id) ?? 0, layer);
  }
  for (const layer of layers.values()) {
    layer.sort((a, b) => ((groupRank.get(a.id) ?? 9999) - (groupRank.get(b.id) ?? 9999)) || a.id.localeCompare(b.id));
  }

  const orderedLayers = [...layers.keys()].sort((a, b) => a - b);
  if (diagram.direction === "left-to-right") {
    layoutLeftToRight(layers, orderedLayers, originX, originY, maxColumns);
  } else {
    layoutTopToBottom(layers, orderedLayers, originX, originY, maxColumns);
  }
  relaxCollisions(nodes);

  const edges: LayoutEdge[] = diagram.edges.flatMap((edge) => {
    const source = nodes.find((n) => n.id === edge.source);
    const target = nodes.find((n) => n.id === edge.target);
    if (!source || !target) return [];
    const obstacles = nodes.filter((n) => n.id !== source.id && n.id !== target.id).map((n) => n.rect);
    const direct = orthogonalRoute(source.rect, target.rect, ROUTE_CLEARANCE);
    const points = obstacles.some((o) => pointsCrossRect(direct, o, ROUTE_PADDING))
      ? routeAroundObstacles(source.rect, target.rect, obstacles)
      : direct;
    return [{ ...edge, points }];
  });

  const groups = diagram.groups.map((group) => ({
    ...group,
    rect: boundsOf(nodes.filter((n) => group.children.includes(n.id)).map((n) => n.rect), GROUP_PADDING) ?? {
      x: originX, y: originY, width: 100, height: 80,
    },
  }));
  return { nodes, edges, groups };
}

function layoutTopToBottom(layers: Map<number, LaidOutNode[]>, ordered: number[], ox: number, oy: number, maxColumns: number): void {
  let y = oy;
  for (const key of ordered) {
    const rows = chunk(layers.get(key) ?? [], maxColumns);
    const heights = rows.map((r) => Math.max(...r.map((n) => n.rect.height), 0));
    const widths = rows.map((r) => r.reduce((s, n) => s + n.rect.width, 0) + Math.max(0, r.length - 1) * NODE_GAP);
    const layerWidth = Math.max(...widths, 0);
    for (let i = 0; i < rows.length; i++) {
      let x = ox + (layerWidth - widths[i]) / 2;
      for (const node of rows[i]) {
        node.rect.x = x; node.rect.y = y; x += node.rect.width + NODE_GAP;
      }
      y += heights[i] + NODE_GAP;
    }
    y += LAYER_GAP - NODE_GAP;
  }
}

function layoutLeftToRight(layers: Map<number, LaidOutNode[]>, ordered: number[], ox: number, oy: number, maxRows: number): void {
  let x = ox;
  for (const key of ordered) {
    const columns = chunk(layers.get(key) ?? [], maxRows);
    const widths = columns.map((c) => Math.max(...c.map((n) => n.rect.width), 0));
    const heights = columns.map((c) => c.reduce((s, n) => s + n.rect.height, 0) + Math.max(0, c.length - 1) * NODE_GAP);
    const layerHeight = Math.max(...heights, 0);
    for (let i = 0; i < columns.length; i++) {
      let y = oy + (layerHeight - heights[i]) / 2;
      for (const node of columns[i]) {
        node.rect.x = x; node.rect.y = y; y += node.rect.height + NODE_GAP;
      }
      x += widths[i] + NODE_GAP;
    }
    x += LAYER_GAP - NODE_GAP;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function buildGroupRank(diagram: SemanticDiagram): Map<string, number> {
  const result = new Map<string, number>();
  diagram.groups.forEach((g, i) => g.children.forEach((id) => { if (!result.has(id)) result.set(id, i); }));
  return result;
}

function assignDepths(diagram: SemanticDiagram): Map<string, number> {
  const depth = new Map<string, number>();
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const node of diagram.nodes) { incoming.set(node.id, 0); outgoing.set(node.id, []); }
  for (const edge of diagram.edges) {
    if (!incoming.has(edge.target) || !outgoing.has(edge.source)) continue;
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)!.push(edge.target);
  }
  for (const ids of outgoing.values()) ids.sort();

  const queue = diagram.nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0).map((n) => n.id).sort();
  const processed = new Set<string>();
  while (processed.size < diagram.nodes.length) {
    if (queue.length === 0) {
      const candidate = diagram.nodes.map((n) => n.id).filter((id) => !processed.has(id)).sort()[0];
      if (!candidate) break;
      depth.set(candidate, Math.max(depth.get(candidate) ?? 0, maxDepth(depth) + 1));
      queue.push(candidate);
    }
    const id = queue.shift()!;
    if (processed.has(id)) continue;
    processed.add(id);
    const d = depth.get(id) ?? 0;
    for (const target of outgoing.get(id) ?? []) {
      if (processed.has(target)) continue;
      depth.set(target, Math.max(depth.get(target) ?? 0, d + 1));
      const next = (incoming.get(target) ?? 0) - 1;
      incoming.set(target, next);
      if (next <= 0 && !queue.includes(target)) queue.push(target);
    }
  }
  for (const node of diagram.nodes) if (!depth.has(node.id)) depth.set(node.id, 0);
  return depth;
}

function maxDepth(depth: Map<string, number>): number {
  let max = 0;
  for (const d of depth.values()) max = Math.max(max, d);
  return max;
}

function relaxCollisions(nodes: LaidOutNode[]): void {
  for (let pass = 0; pass < 20; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i].rect, b = nodes[j].rect;
      if (!rectsOverlap(inflateRect(a, NODE_GAP / 2), b)) continue;
      const dx = a.x + a.width / 2 - (b.x + b.width / 2);
      const dy = a.y + a.height / 2 - (b.y + b.height / 2);
      if (Math.abs(dx) >= Math.abs(dy)) {
        const shift = (a.width + b.width) / 2 + NODE_GAP - Math.abs(dx), sign = dx >= 0 ? 1 : -1;
        a.x += shift * sign / 2; b.x -= shift * sign / 2;
      } else {
        const shift = (a.height + b.height) / 2 + NODE_GAP - Math.abs(dy), sign = dy >= 0 ? 1 : -1;
        a.y += shift * sign / 2; b.y -= shift * sign / 2;
      }
      moved = true;
    }
    if (!moved) break;
  }
}

function routeAroundObstacles(source: Rect, target: Rect, obstacles: Rect[]): { x: number; y: number }[] {
  const direct = orthogonalRoute(source, target, ROUTE_CLEARANCE);
  if (!obstacles.length) return direct;
  const sc = centerBoundary(source, target), tc = centerBoundary(target, source);
  const all = [source, target, ...obstacles];
  const minX = Math.min(...all.map((r) => r.x)) - ROUTE_CLEARANCE * 2;
  const maxX = Math.max(...all.map((r) => r.x + r.width)) + ROUTE_CLEARANCE * 2;
  const minY = Math.min(...all.map((r) => r.y)) - ROUTE_CLEARANCE * 2;
  const maxY = Math.max(...all.map((r) => r.y + r.height)) + ROUTE_CLEARANCE * 2;
  const candidates: { x: number; y: number }[][] = [
    [sc, { x: sc.x, y: minY }, { x: tc.x, y: minY }, tc],
    [sc, { x: sc.x, y: maxY }, { x: tc.x, y: maxY }, tc],
    [sc, { x: minX, y: sc.y }, { x: minX, y: tc.y }, tc],
    [sc, { x: maxX, y: sc.y }, { x: maxX, y: tc.y }, tc],
  ];
  for (const obstacle of obstacles) {
    const r = inflateRect(obstacle, ROUTE_CLEARANCE);
    candidates.push([sc, { x: r.x - ROUTE_CLEARANCE, y: sc.y }, { x: r.x - ROUTE_CLEARANCE, y: tc.y }, tc]);
    candidates.push([sc, { x: r.x + r.width + ROUTE_CLEARANCE, y: sc.y }, { x: r.x + r.width + ROUTE_CLEARANCE, y: tc.y }, tc]);
    candidates.push([sc, { x: sc.x, y: r.y - ROUTE_CLEARANCE }, { x: tc.x, y: r.y - ROUTE_CLEARANCE }, tc]);
    candidates.push([sc, { x: sc.x, y: r.y + r.height + ROUTE_CLEARANCE }, { x: tc.x, y: r.y + r.height + ROUTE_CLEARANCE }, tc]);
  }
  let best = direct;
  let bestLength = Number.POSITIVE_INFINITY;
  for (const points of candidates) {
    if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) continue;
    if (obstacles.some((o) => pointsCrossRect(points, o, ROUTE_PADDING))) continue;
    const length = pathLength(points);
    if (length < bestLength) { best = points; bestLength = length; }
  }
  return best;
}

function centerBoundary(rect: Rect, other: Rect): { x: number; y: number } {
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  const ox = other.x + other.width / 2, oy = other.y + other.height / 2;
  if (Math.abs(ox - cx) >= Math.abs(oy - cy)) return { x: ox >= cx ? rect.x + rect.width : rect.x, y: cy };
  return { x: cx, y: oy >= cy ? rect.y + rect.height : rect.y };
}

function pathLength(points: { x: number; y: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
  return total;
}
