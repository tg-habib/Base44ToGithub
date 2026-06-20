import { History, ArrowUpRight, Trash2, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoBanner } from "@/components/shared/InfoBanner";
import type { PushHistoryItem } from "@/lib/types";

interface Props {
  history: PushHistoryItem[];
  onClear: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function HistoryView({ history, onClear }: Props) {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <History className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Push history</h1>
            <p className="text-sm text-muted-foreground">Your last 10 successful exports.</p>
          </div>
        </div>
        {history.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClear}
            className="gap-2 shrink-0 text-muted-foreground hover:text-destructive hover:border-destructive/50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear all
          </Button>
        )}
      </div>

      {history.length === 0 ? (
        <InfoBanner variant="info" title="No history yet">
          Your completed exports will appear here. Use the Eject tab to push your first commit.
        </InfoBanner>
      ) : (
        <div className="space-y-2">
          {history.map((item) => (
            <div
              key={item.id}
              className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:border-primary/20 transition-colors group"
            >
              {/* GitHub icon */}
              <div className="w-9 h-9 rounded-lg bg-zinc-900 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                <Github className="h-4.5 w-4.5 text-white h-4 w-4" />
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{item.repo}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{formatDate(item.date)}</span>
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                  <span className="text-xs text-muted-foreground">{item.filesCount} files</span>
                  {item.appId && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                      <span className="text-xs font-mono text-muted-foreground truncate max-w-[100px]">
                        {item.appId.slice(0, 8)}…
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Link */}
              <a
                href={item.commitUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors opacity-0 group-hover:opacity-100"
                title="View commit"
              >
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
