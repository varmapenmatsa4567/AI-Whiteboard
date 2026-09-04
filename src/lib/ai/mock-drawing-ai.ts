import type { DrawingAI, DrawingCommand, DrawingPlan, DrawingRequestContext, Point } from "@/types/drawing";

type Pt = [number, number];

const S = (pts: Pt[], width = 4, color?: string, explain?: string): DrawingCommand => {
  const cmd: DrawingCommand = {
    type: "stroke",
    points: pts.map(([x, y]): Point => ({ x, y })),
    width,
  };
  if (color) cmd.color = color;
  if (explain) cmd.explain = explain;
  return cmd;
};

const T = (x: number, y: number, text: string, fontSize = 24, color?: string, explain?: string): DrawingCommand => {
  const cmd: DrawingCommand = { type: "text", x, y, text, fontSize };
  if (color) cmd.color = color;
  if (explain) cmd.explain = explain;
  return cmd;
};

const P = (duration = 500, explain?: string): DrawingCommand => {
  const cmd: DrawingCommand = { type: "pause", duration };
  if (explain) cmd.explain = explain;
  return cmd;
};

const G = (...commands: DrawingCommand[]): DrawingCommand => ({ type: "group", commands });

function ellipse(cx: number, cy: number, rx: number, ry: number, segs = 48, rot = 0): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    out.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return out;
}

const circle = (cx: number, cy: number, r: number, sw = 4, color?: string, explain?: string): DrawingCommand =>
  ({ type: "ellipse", cx, cy, rx: r, ry: r, strokeWidth: sw, color, explain });

function line(a: Pt, b: Pt, sw = 4, color?: string, explain?: string): DrawingCommand {
  return { type: "line", x1: a[0], y1: a[1], x2: b[0], y2: b[1], strokeWidth: sw, color, explain };
}

function arrow(a: Pt, b: Pt, sw = 4, color?: string, explain?: string): DrawingCommand {
  return { type: "arrow", x1: a[0], y1: a[1], x2: b[0], y2: b[1], strokeWidth: sw, color, explain };
}

function rect(x0: number, y0: number, x1: number, y1: number, sw = 4, color?: string, fill?: string, explain?: string): DrawingCommand {
  return { type: "rect", x: x0, y: y0, width: x1 - x0, height: y1 - y0, strokeWidth: sw, color, fill, explain };
}

function landscape(text: string): DrawingPlan {
  const hills = G(
    S([[120, 760], [250, 620], [400, 740]]),
    S([[360, 760], [520, 580], [700, 740]]),
    S([[680, 760], [820, 640], [960, 750]])
  );
  const sun = G(
    S(ellipse(840, 220, 70, 70, 40), 5),
    ...Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return S(
        [
          [840 + Math.cos(a) * 105, 220 + Math.sin(a) * 105],
          [840 + Math.cos(a) * 145, 220 + Math.sin(a) * 145],
        ],
        3
      );
    })
  );
  const flower = G(
    S([[200, 560], [220, 430], [260, 470], [280, 380], [300, 470], [330, 430], [350, 560]]),
    S([[150, 560], [200, 560], [350, 560], [400, 560]]),
    S(ellipse(340, 660, 34, 30, 30))
  );
  return {
    description: `Drew: ${text}.`,
    commands: [hills, sun, P(600), flower, T(150, 830, text, 30)],
  };
}

const templates: { test: RegExp; build: (prompt: string) => DrawingPlan }[] = [
  {
    test: /car|vehicle|truck|bus|automobile/i,
    build: () => ({
      description: "I'll draw a simple car: body, windows, wheels and a ground line.",
      commands: [
        G(
          S([[150, 460], [230, 400], [290, 390], [360, 330], [540, 330], [600, 390], [700, 395], [780, 455], [780, 540], [150, 540], [150, 460]], 5, undefined, "I'm drawing the body of the car."),
          S([[345, 400], [370, 340], [395, 335]], undefined, undefined, "Now the roof line."),
          rect(420, 385, 470, 420, 3, "#38bdf8", undefined, "Here's the front window."),
          rect(500, 380, 555, 420, 3, "#38bdf8", undefined, "And the rear window.")
        ),
        P(700, "Now let's add the wheels."),
        G(circle(280, 560, 58, 5, "#e11d48", "The first wheel."), circle(650, 560, 58, 5, "#e11d48", "And the second wheel.")),
        P(400),
        G(S([[120, 585], [800, 585]], 3, "#16a34a", "Finally, the ground line."), T(350, 640, "Car!", 30, undefined, "And I label it, car.")),
      ],
    }),
  },
  {
    test: /house|home|cottage|cabin/i,
    build: () => ({
      description: "I'll draw a house with a roof, door, window, chimney and a tree.",
      commands: [
        G(rect(210, 400, 700, 700, 5)),
        G(S([[160, 400], [455, 290], [750, 400]], 6)),
        P(600),
        G(rect(350, 525, 470, 700, 4), circle(375, 615, 8, 4)),
        G(rect(540, 465, 625, 555, 4), S([[540, 465], [625, 555], [542, 552], [458, 467]], 2), S([[625, 465], [540, 555]], 2)),
        P(400),
        G(S([[580, 400], [580, 330], [640, 330], [640, 420]], 4), S([[590, 316], [600, 292], [614, 282]], 2), S([[618, 316], [630, 298], [646, 292]], 2)),
        G(S([[120, 700], [180, 700], [180, 720], [780, 720]], 3)),
        P(500),
        G(rect(760, 470, 780, 700, 5), S([[770, 700], [748, 560], [770, 470], [790, 565]], 4), S(ellipse(770, 430, 66, 55, 40))),
        T(300, 770, "House", 30),
      ],
    }),
  },
  {
    test: /heart|anatomy|organ/i,
    build: () => ({
      description: "I'll draw a simple heart and label the left and right sides.",
      commands: [
        G(
          S(
            (() => {
              const pts: Pt[] = [];
              const scale = 30;
              for (let i = 0; i <= 80; i++) {
                const t = (i / 80) * Math.PI * 2;
                const x = 16 * Math.pow(Math.sin(t), 3);
                const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
                pts.push([500 - x * scale * 0.5, 330 - y * scale * 0.48]);
              }
              return pts;
            })(),
            5,
            "#e11d48"
          )
        ),
        P(800),
        G(T(300, 180, "Right", 22, "#0ea5e9"), T(660, 180, "Left", 22, "#f59e0b"), T(500, 700, "heart", 26, "#e11d48")),
      ],
    }),
  },
  {
    test: /star/i,
    build: () => ({
      description: "I'll draw a five-pointed star.",
      commands: [
        G(
          S(
            (() => {
              const pts: Pt[] = [];
              const cx = 500;
              const cy = 430;
              for (let i = 0; i <= 10; i++) {
                const r = i % 2 === 0 ? 250 : 108;
                const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
                pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
              }
              return pts;
            })(),
            6
          ),
          T(430, 760, "Star", 30)
        ),
      ],
    }),
  },
  {
    test: /sun|weather|sky|cloud|day/i,
    build: () => ({
      description: "I'll draw a sunny scene with clouds, hills and a bird.",
      commands: [
        G(S(ellipse(240, 200, 75, 75, 40), 5), ...Array.from({ length: 10 }, (_, i) => S([[240 + Math.cos((i / 10) * Math.PI * 2) * 110, 200 + Math.sin((i / 10) * Math.PI * 2) * 110], [240 + Math.cos((i / 10) * Math.PI * 2) * 155, 200 + Math.sin((i / 10) * Math.PI * 2) * 155]], 4))),
        P(500),
        G(
          S([[120, 300], [190, 240], [270, 300], [340, 250], [420, 240], [470, 300]], 5),
          S(ellipse(470, 340, 140, 38, 40, 0.05)),
          S([[230, 340], [230, 290], [300, 290], [300, 340]], 4)
        ),
        P(500),
        G(S([[120, 760], [280, 620], [460, 750]]), S([[400, 760], [560, 600], [740, 750]]), S([[700, 760], [830, 640], [940, 750]])),
        P(400),
        G(S([[180, 520], [230, 470], [270, 520]]), S([[620, 430], [660, 380], [700, 430]])),
        T(400, 840, "A sunny day", 30),
      ],
    }),
  },
  {
    test: /rocket|space|spaceship|shuttle/i,
    build: () => ({
      description: "I'll draw a rocket with a window, fins and a flame.",
      commands: [
        G(
          S([[430, 180], [430, 520], [495, 520], [495, 180], [462, 120]], 5),
          S([[430, 180], [495, 180], [462, 240], [430, 180]], 3)
        ),
        P(400),
        G(
          circle(462, 320, 34, 4),
          S([[395, 450], [430, 490]], 5),
          S([[530, 450], [495, 490]], 5),
          S([[395, 420], [340, 500]], 5),
          S([[530, 420], [585, 500]], 5)
        ),
        P(400),
        G(S([[435, 520], [430, 600], [440, 690], [450, 620], [460, 700], [468, 600], [470, 690], [482, 620], [488, 520]], 4)),
        G(T(560, 150, "★", 40), T(320, 300, "★", 26), T(640, 260, "★", 20)),
        T(400, 800, "To the stars!", 30),
      ],
    }),
  },
  {
    test: /binary search|searching/i,
    build: () => ({
      description: "I'll draw an array, mark the middle element, then cross out the halves to show binary search.",
      commands: [
        G(T(360, 140, "Binary Search", 34), T(330, 190, "target = 7", 24)),
        P(500),
        G(
          ...Array.from({ length: 8 }, (_, i) => rect(120 + i * 100, 300, 200 + i * 100, 400, 4)),
          ...Array.from({ length: 8 }, (_, i) => T(140 + i * 100, 385, String(i), 22)),
          ...["2", "4", "5", "7", "11", "13", "17", "23"].map((v, i) => T(137 + i * 100, 500, v, 24))
        ),
        P(700),
        G(arrow([160, 440], [160, 590], 4), T(120, 635, "low", 22), arrow([770, 440], [770, 590], 4), T(730, 635, "high", 22)),
        P(500),
        G(arrow([460, 440], [460, 590], 4), T(420, 635, "mid → 7 ✓", 22)),
        P(600),
        G(
          S([[130, 300], [230, 400], [190, 300], [240, 390]], 4),
          S([[130, 400], [230, 300], [180, 400], [235, 310]], 4),
          S([[230, 300], [330, 400], [290, 300], [320, 390]], 3),
          S([[230, 400], [330, 300], [280, 400], [335, 310]], 3)
        ),
        P(600),
        G(T(120, 700, "Discard left and right → found it!", 24)),
      ],
    }),
  },
  {
    test: /sort|sorting|insertion/i,
    build: () => ({
      description: "I'll draw an array of bars being sorted and label it.",
      commands: [
        G(T(390, 120, "Insertion sort", 34)),
        G(
          ...Array.from({ length: 8 }, (_, i) => {
            const heights = [120, 300, 200, 380, 150, 260, 340, 90];
            return S([[140 + i * 95, 700], [140 + i * 95, 700 - heights[i]], [215 + i * 95, 700 - heights[i]], [215 + i * 95, 700]], 4);
          })
        ),
        P(600),
        G(T(505, 630, "5", 26), arrow([562, 600], [562, 500], 4), T(520, 455, "swap up", 22)),
        P(600),
        G(arrow([385, 720], [385, 800], 4), T(340, 845, "compare while shifting", 22)),
        T(320, 900, "Unsorted list", 26),
      ],
    }),
  },
  {
    test: /tcp|handshake|network|connect/i,
    build: () => ({
      description: "I'll draw two hosts and the TCP 3-way handshake with SYN, SYN-ACK and ACK.",
      commands: [
        G(
          rect(90, 220, 330, 620, 5),
          rect(650, 220, 900, 620, 5),
          T(150, 260, "Client", 26),
          T(705, 260, "Server", 26)
        ),
        P(500),
        G(T(355, 300, "1.", 26), line([390, 330], [600, 330], 5), T(430, 265, "SYN (seq=x)", 24), arrow([430, 380], [430, 330], 3)),
        P(500),
        G(T(355, 430, "2.", 26), line([600, 460], [390, 460], 5), T(400, 500, "SYN-ACK", 24), T(440, 560, "(seq=y, ack=x+1)", 20)),
        P(500),
        G(T(355, 610, "3.", 26), line([390, 640], [600, 640], 5), T(430, 680, "ACK", 24)),
        T(380, 800, "TCP 3-way handshake", 30),
      ],
    }),
  },
  {
    test: /graph|curve|function|coordinates|math|parabola/i,
    build: () => ({
      description: "I'll draw a coordinate plane with a parabola and label it.",
      commands: [
        G(arrow([100, 760], [920, 760], 5), arrow([120, 780], [120, 80], 5)),
        P(400),
        G(
          S(
            (() => {
              const pts: Pt[] = [];
              for (let a = -0.8; a <= 0.8; a += 0.01) {
                const x = 120 + ((a + 0.8) / 1.6) * 800;
                const y = 760 - (a * a * 1.15) * 520;
                pts.push([x, y]);
              }
              return pts;
            })(),
            5
          ),
          T(850, 120, "y", 26),
          T(900, 760, "x", 26)
        ),
        P(500),
        G(S([[400, 758], [400, 762]], 6), S([[118, 755], [122, 765]], 6)),
        G(T(360, 820, "y = x²", 28), T(380, 400, "(0, 0)", 20)),
      ],
    }),
  },
];

const generic = (prompt: string): DrawingPlan => {
  const words = prompt.toLowerCase().replace(/[^a-z ]/g, "").split(/\s+/).filter(Boolean).slice(0, 5);
  const label = `You asked me to draw: "${
    words.length ? words.join(" ") : prompt
  }".`;
  return {
    description: `I'll draw a simple hand-drawn sketch related to your request.`,
    commands: [
      G(
        S([[200, 250], [300, 150], [420, 280], [540, 170], [680, 260]], 6),
        S([[180, 340], [260, 260], [340, 330], [440, 240], [540, 320], [660, 250], [760, 340]], 5)
      ),
      P(600),
      G(S(ellipse(300, 560, 130, 90, 48), 5), S(ellipse(620, 540, 100, 120, 48), 5), S([[620, 540], [300, 560]], 4)),
      P(500),
      G(S([[250, 700], [330, 640], [420, 710]], 4), S([[560, 690], [640, 620], [730, 690]], 4)),
      T(250, 840, label, 26)
    ],
  };
};

/**
 * Development/testing provider: generates real structured drawing commands
 * from a prompt template — no API key required.
 */
export class MockDrawingAI implements DrawingAI {
  readonly id = "mock";

  async generateDrawing(request: DrawingRequestContext): Promise<DrawingPlan> {
    await new Promise((r) => setTimeout(r, 350));
    const hit = templates.find((t) => t.test.test(request.prompt));
    if (hit) return hit.build(request.prompt);
    if (/draw|please|can you/i.test(request.prompt)) return generic(request.prompt);
    return landscape(request.prompt);
  }
}