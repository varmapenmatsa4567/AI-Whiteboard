export interface TextStyle { fontFamily?: string; fontSize: number; fontWeight?: string | number; lineHeight?: number }
export interface TextMeasure { width: number; height: number; lines: number }
const CHAR_WIDTH_FACTOR = 0.52;
const DEFAULT_LINE_HEIGHT = 1.25;

export function measureText(text: string, style: TextStyle, maxWidth = Infinity): TextMeasure {
  const value = text.trim(); const fontSize = Math.max(6, style.fontSize); const lineHeight = style.lineHeight ?? DEFAULT_LINE_HEIGHT;
  if (!value) return { width: 0, height: fontSize * lineHeight, lines: 1 };
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas"); const ctx = canvas.getContext("2d");
    if (ctx) { ctx.font = `${style.fontWeight ?? 400} ${fontSize}px ${style.fontFamily ?? "Arial, sans-serif"}`; return measureWithCanvas(ctx, value, fontSize * lineHeight, maxWidth); }
  }
  return approximateMeasure(value, fontSize, lineHeight, maxWidth);
}

function measureWithCanvas(ctx: CanvasRenderingContext2D, text: string, lineHeightPx: number, maxWidth: number): TextMeasure {
  const words = text.split(/\s+/).filter(Boolean); const natural = ctx.measureText(text).width;
  if (!Number.isFinite(maxWidth) || natural <= maxWidth) return { width: natural, height: lineHeightPx, lines: 1 };
  const lines: string[] = []; let current = "";
  for (const word of words) { const candidate = current ? `${current} ${word}` : word; if (current && ctx.measureText(candidate).width > maxWidth) { lines.push(current); current = word; } else current = candidate; }
  if (current) lines.push(current);
  return { width: Math.min(maxWidth, Math.max(...lines.map((line) => ctx.measureText(line).width), 0)), height: lines.length * lineHeightPx, lines: lines.length };
}

function approximateMeasure(text: string, fontSize: number, lineHeight: number, maxWidth: number): TextMeasure {
  const natural = text.length * fontSize * CHAR_WIDTH_FACTOR;
  if (!Number.isFinite(maxWidth) || natural <= maxWidth) return { width: natural, height: fontSize * lineHeight, lines: 1 };
  const charsPerLine = Math.max(1, Math.floor(maxWidth / (fontSize * CHAR_WIDTH_FACTOR))); const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  return { width: Math.min(natural, maxWidth), height: lines * fontSize * lineHeight, lines };
}

export interface CardSizeOptions { minWidth?: number; maxWidth?: number; minHeight?: number; maxHeight?: number; horizontalPadding?: number; verticalPadding?: number; gap?: number; titleStyle?: TextStyle; bodyStyle?: TextStyle }
const DEFAULTS: Required<Pick<CardSizeOptions, "minWidth" | "maxWidth" | "minHeight" | "maxHeight" | "horizontalPadding" | "verticalPadding" | "gap">> = {
  minWidth: 200, maxWidth: 420, minHeight: 82, maxHeight: 800, horizontalPadding: 24, verticalPadding: 20, gap: 10,
};

export function measureCardSize(node: { title?: string; description?: string; items?: string[]; width?: number; height?: number }, options: CardSizeOptions = {}): { width: number; height: number } {
  const o = { ...DEFAULTS, ...options }; const titleStyle = options.titleStyle ?? { fontSize: 20, fontWeight: 700 }; const bodyStyle = options.bodyStyle ?? { fontSize: 15, lineHeight: 1.35 };
  const content = [node.title, node.description, ...(node.items ?? [])].filter((v): v is string => Boolean(v?.trim()));
  const preferred = Math.max(o.minWidth, Math.min(o.maxWidth, node.width ?? 280)); const inner = Math.max(40, preferred - o.horizontalPadding * 2);
  let height = o.verticalPadding * 2; let width = 0; let hasContent = false;
  if (node.title?.trim()) { const m = measureText(node.title, titleStyle, inner); height += m.height; width = Math.max(width, m.width); hasContent = true; }
  if (node.description?.trim()) { if (node.title?.trim()) height += o.gap; const m = measureText(node.description, bodyStyle, inner); height += m.height; width = Math.max(width, m.width); hasContent = true; }
  if ((node.items ?? []).length) { if (node.title?.trim() || node.description?.trim()) height += o.gap; for (const item of node.items ?? []) { const m = measureText(`• ${item}`, bodyStyle, inner); height += m.height; width = Math.max(width, m.width); } hasContent = true; }
  const measuredWidth = Math.max(o.minWidth, Math.min(o.maxWidth, width + o.horizontalPadding * 2));
  const measuredHeight = Math.max(o.minHeight, Math.min(o.maxHeight, hasContent ? height : o.minHeight));
  return { width: measuredWidth, height: Math.max(measuredHeight, node.height ?? 0) };
}
