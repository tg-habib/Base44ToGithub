import { useState } from "react";
import { Loader2, Lock, Globe, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { UserRepo } from "@/lib/types";

interface Props {
  repos: UserRepo[];
  loading: boolean;
  currentRepo: string;
  onSelect: (repo: UserRepo) => void;
}

export function RepoPicker({ repos, loading, currentRepo, onSelect }: Props) {
  const [search, setSearch] = useState("");

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading your repositories…
      </div>
    );
  }

  if (repos.length === 0) return null;

  const filtered = repos
    .filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 24);

  return (
    <div className="space-y-2 pt-1">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder={`Search ${repos.length} repositories…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-xs"
        />
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
        {filtered.length === 0 ? (
          <span className="text-xs text-muted-foreground italic">No matches for "{search}"</span>
        ) : (
          filtered.map((r) => {
            const selected = r.name === currentRepo;
            return (
              <button
                key={r.fullName}
                type="button"
                onClick={() => onSelect(r)}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all",
                  selected
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted text-muted-foreground border-border hover:border-primary/50 hover:text-foreground hover:bg-muted/80",
                )}
              >
                {r.private
                  ? <Lock className="h-2.5 w-2.5 shrink-0" />
                  : <Globe className="h-2.5 w-2.5 shrink-0" />}
                {r.name}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
