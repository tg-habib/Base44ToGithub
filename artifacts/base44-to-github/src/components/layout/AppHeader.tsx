import { Moon, Sun, Menu, GitBranch, ExternalLink } from "lucide-react";

interface Props {
  dark: boolean;
  onToggleDark: () => void;
  onMenuOpen: () => void;
}

export function AppHeader({ dark, onToggleDark, onMenuOpen }: Props) {
  return (
    <header className="lg:hidden h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0 z-20">
      <div className="flex items-center gap-2.5">
        <button
          onClick={onMenuOpen}
          className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center">
            <GitBranch className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-sm text-foreground">Base44 → GitHub</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleDark}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          aria-label="Toggle dark mode"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <a
          href="https://app.base44.com"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          Base44 <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </header>
  );
}
