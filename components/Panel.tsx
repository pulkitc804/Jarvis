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
    <section className={`panel flex flex-col overflow-hidden ${className}`}>
      <header className="flex items-center gap-2 px-4 sm:px-5 pt-3.5 pb-3">
        <span className="grid h-5 w-5 place-items-center" style={{ color: accent }}>
          {icon}
        </span>
        <h2 className="panel-title">{title}</h2>
        <div className="ml-auto flex items-center gap-2">{right}</div>
      </header>
      <div className={`flex-1 px-4 sm:px-5 pb-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
