import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  message: string;
  onRetry: () => void;
  onReset: () => void;
}

export function ErrorView({ message, onRetry, onReset }: Props) {
  return (
    <div className="bg-card border border-destructive/30 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 bg-destructive/5 border-b border-destructive/20 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-4 w-4 text-destructive" />
        </div>
        <div>
          <p className="text-sm font-semibold text-destructive">Export failed</p>
          <p className="text-xs text-muted-foreground mt-0.5">Something went wrong during the push.</p>
        </div>
      </div>
      <div className="p-5 space-y-4">
        <div className="bg-muted/60 border border-border rounded-xl p-3.5">
          <p className="text-xs font-mono text-foreground leading-relaxed break-words">{message}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onRetry} className="flex-1 gap-2">
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
          <Button variant="outline" onClick={onReset} className="gap-2">
            <RotateCcw className="h-4 w-4" /> Start over
          </Button>
        </div>
      </div>
    </div>
  );
}
