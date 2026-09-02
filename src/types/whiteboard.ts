import type { Point } from "./drawing";

export type Camera = {
  /** World coordinate at the center of the viewport. */
  x: number;
  y: number;
  zoom: number;
};

export type Tool = "draw" | "erase" | "pan";

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
    };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: string;
  ts: number;
}