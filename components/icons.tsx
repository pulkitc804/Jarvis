/* Minimal inline icon set (stroke = currentColor) — no icon dependency. */
type P = { className?: string; size?: number };

function base(size = 16) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

export const ActivityIcon = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

export const CheckSquareIcon = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <polyline points="9 11 12 14 22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

export const CalendarIcon = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

export const MailIcon = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 6L2 7" />
  </svg>
);

export const PlusIcon = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const TrashIcon = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  </svg>
);

export const RefreshIcon = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
);

export const PlugIcon = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 22v-5M9 8V2M15 8V2M7 8h10v3a5 5 0 0 1-10 0V8Z" />
  </svg>
);

export const ChipIcon = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
  </svg>
);
