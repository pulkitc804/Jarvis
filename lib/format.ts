export function formatUSD(n: number, opts?: { compact?: boolean }): string {
  if (opts?.compact && n >= 1000) {
    return "$" + (n / 1000).toFixed(1) + "k";
  }
  if (n < 1 && n > 0) return "$" + n.toFixed(3);
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.round(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
