import { useEffect, useRef } from "react";
import { Loader2, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  logs: string[];
  running: boolean;
}

function getLineClass(line: string): string {
  if (line.startsWith("✓")) return "text-emerald-400";
  if (line.startsWith("▶")) return "text-sky-400";
  if (line.startsWith("✗") || line.toLowerCase().includes("error")) return "text-red-400";
  if (line.toLowerCase().includes("warn")) return "text-amber-300";
  return "text-zinc-300";
}

export function LiveTerminal({ logs, running }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div className="rounded-2xl border border-border overflow-hidden shadow-lg">
      {/* Title bar */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-zinc-900 border-b border-zinc-800">
        <div className="flex gap-1.5 shrink-0">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <div className="flex-1 flex items-center justify-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-xs text-zinc-500 font-mono">base44 → github</span>
        </div>
        {running && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />
            <span className="text-xs text-zinc-500 font-mono">running</span>
          </div>
        )}
      </div>

      {/* Log output */}
      <div className="bg-zinc-950 h-72 overflow-y-auto p-4 font-mono text-xs leading-5 space-y-0.5">
        {logs.length === 0 ? (
          <span className="text-zinc-600">Waiting for output…</span>
        ) : (
          logs.map((line, i) => (
            <div key={i} className={cn("flex gap-2", getLineClass(line))}>
              <span className="text-zinc-700 select-none shrink-0">›</span>
              <span>{line || "\u00A0"}</span>
            </div>
          ))
        )}
        {running && (
          <div className="flex gap-2 text-zinc-600 mt-1">
            <span className="select-none">›</span>
            <span className="animate-pulse">█</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
