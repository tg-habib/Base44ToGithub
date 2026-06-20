import { useState, useCallback } from "react";
import type { PushHistoryItem } from "@/lib/types";
import { lsGet, lsSet } from "@/lib/storage";

const KEY = "b44_push_history";

export function usePushHistory() {
  const [history, setHistory] = useState<PushHistoryItem[]>(
    () => lsGet<PushHistoryItem[]>(KEY) ?? [],
  );

  const add = useCallback((item: Omit<PushHistoryItem, "id" | "date">) => {
    setHistory((prev) => {
      const next = [
        { ...item, id: crypto.randomUUID(), date: new Date().toISOString() },
        ...prev,
      ].slice(0, 10);
      lsSet(KEY, next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setHistory([]);
    lsSet(KEY, []);
  }, []);

  return { history, add, clear };
}
