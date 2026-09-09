export interface DisplayNodeContent {
  title?: string;
  description?: string;
  items: string[];
}

/**
 * Dense diagrams need a visual summary. The full semantic content remains in
 * the model, but rendering every sentence in every card makes a large graph
 * unreadable. This keeps the most useful information visible while ensuring
 * layout measurement and rendering use exactly the same content.
 */
export function displayNodeContent(node: { title?: string; description?: string; items?: string[] }, totalNodes: number): DisplayNodeContent {
  const dense = totalNodes > 14;
  const veryDense = totalNodes > 20;
  const descriptionLimit = veryDense ? 90 : dense ? 120 : 500;
  const itemCount = veryDense ? 3 : dense ? 4 : 8;
  const itemLimit = veryDense ? 42 : dense ? 52 : 180;

  const shorten = (value: string, limit: number) => {
    const text = value.trim();
    if (text.length <= limit) return text;
    const cut = text.slice(0, Math.max(1, limit - 1)).replace(/\s+\S*$/, "").trim();
    return `${cut}…`;
  };

  return {
    title: node.title,
    description: node.description ? shorten(node.description, descriptionLimit) : undefined,
    items: (node.items ?? []).slice(0, itemCount).map((item) => shorten(item, itemLimit)),
  };
}
