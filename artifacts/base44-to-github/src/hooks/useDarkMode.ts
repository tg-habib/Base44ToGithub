import { useState, useEffect } from "react";
import { lsGet, lsSet } from "@/lib/storage";

export function useDarkMode() {
  const [dark, setDark] = useState<boolean>(() => {
    const saved = lsGet<boolean>("b44_dark");
    if (saved !== null) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    lsSet("b44_dark", dark);
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}
