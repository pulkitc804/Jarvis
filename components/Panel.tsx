import type { ReactNode } from "react";

type PanelProps = {
  title: string;
  icon?: ReactNode;
  accent?: string;
  right?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

export function Panel({
  title,
  icon,
  accent = "var(--accent)",
  right,
  className = "",
  bodyClassName = "",
  children,
}: PanelProps) {
  return (
    <section className={`panel rise flex flex-col overflow-hidden ${className}`}>
      <header className="flex items-center gap-2.5 px-4 sm:px-5 pt-4 pb-3">
        <span
          className="grid h-7 w-7 place-items-center rounded-lg text-[var(--accent)]"
          style={{ background: "color-mix(in srgb, " + accent + " 14%, transparent)", color: accent }}
        >
          {icon}
        </span>
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          {title}
        </h2>
        <div className="ml-auto flex items-center gap-2">{right}</div>
      </header>
      <div className={`flex-1 px-4 sm:px-5 pb-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
