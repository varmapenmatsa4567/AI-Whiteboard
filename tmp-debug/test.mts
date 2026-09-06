import { readFileSync } from "node:fs";
import { parseDrawingPlan, fitPlanToSheet } from "../src/lib/ai/schema.ts";
import { NORMALIZED } from "../src/lib/drawing/coordinates.ts";

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
function bbox(plan: unknown): Bounds {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const grow = (x: number, y: number) => {
    if (x < box.minX) box.minX = x;
    if (y < box.minY) box.minY = y;
    if (x > box.maxX) box.maxX = x;
    if (y > box.maxY) box.maxY = y;
  };
  const walk = (c: any) => {
    if (!c || typeof c !== "object") return;
    for (const k of ["x1", "x2", "x3", "y1", "y2", "y3", "x", "y", "cx", "cy"]) if (typeof c[k] === "number") grow(c[k], c[k]);
    if (typeof c.width === "number" && typeof c.x === "number") grow(c.x + c.width, (c.y ?? 0) + c.height);
    if (typeof c.rx === "number" && typeof c.cx === "number") grow(c.cx + c.rx, (c.cy ?? 0) + c.ry);
    if (Array.isArray(c.points)) for (const p of c.points) grow(p.x, p.y);
    if (Array.isArray(c.commands)) for (const sub of c.commands) walk(sub);
  };
  walk({ commands: plan });
  return box;
}

const content = readFileSync(new URL("./payload.json", import.meta.url), "utf8");

try {
  const { plan } = parseDrawingPlan(content);
  const b = bbox(plan.commands);
  console.log("OK parsed", plan.commands.length, "commands");
  console.log("fitted bbox:", JSON.stringify(b));
  console.log("within sheet:", b.minX >= -40 && b.minY >= -40 && b.maxX <= NORMALIZED + 40 && b.maxY <= NORMALIZED + 40);
  const again = fitPlanToSheet(plan);
  console.log("second fit stable:", JSON.stringify(bbox(again.commands)) === JSON.stringify(b));
} catch (e) {
  console.error("FAILED:", (e as Error).message);
  console.error("RAW:", (e as { raw?: string }).raw?.slice(0, 500));
}