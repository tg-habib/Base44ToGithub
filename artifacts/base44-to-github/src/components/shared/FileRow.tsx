import { FileCode2 } from "lucide-react";

interface Props {
  path: string;
  size: number;
  type: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function FileRow({ path, size, type }: Props) {
  const parts = path.split("/");
  const filename = parts.pop() ?? path;
  const folder = parts.join("/");

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/60 transition-colors group">
      <FileCode2 className="h-4 w-4 text-primary/60 shrink-0" />
      <div className="flex-1 min-w-0 flex items-baseline gap-1">
        {folder && (
          <span className="text-xs text-muted-foreground truncate">{folder}/</span>
        )}
        <span className="text-sm font-medium text-foreground truncate">{filename}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0 opacity-70">
        <span className="text-xs font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
          {type}
        </span>
        <span className="text-xs text-muted-foreground w-14 text-right">
          {formatSize(size)}
        </span>
      </div>
    </div>
  );
}
