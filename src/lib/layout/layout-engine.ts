import type { SemanticDiagram, LayoutEdge, LayoutResult, LaidOutNode } from "./model";
import { boundsOf, inflateRect, orthogonalRoute, pointsCrossRect, rectsOverlap, type Rect } from "./geometry";
import { measureCardSize } from "./text-measure";

const NODE_GAP = 56;
const LAYER_GAP = 100;
const GROUP_PADDING = 32;
const ROUTE_CLEARANCE = 24;
const ROUTE_PADDING = 8;
const DEFAULT_MAX_COLUMNS = 4;

export interface LayoutOptions {
  originX?: number;
  originY?: number;
  maxColumns?: number;
}

export function layoutDiagram(diagram: SemanticDiagram, options: LayoutOptions = {}): LayoutResult {
  const originX = options.originX ?? 80;
  const originY = options.originY ?? 80;
  const maxColumns = Math.max(1, Math.floor(options.maxColumns ?? DEFAULT_MAX_COLUMNS));

  const groupRank = buildGroupRank(diagram);
  const nodes = diagram.nodes.map((node) => {
    const size = measureCardSize(node, {
      titleStyle: { fontSize: 24, fontWeight: 700 },
      bodyStyle: { fontSize: 18, lineHeight: 1.35 },
      maxWidth: 460,
      maxHeight: 900,
    });
    return {
      ...node,
      rect: { x: 0, y: 0, width: size.width, height: size.height },
    } as LaidOutNode;
  });

  const depth = assignDepths(diagram);
  const layers = new Map<number, LaidOutNode[]>();
  for (const node of nodes) {
    const d = depth.get(node.id) ?? 0;
    const layer = layers.get(d) ?? [];
    layer.push(node);
    layers.set(d, layer);
  }

  // Stable group-aware ordering keeps nodes belonging to the same semantic
  // group visually close without allowing the LLM to control pixel geometry.
  for (const layer of layers.values()) {
    layer.sort((a, b) => {
      const groupDelta = (groupRank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (groupRank.get(b.id) ?? Number.MAX_SAFE_INTEGER);
      if (groupDelta !== 0) return groupDelta;
      return a.id.localeCompare(b.id);
    });
  }

  const direction = diagram.direction === "top-to-bottom" ? "tb" : "lr";
  const orderedLayers = [...layers.keys()].sort((a, b) => a - b);

  if (direction === "tb") {
    layoutTopToBottom(layers, orderedLayers, nodes, originX, originY, maxColumns);
  } else {
    layoutLeftToRight(layers, orderedLayers, nodes, originX, originY, maxColumns);
  }

  relaxCollisions(nodes);

  const edges: LayoutEdge[] = diagram.edges.flatMap((edge) => {
    const source = nodes.find((n) => n.id === edge.source);
    const target = nodes.find((n) => n.id === edge.target);
    if (!source || !target) return [];

    const obstacles = nodes
      .filter((n) => n.id !== source.id && n.id !== target.id)
      .map((n) => n.rect);

    let points = orthogonalRoute(source.rect, target.rect, ROUTE_CLEARANCE);
    if (obstacles.some((o) => pointsCrossRect(points, o, ROUTE_PADDING))) {
      points = routeAroundObstacles(source.rect, target.rect, obstacles);
    }

    return [{ ...edge, points }];
  });

  const groups = diagram.groups.map((group) => {
    const children = nodes
      .filter((n) => group.children.includes(n.id))
      .map((n) => n.rect);
    const rect = boundsOf(children, GROUP_PADDING) ?? {
      x: originX,
      y: originY,
      width: 100,
      height: 80,
    };
    return { ...group, rect };
  });

  return { nodes, edges, groups };
}

function layoutTopToBottom(
  layers: Map<number, LaidOutNode[]>,
  orderedLayers: number[],
  nodes: LaidOutNode[],
  originX: number,
  originY: number,
  maxColumns: number,
): void {
  let cursorY = originY;

  for (const key of orderedLayers) {
    const layer = layers.get(key) ?? [];
    const rows = chunk(layer, maxColumns);
    const rowHeights = rows.map((row) => Math.max(...row.map((node) => node.rect.height), 0));
    const rowWidths = rows.map((row) => row.reduce((sum, node) => sum + node.rect.width, 0) + Math.max(0, row.length - 1) * NODE_GAP);
    const layerWidth = Math.max(...rowWidths, 0);
    const layerHeight = rowHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, rows.length - 1) * NODE_GAP;

    let rowY = cursorY;
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      const rowWidth = rowWidths[rowIndex];
      let x = originX + (layerWidth - rowWidth) / 2;

      for (const node of row) {
        node.rect.x = x;
        node.rect.y = rowY;
        x += node.rect.width + NODE_GAP;
      }

      rowY += rowHeights[rowIndex] + NODE_GAP;
    }

    cursorY += layerHeight + LAYER_GAP;
  }

  // Keep the compiler honest if future layout modes use the parameter.
  void nodes;
}

function layoutLeftToRight(
  layers: Map<number, LaidOutNode[]>,
  orderedLayers: number[],
  nodes: LaidOutNode[],
  originX: number,
  originY: number,
  maxColumns: number,
): void {
  let cursorX = originX;

  for (const key of orderedLayers) {
    const layer = layers.get(key) ?? [];
    const columns = chunk(layer, maxColumns);
    const columnWidths = columns.map((column) => Math.max(...column.map((node) => node.rect.width), 0));
    const columnHeights = columns.map((column) => column.reduce((sum, node) => sum + node.rect.height, 0) + Math.max(0, column.length - 1) * NODE_GAP);
    const layerWidth = columnWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, columns.length - 1) * NODE_GAP;
    const layerHeight = Math.max(...columnHeights, 0);

    let columnX = cursorX;
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
      const column = columns[columnIndex];
      const columnHeight = columnHeights[columnIndex];
      let y = originY + (layerHeight - columnHeight) / 2;

      for (const node of column) {
        node.rect.x = columnX;
        node.rect.y = y;
        y += node.rect.height + NODE_GAP;
      }

      columnX += columnWidths[columnIndex] + NODE_GAP;
    }

    cursorX += layerWidth + LAYER_GAP;
  }

  void nodes;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function buildGroupRank(diagram: SemanticDiagram): Map<string, number> {
  const rank = new Map<string, number>();
  diagram.groups.forEach((group, index) => {
    for (const child of group.children) {
      if (!rank.has(child)) rank.set(child, index);
    }
  });
  return rank;
}

/**
 * Computes finite longest-path-like depths while safely handling cycles.
 * Kahn's algorithm processes the acyclic portion. If a cycle remains,
 * one deterministic node is promoted into the queue to break the cycle;
 * already-processed back edges never increase depth indefinitely.
 */
function assignDepths(diagram: SemanticDiagram): Map<string, number> {
  const depth = new Map<string, number>();
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const node of diagram.nodes) {
    incoming.set(node.id, 0);
    outgoing.set(node.id, []);
  }

  for (const edge of diagram.edges) {
    if (!incoming.has(edge.target) || !outgoing.has(edge.source)) continue;
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)!.push(edge.target);
  }

  for (const targets of outgoing.values()) targets.sort((a, b) => a.localeCompare(b));

  const queue = diagram.nodes
    .filter((node) => (incoming.get(node.id) ?? 0) === 0)
    .map((node) => node.id)
    .sort((a, b) => a.localeCompare(b));
  const processed = new Set<string>();

  while (processed.size < diagram.nodes.length) {
    if (queue.length === 0) {
      const remaining = diagram.nodes
        .map((node) => node.id)
        .filter((id) => !processed.has(id))
        .sort((a, b) => a.localeCompare(b));
      if (remaining.length === 0) break;

      const promoted = remaining[0];
      depth.set(promoted, Math.max(depth.get(promoted) ?? 0, maxDepth(depth) + 1));
      queue.push(promoted);
    }

    const id = queue.shift()!;
    if (processed.has(id)) continue;
    processed.add(id);

    const currentDepth = depth.get(id) ?? 0;
    for (const target of outgoing.get(id) ?? []) {
      if (processed.has(target)) continue;
      depth.set(target, Math.max(depth.get(target) ?? 0, currentDepth + 1));
      const nextIncoming = (incoming.get(target) ?? 0) - 1;
      incoming.set(target, nextIncoming);
      if (nextIncoming <= 0 && !queue.includes(target)) queue.push(target);
    }
  }

  for (const node of diagram.nodes) {
    if (!depth.has(node.id)) depth.set(node.id, 0);
  }

  return depth;
}

function maxDepth(depth: Map<string, number>): number {
  let max = 0;
  for (const value of depth.values()) max = Math.max(max, value);
  return max;
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

/**
 * Deterministic orthogonal obstacle router.
 * Builds a small visibility grid from source/target coordinates and the
 * inflated obstacle boundaries, then uses Manhattan A* to find a route.
 */
function routeAroundObstacles(source: Rect, target: Rect, obstacles: Rect[]): { x: number; y: number }[] {
  const fallback = orthogonalRoute(source, target, ROUTE_CLEARANCE);
  if (obstacles.length === 0) return fallback;

  const start = boundaryPointForRoute(source, target);
  const end = boundaryPointForRoute(target, source);
  const blocked = obstacles.map((rect) => inflateRect(rect, ROUTE_PADDING));

  const allRects = [source, target, ...blocked];
  const minX = Math.min(...allRects.map((r) => r.x)) - ROUTE_CLEARANCE;
  const maxX = Math.max(...allRects.map((r) => r.x + r.width)) + ROUTE_CLEARANCE;
  const minY = Math.min(...allRects.map((r) => r.y)) - ROUTE_CLEARANCE;
  const maxY = Math.max(...allRects.map((r) => r.y + r.height)) + ROUTE_CLEARANCE;

  const xs = uniqueSorted([
    minX,
    maxX,
    start.x,
    end.x,
    ...blocked.flatMap((r) => [r.x - ROUTE_CLEARANCE, r.x + r.width + ROUTE_CLEARANCE]),
  ]);
  const ys = uniqueSorted([
    minY,
    maxY,
    start.y,
    end.y,
    ...blocked.flatMap((r) => [r.y - ROUTE_CLEARANCE, r.y + r.height + ROUTE_CLEARANCE]),
  ]);

  const startKey = pointKey(start);
  const endKey = pointKey(end);
  const points = new Map<string, { x: number; y: number }>();

  for (const x of xs) {
    for (const y of ys) {
      const point = { x, y };
      if (pointKey(point) === startKey || pointKey(point) === endKey || !blocked.some((r) => pointInRect(point, r))) {
        points.set(pointKey(point), point);
      }
    }
  }

  if (!points.has(startKey) || !points.has(endKey)) return fallback;

  const path = aStarRoute(points, startKey, endKey, blocked);
  if (path.length < 2) return fallback;

  const simplified = simplifyPath(path);
  return simplified.length >= 2 && !blocked.some((rect) => pointsCrossRect(simplified, rect, 0))
    ? simplified
    : fallback;
}

function boundaryPointForRoute(rect: Rect, other: Rect): { x: number; y: number } {
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const otherCenter = { x: other.x + other.width / 2, y: other.y + other.height / 2 };
  const dx = otherCenter.x - center.x;
  const dy = otherCenter.y - center.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { x: rect.x + rect.width, y: center.y } : { x: rect.x, y: center.y };
  }
  return dy >= 0 ? { x: center.x, y: rect.y + rect.height } : { x: center.x, y: rect.y };
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value * 1000) / 1000))].sort((a, b) => a - b);
}

function pointKey(point: { x: number; y: number }): string {
  return `${point.x}:${point.y}`;
}

function pointInRect(point: { x: number; y: number }, rect: Rect): boolean {
  return point.x > rect.x && point.x < rect.x + rect.width && point.y > rect.y && point.y < rect.y + rect.height;
}

function aStarRoute(
  points: Map<string, { x: number; y: number }>,
  startKey: string,
  endKey: string,
  obstacles: Rect[],
): { x: number; y: number }[] {
  const neighbors = new Map<string, string[]>();
  const keys = [...points.keys()];

  for (const key of keys) neighbors.set(key, []);
  for (const key of keys) {
    const p = points.get(key)!;
    for (const otherKey of keys) {
      if (key === otherKey) continue;
      const q = points.get(otherKey)!;
      if (p.x !== q.x && p.y !== q.y) continue;
      if (segmentBlocked(p, q, obstacles)) continue;
      neighbors.get(key)!.push(otherKey);
    }
    neighbors.get(key)!.sort((a, b) => {
      const pa = points.get(a)!;
      const pb = points.get(b)!;
      return Math.abs(pa.x - p.x) + Math.abs(pa.y - p.y) - (Math.abs(pb.x - p.x) + Math.abs(pb.y - p.y));
    });
  }

  const open = new Set<string>([startKey]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([[startKey, heuristic(points.get(startKey)!, points.get(endKey)!)] ]);

  while (open.size) {
    const current = [...open].sort((a, b) => (fScore.get(a) ?? Infinity) - (fScore.get(b) ?? Infinity) || a.localeCompare(b))[0];
    if (current === endKey) return reconstructPath(cameFrom, current, points);
    open.delete(current);

    for (const next of neighbors.get(current) ?? []) {
      const currentPoint = points.get(current)!;
      const nextPoint = points.get(next)!;
      const distance = Math.abs(currentPoint.x - nextPoint.x) + Math.abs(currentPoint.y - nextPoint.y);
      const turnPenalty = cameFrom.has(current) && directionOf(points.get(cameFrom.get(current)!)!, currentPoint) !== directionOf(currentPoint, nextPoint) ? 12 : 0;
      const tentative = (gScore.get(current) ?? Infinity) + distance + turnPenalty;

      if (tentative < (gScore.get(next) ?? Infinity)) {
        cameFrom.set(next, current);
        gScore.set(next, tentative);
        fScore.set(next, tentative + heuristic(nextPoint, points.get(endKey)!));
        open.add(next);
      }
    }
  }

  return [];
}

function heuristic(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function directionOf(a: { x: number; y: number }, b: { x: number; y: number }): "h" | "v" {
  return a.x === b.x ? "v" : "h";
}

function segmentBlocked(a: { x: number; y: number }, b: { x: number; y: number }, obstacles: Rect[]): boolean {
  return obstacles.some((rect) => pointsCrossRect([a, b], rect, 0));
}

function reconstructPath(cameFrom: Map<string, string>, current: string, points: Map<string, { x: number; y: number }>): { x: number; y: number }[] {
  const result = [points.get(current)!];
  let cursor = current;
  while (cameFrom.has(cursor)) {
    cursor = cameFrom.get(cursor)!;
    result.push(points.get(cursor)!);
  }
  return result.reverse();
}

function simplifyPath(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length <= 2) return points;
  const result = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const current = points[i];
    const next = points[i + 1];
    if ((prev.x === current.x && current.x === next.x) || (prev.y === current.y && current.y === next.y)) continue;
    result.push(current);
  }
  result.push(points[points.length - 1]);
  return result;
}
