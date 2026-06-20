import { useState, useEffect } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { EjectView } from "@/components/eject/EjectView";
import { SchemaView } from "@/components/views/SchemaView";
import { ManualView } from "@/components/views/ManualView";
import { HistoryView } from "@/components/views/HistoryView";
import { FAQView } from "@/components/views/FAQView";
import { useDarkMode } from "@/hooks/useDarkMode";
import { usePushHistory } from "@/hooks/usePushHistory";
import { ssGet, ssSet, ssDel } from "@/lib/storage";
import type { AppView, GhSession } from "@/lib/types";

const OAUTH_STATE_KEY = "gh_oauth_state";
const SESSION_KEY = "gh_session";

export default function HomePage() {
  const { dark, toggle: toggleDark } = useDarkMode();
  const [activeView, setActiveView] = useState<AppView>("eject");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* ── GitHub OAuth session ─────────────────────────── */
  const [ghSession, setGhSession] = useState<GhSession | null>(
    () => ssGet<GhSession>(SESSION_KEY),
  );
  const [ghConnecting, setGhConnecting] = useState(false);
  const [useManualToken, setUseManualToken] = useState(false);

  /* ── Push history ─────────────────────────────────── */
  const { history, add: addToHistory, clear: clearHistory } = usePushHistory();

  /* ── Handle OAuth callback code in URL ─────────────── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code) return;

    window.history.replaceState({}, "", window.location.pathname);

    const savedState = ssGet<string>(OAUTH_STATE_KEY);
    if (state && savedState && state !== savedState) {
      console.warn("OAuth state mismatch — ignoring callback");
      return;
    }
    ssDel(OAUTH_STATE_KEY);

    setGhConnecting(true);
    fetch("/api/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then((r) => r.json())
      .then((data: GhSession & { error?: string }) => {
        if (data.error) throw new Error(data.error);
        const session: GhSession = { token: data.token, login: data.login, avatar_url: data.avatar_url };
        ssSet(SESSION_KEY, session);
        setGhSession(session);
      })
      .catch((err) => console.error("OAuth exchange failed:", err))
      .finally(() => setGhConnecting(false));
  }, []);

  /* ── OAuth helpers ────────────────────────────────── */
  const handleStartOAuth = () => {
    const state = crypto.randomUUID();
    ssSet(OAUTH_STATE_KEY, state);
    const redirectUri = window.location.origin + window.location.pathname;
    fetch(`/api/auth/web/start?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`)
      .then((r) => r.json())
      .then((data: { url: string }) => { if (data.url) window.location.href = data.url; })
      .catch(console.error);
  };

  const handleDisconnect = () => {
    ssDel(SESSION_KEY);
    setGhSession(null);
  };

  /* ── Active view ──────────────────────────────────── */
  const renderView = () => {
    const sharedOAuth = {
      ghSession,
      ghConnecting,
      useManualToken,
      onStartOAuth: handleStartOAuth,
      onDisconnect: handleDisconnect,
      onToggleManual: () => setUseManualToken((v) => !v),
    };

    switch (activeView) {
      case "eject":
        return <EjectView {...sharedOAuth} onAddToHistory={addToHistory} />;
      case "schema":
        return <SchemaView {...sharedOAuth} />;
      case "manual":
        return <ManualView />;
      case "history":
        return <HistoryView history={history} onClear={clearHistory} />;
      case "faq":
        return <FAQView />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Mobile header */}
      <AppHeader dark={dark} onToggleDark={toggleDark} onMenuOpen={() => setSidebarOpen(true)} />

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar
          activeView={activeView}
          onViewChange={setActiveView}
          ghSession={ghSession}
          onDisconnectGh={handleDisconnect}
          dark={dark}
          onToggleDark={toggleDark}
          historyCount={history.length}
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
        />

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto">
          <div className="px-6 py-8 lg:px-8 max-w-3xl">
            {renderView()}
          </div>

          {/* Footer */}
          <footer className="px-6 lg:px-8 pb-8 max-w-3xl">
            <div className="border-t border-border pt-6 flex flex-wrap items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground">
                No files are stored on our servers — everything goes directly from{" "}
                <a href="https://app.base44.com" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">
                  Base44
                </a>{" "}
                to{" "}
                <a href="https://github.com" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">
                  GitHub
                </a>
                .
              </p>
              <div className="flex items-center gap-4">
                <button onClick={() => setActiveView("faq")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  FAQ
                </button>
                <button onClick={() => setActiveView("manual")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Manual methods
                </button>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
