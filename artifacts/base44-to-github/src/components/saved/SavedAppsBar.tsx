import { Star, X } from "lucide-react";
import type { SavedApp } from "@/lib/types";

interface Props {
  apps: SavedApp[];
  onSelect: (app: SavedApp) => void;
  onRemove: (id: string) => void;
}

export function SavedAppsBar({ apps, onSelect, onRemove }: Props) {
  if (apps.length === 0) return null;

  return (
    <div className="space-y-2 p-4 bg-muted/40 border border-border rounded-xl">
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <Star className="h-3.5 w-3.5 text-amber-500" />
        Saved apps — click to load credentials
      </p>
      <div className="flex flex-wrap gap-2">
        {apps.map((app) => (
          <div
            key={app.id}
            className="group inline-flex items-center gap-0 rounded-lg border border-border bg-card overflow-hidden hover:border-primary/40 transition-all"
          >
            <button
              type="button"
              onClick={() => onSelect(app)}
              className="px-3 py-1.5 text-xs font-medium text-foreground hover:text-primary transition-colors flex items-center gap-1.5"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              {app.nickname}
            </button>
            <button
              type="button"
              onClick={() => onRemove(app.id)}
              className="px-2 py-1.5 border-l border-border text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors opacity-0 group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
