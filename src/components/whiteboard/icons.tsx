import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = (props: P) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  width: 18,
  height: 18,
  ...props,
});

export const PenIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="M2 2l7.586 7.586" />
    <circle cx="11" cy="11" r="2" />
  </svg>
);

export const EraserIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M16 3.4c.6-.6 1.5-.6 2.1 0l2.5 2.5c.6.6.6 1.5 0 2.1L9.3 19.3c-.6.6-1.5.6-2.1 0l-2.5-2.5c-.6-.6-.6-1.5 0-2.1L16 3.4z" />
    <path d="M9 14l6-6" />
    <path d="M13 20h8" />
  </svg>
);

export const HandIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 11V6.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M11 10V5a1.5 1.5 0 0 1 3 0v5" />
    <path d="M14 10.5V6.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M17 10.5v-2a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6.5 7H12c-3 0-4.5-1-5.5-3.5L4 11.5a1.2 1.2 0 0 1 2-1.2l2 3" />
  </svg>
);

export const UndoIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 6 6v0a6 6 0 0 1-6 6H8" />
  </svg>
);

export const RedoIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0-6 6v0a6 6 0 0 0 6 6h6" />
  </svg>
);

export const TrashIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 6h18" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>
);

export const ZoomInIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
    <path d="M11 8v6" />
    <path d="M8 11h6" />
  </svg>
);

export const ZoomOutIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
    <path d="M8 11h6" />
  </svg>
);

export const FitIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9V4h5" />
    <path d="M20 9V4h-5" />
    <path d="M4 15v5h5" />
    <path d="M20 15v5h-5" />
  </svg>
);

export const PanelIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M15 4v16" />
  </svg>
);

export const CloseIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export const StopIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
  </svg>
);

export const SparkIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
    <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
  </svg>
);

export const SendIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m22 2-7 20-4-9-9-4 20-7z" />
    <path d="M22 2 11 13" />
  </svg>
);

export const PlusIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

export const BoardIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M8 21h8" />
    <path d="M12 17v4" />
  </svg>
);

export const ChevronDownIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const CheckIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m4 12 5 5L20 6" />
  </svg>
);

export const PencilIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);
