import { Loader2, Github, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GhSession } from "@/lib/types";

interface Props {
  session: GhSession | null;
  connecting: boolean;
  useManualToken: boolean;
  tokenValue: string;
  onTokenChange: (v: string) => void;
  onStartOAuth: () => void;
  onDisconnect: () => void;
  onToggleManual: () => void;
}

export function GitHubConnect({
  session, connecting, useManualToken, tokenValue, onTokenChange,
  onStartOAuth, onDisconnect, onToggleManual,
}: Props) {
  if (session) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30">
        <img src={session.avatar_url} alt="" className="w-8 h-8 rounded-full border-2 border-emerald-200 dark:border-emerald-700 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">@{session.login}</p>
          <p className="text-xs text-muted-foreground">Connected via GitHub OAuth</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDisconnect}
          className="shrink-0 gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8"
        >
          <LogOut className="h-3.5 w-3.5" />
          Disconnect
        </Button>
      </div>
    );
  }

  if (useManualToken) {
    return (
      <div className="space-y-2">
        <Input
          type="password"
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          value={tokenValue}
          onChange={(e) => onTokenChange(e.target.value)}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Create one at{" "}
          <a
            href="https://github.com/settings/tokens/new?scopes=repo"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline font-medium"
          >
            github.com/settings/tokens
          </a>{" "}
          with <code className="bg-muted px-1 rounded text-xs">repo</code> scope.
        </p>
        <button
          type="button"
          onClick={onToggleManual}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Use GitHub OAuth instead
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        onClick={onStartOAuth}
        disabled={connecting}
        className="w-full gap-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white h-10"
      >
        {connecting ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</>
        ) : (
          <><Github className="h-4 w-4" /> Connect GitHub</>
        )}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        or{" "}
        <button
          type="button"
          onClick={onToggleManual}
          className="text-primary hover:underline font-medium"
        >
          use a Personal Access Token
        </button>
      </p>
    </div>
  );
}
