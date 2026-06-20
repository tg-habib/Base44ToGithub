import { CheckCircle2, Github, RefreshCw, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  commitUrl: string;
  filesCount: number;
  repoLabel: string;
  onReset: () => void;
}

export function SuccessView({ commitUrl, filesCount, repoLabel, onReset }: Props) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="p-8 text-center space-y-5">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border-2 border-emerald-300 dark:border-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center border-2 border-background">
              <Github className="h-3 w-3 text-primary-foreground" />
            </div>
          </div>
        </div>

        {/* Text */}
        <div>
          <h3 className="text-xl font-bold text-foreground">
            {filesCount} files pushed
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Successfully committed to{" "}
            <span className="font-mono font-medium text-foreground">{repoLabel}</span>
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <a
            href={commitUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Github className="h-4 w-4" />
            View commit on GitHub
            <ArrowUpRight className="h-3.5 w-3.5 opacity-70" />
          </a>
          <Button variant="outline" className="gap-2 rounded-xl" onClick={onReset}>
            <RefreshCw className="h-4 w-4" />
            Eject another app
          </Button>
        </div>
      </div>
    </div>
  );
}
