import { useState, useCallback } from "react";
import type { SavedApp } from "@/lib/types";
import { lsGet, lsSet } from "@/lib/storage";

const KEY = "b44_saved_apps";

export function useSavedApps() {
  const [apps, setApps] = useState<SavedApp[]>(
    () => lsGet<SavedApp[]>(KEY) ?? [],
  );

  const save = useCallback((app: Omit<SavedApp, "id">) => {
    setApps((prev) => {
      const next = [{ ...app, id: crypto.randomUUID() }, ...prev].slice(0, 8);
      lsSet(KEY, next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setApps((prev) => {
      const next = prev.filter((a) => a.id !== id);
      lsSet(KEY, next);
      return next;
    });
  }, []);

  return { apps, save, remove };
}
