import {
  Zap, Database, BookOpen, History, HelpCircle,
  GitBranch, Moon, Sun, ExternalLink, X, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppView, GhSession } from "@/lib/types";

interface NavItem {
  id: AppView;
  icon: React.ReactNode;
  label: string;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "eject",   icon: <Zap className="h-4 w-4" />,      label: "Eject Full Code",  description: "Download & push all source files" },
  { id: "schema",  icon: <Database className="h-4 w-4" />, label: "Schema & Config",  description: "Push data models and config JSON" },
  { id: "manual",  icon: <BookOpen className="h-4 w-4" />, label: "Manual Methods",   description: "CLI, extension, copy-paste" },
];

const UTILITY_ITEMS: NavItem[] = [
  { id: "history", icon: <History className="h-4 w-4" />,     label: "Push History",  description: "Recent exports" },
  { id: "faq",     icon: <HelpCircle className="h-4 w-4" />,  label: "FAQ & Help",    description: "Common questions" },
];

interface Props {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  ghSession: GhSession | null;
  onDisconnectGh: () => void;
  dark: boolean;
  onToggleDark: () => void;
  historyCount: number;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function NavButton({
  item, active, onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className="shrink-0">{item.icon}</span>
      <div className="min-w-0">
        <p className={cn("text-sm font-medium leading-none", active ? "text-primary-foreground" : "")}>
          {item.label}
        </p>
      </div>
    </button>
  );
}

function SidebarContent({
  activeView, onViewChange, ghSession, onDisconnectGh,
  dark, onToggleDark, historyCount, onMobileClose,
}: Omit<Props, "mobileOpen">) {
  const handleNav = (view: AppView) => {
    onViewChange(view);
    onMobileClose();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center shrink-0">
            <GitBranch className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground leading-none">Base44</p>
            <p className="text-xs text-muted-foreground mt-0.5">→ GitHub</p>
          </div>
        </div>
        <button
          onClick={onMobileClose}
          className="lg:hidden p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        <div className="px-3 pb-2 pt-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            Export
          </p>
        </div>
        {NAV_ITEMS.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={activeView === item.id}
            onClick={() => handleNav(item.id)}
          />
        ))}

        <div className="px-3 pb-2 pt-5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            Explore
          </p>
        </div>
        {UTILITY_ITEMS.map((item) => (
          <div key={item.id} className="relative">
            <NavButton
              item={item}
              active={activeView === item.id}
              onClick={() => handleNav(item.id)}
            />
            {item.id === "history" && historyCount > 0 && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 bg-muted text-muted-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {historyCount}
              </span>
            )}
          </div>
        ))}
      </nav>

      {/* Bottom panel */}
      <div className="border-t border-border p-3 space-y-2 shrink-0">
        {ghSession ? (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
            <img
              src={ghSession.avatar_url}
              alt=""
              className="w-6 h-6 rounded-full border border-emerald-200 dark:border-emerald-700 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 truncate">
                @{ghSession.login}
              </p>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-500">GitHub connected</p>
            </div>
            <button
              onClick={onDisconnectGh}
              className="p-1 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-900 text-emerald-600 dark:text-emerald-400 transition-colors shrink-0"
              title="Disconnect"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="px-3 py-2 rounded-xl bg-muted/60">
            <p className="text-xs text-muted-foreground">GitHub not connected</p>
          </div>
        )}

        <div className="flex items-center justify-between px-1">
          <a
            href="https://app.base44.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open Base44
          </a>
          <button
            onClick={onToggleDark}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Toggle dark mode"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppSidebar(props: Props) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 border-r border-border bg-card flex-col h-full">
        <SidebarContent {...props} onMobileClose={() => {}} />
      </aside>

      {/* Mobile overlay */}
      {props.mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={props.onMobileClose}
          />
          <aside className="relative w-72 bg-card border-r border-border flex flex-col h-full z-10">
            <SidebarContent {...props} />
          </aside>
        </div>
      )}
    </>
  );
}
