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
export interface StepNarration {
  /** Optional narration spoken aloud while this step draws. */
  explain?: string;
}

export type DrawingCommand =
  | ({
      type: "stroke";
      points: Point[];
      width?: number;
      opacity?: number;
      pressure?: number[];
      color?: string;
    } & StepNarration)
  | ({
      type: "text";
      x: number;
      y: number;
      text: string;
      fontSize?: number;
      color?: string;
    } & StepNarration)
  | ({
      type: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      strokeWidth?: number;
      color?: string;
    } & StepNarration)
  | ({
      type: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      strokeWidth?: number;
      color?: string;
      fill?: string;
    } & StepNarration)
  | ({
      type: "ellipse";
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      strokeWidth?: number;
      color?: string;
      fill?: string;
    } & StepNarration)
  | ({
      type: "triangle";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      x3: number;
      y3: number;
      strokeWidth?: number;
      color?: string;
    } & StepNarration)
  | ({
      type: "arrow";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      strokeWidth?: number;
      color?: string;
    } & StepNarration)
  | ({
      type: "darrow";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      strokeWidth?: number;
      color?: string;
    } & StepNarration)
  | ({
      type: "erase";
      x: number;
      y: number;
      width?: number;
    } & StepNarration)
  | ({
      type: "pause";
      duration: number;
    } & StepNarration)
  | ({
      type: "group";
      commands: DrawingCommand[];
    } & StepNarration);

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
  selectionContext?: string[];
  requestIndex?: number;
}

/**
 * Layer 1 — the AI drawing planner.
 */
export interface DrawingAI {
  readonly id: string;
  generateDrawing(request: DrawingRequestContext): Promise<DrawingPlan>;
}