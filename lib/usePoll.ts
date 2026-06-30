"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PollState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  lastUpdated: number | null;
  refresh: () => void;
};

/** Fetch a JSON endpoint on an interval, pausing while the tab is hidden. */
export function usePoll<T>(url: string, intervalMs = 15000): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as T;
      setData(json);
      setError(null);
      setLastUpdated(Date.now());
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message || "Request failed");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, intervalMs);
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      abortRef.current?.abort();
    };
  }, [load, intervalMs]);

  return { data, error, loading, lastUpdated, refresh: load };
}
