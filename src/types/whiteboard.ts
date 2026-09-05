import type { Point } from "./drawing";

export type Camera = {
  /** World coordinate at the center of the viewport. */
  x: number;
  y: number;
  zoom: number;
};

export type Tool = "draw" | "erase" | "pan" | "select" | "rect" | "ellipse" | "line" | "arrow" | "triangle";

export type SelectionKind = "ellipse" | "lasso";

/** A user-circled region on the board, expressed as a world-space polygon. */
export interface Selection {
  kind: SelectionKind;
  poly: Point[];
}

export type DrawingSpeed = "slow" | "normal" | "fast";

/**
 * A concrete, renderable item on the board.
 * Both human and AI drawings share this representation.
 */
export type WhiteboardItem =
  | {
      id: string;
      kind: "stroke";
      points: Point[];
      width: number;
      opacity?: number;
      pressure?: number[];
      color?: string;
      seed: number;
    }
  | {
      id: string;
      kind: "erase";
      points: Point[];
      width: number;
      seed: number;
    }
  | {
      id: string;
      kind: "text";
      x: number;
      y: number;
      text: string;
      fontSize: number;
      color?: string;
    }
  | {
      id: string;
      kind: "shape";
      /** Outline polyline of the shape (closed for rect/ellipse/triangle). */
      points: Point[];
      /** Marker nib width for the outline. */
      width: number;
      /** Whether the outline forms a closed loop (rect/ellipse/triangle). */
      closed: boolean;
      /** Optional solid fill color (for rect/ellipse). */
      fill?: string;
      opacity?: number;
      color?: string;
      seed: number;
    };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: string;
  ts: number;
}