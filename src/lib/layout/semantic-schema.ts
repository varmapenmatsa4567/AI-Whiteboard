import { z } from "zod";

const Node = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(["card", "label", "shape", "container"]),
  title: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  items: z.array(z.string().max(200)).max(20).optional(),
});

const Edge = z.object({
  id: z.string().min(1).max(80),
  source: z.string().min(1).max(80),
  target: z.string().min(1).max(80),
  label: z.string().max(120).optional(),
});

const Group = z.object({
  id: z.string().min(1).max(80),
  title: z.string().max(160).optional(),
  children: z.array(z.string().min(1).max(80)).max(50),
});

export const SemanticDiagramSchema = z.object({
  description: z.string().max(500).optional(),
  direction: z.enum(["top-to-bottom", "left-to-right", "freeform"]).default("top-to-bottom"),
  nodes: z.array(Node).min(1).max(100),
  edges: z.array(Edge).max(150),
  groups: z.array(Group).max(30).default([]),
}).superRefine((diagram, ctx) => {
  const ids = new Set<string>();
  for (const n of diagram.nodes) {
    if (ids.has(n.id)) ctx.addIssue({ code: "custom", path: ["nodes"], message: `Duplicate node id: ${n.id}` });
    ids.add(n.id);
  }
  for (const e of diagram.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) ctx.addIssue({ code: "custom", path: ["edges"], message: `Edge ${e.id} references an unknown node` });
    if (e.source === e.target) ctx.addIssue({ code: "custom", path: ["edges"], message: `Edge ${e.id} cannot connect a node to itself` });
  }
});

export type SemanticDiagramInput = z.input<typeof SemanticDiagramSchema>;
export type SemanticDiagramOutput = z.output<typeof SemanticDiagramSchema>;

/** Accept normal JSON plus common ChatGPT copy/paste wrappers. */
export function parseSemanticDiagram(raw: string): SemanticDiagramOutput {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let value: unknown;

  try {
    value = JSON.parse(cleaned);
    // Some copy/paste paths wrap the whole object in a JSON string.
    if (typeof value === "string") {
      const nested = value.trim();
      if (nested.startsWith("{")) value = JSON.parse(nested);
    }
  } catch {
    throw new Error("AI returned invalid JSON for the semantic diagram.");
  }

  const parsed = SemanticDiagramSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid semantic diagram: ${parsed.error.issues[0]?.message ?? "schema validation failed"}`);
  return parsed.data;
}
