export interface Point {
  x: number;
  y: number;
}

/**
 * A drawing region in world coordinates.
 * The AI writes in normalized coordinates 0..1000 which map onto this region.
 */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Structured drawing instructions returned by the AI.
 * This representation is completely independent of the canvas implementation.
 */
export type DrawingCommand =
  | {
      type: "stroke";
      points: Point[];
      width?: number;
      opacity?: number;
      pressure?: number[];
    }
  | {
      type: "text";
      x: number;
      y: number;
      text: string;
      fontSize?: number;
    }
  | {
      type: "erase";
      x: number;
      y: number;
      width?: number;
    }
  | {
      type: "pause";
      duration: number;
    }
  | {
      type: "group";
      commands: DrawingCommand[];
    };

export interface DrawingPlan {
  description?: string;
  commands: DrawingCommand[];
}

export interface DrawRequestConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Everything the AI drawing planner needs to produce a drawing.
 */
export interface DrawingRequestContext {
  prompt: string;
  canvas: {
    width: number;
    height: number;
  };
  region: Region;
  existingDrawing?: string;
  conversation?: DrawRequestConversationMessage[];
  requestIndex?: number;
}

/**
 * Layer 1 — the AI drawing planner.
 */
export interface DrawingAI {
  readonly id: string;
  generateDrawing(request: DrawingRequestContext): Promise<DrawingPlan>;
}