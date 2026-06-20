import { useState, useRef, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { usePreviewBase44Files, usePushToGithub } from "@workspace/api-client-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileCode2, Loader2, CheckCircle2, ArrowRight, ArrowLeft, ExternalLink, Github,
  AlertCircle, ChevronRight, File, Key, GitBranch, Terminal, Puzzle, Copy,
  ChevronDown, ChevronUp, Zap, Database, Moon, Sun, Lock, Globe, History,
  BookMarked, Trash2, Star, Sparkles, ArrowUpRight, Shield, Clock, Package,
  RefreshCw, GitCommit, Plus, X, Check,
} from "lucide-react";
import type { PreviewResult } from "@workspace/api-client-react/src/generated/api.schemas";

/* ─── Schemas ─── */

const ejectStep1Schema = z.object({
  base44AppId: z.string().min(1, "App ID is required"),
  base44ApiKey: z.string().min(1, "API Key is required"),
});

const ejectStep2Schema = z.object({
  githubToken: z.string().min(1, "Personal Access Token is required"),
  githubOwner: z.string().min(1, "Owner or org name is required"),
  githubRepo: z.string().min(1, "Repository name is required"),
  branch: z.string().min(1, "Branch is required").default("main"),
  commitMessage: z.string().min(1, "Commit message is required").default("feat: eject from Base44"),
});

const previewSchema = z.object({
  base44AppId: z.string().min(1, "App ID is required"),
  base44ApiKey: z.string().min(1, "API Key is required"),
  base44AppUrl: z.string().optional(),
});

const githubSchema = z.object({
  githubToken: z.string().min(1, "Personal Access Token is required"),
  githubOwner: z.string().min(1, "Owner or org name is required"),
  githubRepo: z.string().min(1, "Repository name is required"),
  branch: z.string().min(1).default("main"),
  commitMessage: z.string().min(1).default("chore: sync from Base44"),
});

/* ─── Types ─── */

type StreamState =
  | { status: "idle" }
  | { status: "running"; logs: string[] }
  | { status: "done"; logs: string[]; commitUrl: string; filesCount: number }
  | { status: "error"; logs: string[]; message: string };

type GhSession = { token: string; login: string; avatar_url: string };

type SavedApp = { id: string; nickname: string; appId: string; apiKey: string };

type PushHistoryItem = {
  id: string;
  date: string;
  repo: string;
  commitUrl: string;
  filesCount: number;
  appId: string;
};

type UserRepo = {
  name: string;
  fullName: string;
  private: boolean;
  owner: string;
};

type Tab = "eject" | "manual" | "metadata";

/* ─── LocalStorage helpers ─── */

function lsGet<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") as T; } catch { return null; }
}
function lsSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}

/* ─── Session storage helpers ─── */

function ssGet<T>(key: string): T | null {
  try { return JSON.parse(sessionStorage.getItem(key) ?? "null") as T; } catch { return null; }
}
function ssSet(key: string, value: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}
function ssDel(key: string) {
  try { sessionStorage.removeItem(key); } catch { /* noop */ }
}

/* ─── useEjectStream ─── */

function useEjectStream() {
  const [state, setState] = useState<StreamState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const run = async (
    payload: z.infer<typeof ejectStep1Schema> & z.infer<typeof ejectStep2Schema> & { private?: boolean }
  ) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setState({ status: "running", logs: [] });

    try {
      const res = await fetch("/api/eject/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text();
        let msg = text;
        try { msg = JSON.parse(text).error ?? text; } catch { /* noop */ }
        setState({ status: "error", logs: [], message: msg });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const logs: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const chunk of parts) {
          const lines = chunk.split("\n");
          let eventName = "";
          let dataLine = "";
          for (const l of lines) {
            if (l.startsWith("event: ")) eventName = l.slice(7).trim();
            if (l.startsWith("data: ")) dataLine = l.slice(6);
          }
          if (!dataLine) continue;
          let parsed: Record<string, unknown>;
          try { parsed = JSON.parse(dataLine); } catch { continue; }

          if (eventName === "log") {
            const line = String(parsed.line ?? "");
            logs.push(line);
            setState({ status: "running", logs: [...logs] });
          } else if (eventName === "result") {
            setState({
              status: "done",
              logs: [...logs],
              commitUrl: String(parsed.commitUrl ?? ""),
              filesCount: Number(parsed.filesCount ?? 0),
            });
          } else if (eventName === "error") {
            setState({ status: "error", logs: [...logs], message: String(parsed.message ?? "Unknown error") });
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Unknown error";
      setState(prev => ({ status: "error", logs: prev.status === "running" ? prev.logs : [], message: msg }));
    }
  };

  const reset = () => { abortRef.current?.abort(); setState({ status: "idle" }); };
  return { state, run, reset };
}

/* ─── useDarkMode ─── */

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const saved = lsGet<boolean>("b44_dark");
    if (saved !== null) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    lsSet("b44_dark", dark);
  }, [dark]);

  return { dark, toggle: () => setDark(d => !d) };
}

/* ─── useUserRepos ─── */

function useUserRepos(token: string | null) {
  const [repos, setRepos] = useState<UserRepo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) { setRepos([]); return; }
    setLoading(true);
    fetch(`/api/repos?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then((data: { repos?: UserRepo[] }) => { setRepos(data.repos ?? []); })
      .catch(() => setRepos([]))
      .finally(() => setLoading(false));
  }, [token]);

  return { repos, loading };
}

/* ─── usePushHistory ─── */

function usePushHistory() {
  const [history, setHistory] = useState<PushHistoryItem[]>(() =>
    lsGet<PushHistoryItem[]>("b44_push_history") ?? []
  );

  const add = useCallback((item: Omit<PushHistoryItem, "id" | "date">) => {
    setHistory(prev => {
      const next = [
        { ...item, id: crypto.randomUUID(), date: new Date().toISOString() },
        ...prev,
      ].slice(0, 8);
      lsSet("b44_push_history", next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setHistory([]);
    lsSet("b44_push_history", []);
  }, []);

  return { history, add, clear };
}

/* ─── useSavedApps ─── */

function useSavedApps() {
  const [apps, setApps] = useState<SavedApp[]>(() =>
    lsGet<SavedApp[]>("b44_saved_apps") ?? []
  );

  const save = useCallback((app: Omit<SavedApp, "id">) => {
    setApps(prev => {
      const next = [{ ...app, id: crypto.randomUUID() }, ...prev].slice(0, 6);
      lsSet("b44_saved_apps", next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setApps(prev => {
      const next = prev.filter(a => a.id !== id);
      lsSet("b44_saved_apps", next);
      return next;
    });
  }, []);

  return { apps, save, remove };
}

/* ─── Small shared components ─── */

function HelpLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline text-xs font-medium">
      {children}<ExternalLink className="h-3 w-3" />
    </a>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{children}</p>;
}

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card border border-border rounded-2xl shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function FileRow({ path, size, type }: { path: string; size: number; type: string }) {
  const parts = path.split("/");
  const filename = parts.pop() ?? path;
  const folder = parts.join("/");
  const sizeLabel =
    size < 1024 ? `${size} B` :
    size < 1_048_576 ? `${(size / 1024).toFixed(1)} KB` :
    `${(size / 1_048_576).toFixed(1)} MB`;
  return (
    <div className="flex items-center gap-2.5 py-2 px-3 rounded-lg hover:bg-muted/60 transition-colors">
      <FileCode2 className="h-4 w-4 text-primary/70 shrink-0" />
      <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
        {folder && <span className="text-muted-foreground text-xs truncate">{folder}/</span>}
        <span className="text-sm font-medium text-foreground truncate">{filename}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">{type}</span>
        <span className="text-xs text-muted-foreground w-12 text-right">{sizeLabel}</span>
      </div>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group">
      <pre className="bg-muted/70 border border-border rounded-lg px-4 py-3 text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap">{code}</pre>
      <button
        onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-background border border-border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
      >
        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
    </div>
  );
}

function CollapseCard({
  icon, badge, title, desc, children, defaultOpen = false,
}: { icon: React.ReactNode; badge: string; title: string; desc: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <button className="w-full flex items-start gap-3.5 p-4 text-left hover:bg-muted/30 transition-colors" onClick={() => setOpen(v => !v)}>
        <div className="w-9 h-9 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center justify-center shrink-0 mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            <span className="text-xs font-medium bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full">{badge}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
        </div>
        <div className="shrink-0 mt-1">
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border pt-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}

function StepBadge({ current }: { current: 1 | 2 }) {
  const steps = [{ n: 1, label: "Credentials" }, { n: 2, label: "GitHub" }];
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => {
        const done = step.n < current;
        const active = step.n === current;
        return (
          <div key={step.n} className="flex items-center">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all
                ${active ? "bg-primary text-primary-foreground" : done ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : step.n}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${active ? "text-foreground" : done ? "text-primary" : "text-muted-foreground"}`}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground/40 mx-2" />}
          </div>
        );
      })}
    </div>
  );
}

/* ─── LiveTerminal ─── */

function LiveTerminal({ logs, running }: { logs: string[]; running: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs.length]);

  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-900 border-b border-zinc-700/80">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <div className="flex-1 flex items-center justify-center gap-2">
          <Terminal className="h-3 w-3 text-zinc-400" />
          <span className="text-xs text-zinc-400 font-mono">base44 → github</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-600 font-mono">{ts}</span>
          {running && <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />}
        </div>
      </div>
      <div className="bg-zinc-950 h-64 overflow-y-auto p-4 font-mono text-xs leading-relaxed space-y-0.5">
        {logs.length === 0 ? (
          <span className="text-zinc-600">Initialising…</span>
        ) : (
          logs.map((line, i) => (
            <div key={i} className={
              line.startsWith("✓") ? "text-emerald-400" :
              line.startsWith("▶") ? "text-sky-400" :
              line.startsWith("✗") || line.toLowerCase().includes("error") ? "text-red-400" :
              line.toLowerCase().includes("warn") ? "text-amber-300" :
              "text-zinc-300"
            }>
              <span className="text-zinc-700 select-none mr-2">›</span>{line || <>&nbsp;</>}
            </div>
          ))
        )}
        {running && <div className="text-zinc-500 animate-pulse mt-1">█</div>}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/* ─── RepoChips — clickable suggestions from GitHub ─── */

function RepoChips({
  repos, loading, onSelect, currentRepo,
}: {
  repos: UserRepo[];
  loading: boolean;
  onSelect: (r: UserRepo) => void;
  currentRepo: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = repos.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.fullName.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 20);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Fetching your repos…
      </div>
    );
  }
  if (repos.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            placeholder="Search your repos…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-7 text-xs pl-7"
          />
          <RefreshCw className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{repos.length} repos</span>
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
        {filtered.map(r => {
          const selected = r.name === currentRepo;
          return (
            <button
              key={r.fullName}
              type="button"
              onClick={() => onSelect(r)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all
                ${selected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"}`}
            >
              {r.private
                ? <Lock className="h-2.5 w-2.5 shrink-0" />
                : <Globe className="h-2.5 w-2.5 shrink-0" />}
              {r.name}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <span className="text-xs text-muted-foreground italic">No repos match "{search}"</span>
        )}
      </div>
    </div>
  );
}

/* ─── SavedAppsBar ─── */

function SavedAppsBar({
  apps, onSelect, onRemove,
}: {
  apps: SavedApp[];
  onSelect: (app: SavedApp) => void;
  onRemove: (id: string) => void;
}) {
  if (apps.length === 0) return null;
  return (
    <div className="space-y-2 mb-4">
      <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
        <BookMarked className="h-3.5 w-3.5" /> Saved apps — click to load
      </p>
      <div className="flex flex-wrap gap-2">
        {apps.map(app => (
          <div key={app.id} className="group inline-flex items-center gap-0 border border-border rounded-lg overflow-hidden bg-muted/50 hover:border-primary/40 transition-all">
            <button
              type="button"
              onClick={() => onSelect(app)}
              className="px-3 py-1.5 text-xs font-medium text-foreground hover:text-primary transition-colors flex items-center gap-1.5"
            >
              <Star className="h-3 w-3 text-amber-500" />
              {app.nickname}
              <span className="text-muted-foreground font-mono">{app.appId.slice(0, 8)}…</span>
            </button>
            <button
              type="button"
              onClick={() => onRemove(app.id)}
              className="px-2 py-1.5 hover:bg-destructive/10 hover:text-destructive transition-colors border-l border-border opacity-0 group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── SaveAppDialog ─── */

function SaveAppDialog({
  onSave, onCancel,
}: {
  onSave: (nickname: string) => void;
  onCancel: () => void;
}) {
  const [nickname, setNickname] = useState("");
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="space-y-1">
          <h3 className="font-semibold text-foreground">Save this app</h3>
          <p className="text-sm text-muted-foreground">Give it a nickname for quick access later.</p>
        </div>
        <Input
          placeholder="e.g. My CRM, Marketing Dashboard…"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && nickname.trim()) onSave(nickname.trim()); }}
          autoFocus
          className="text-sm"
        />
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
          <Button className="flex-1 gap-2" disabled={!nickname.trim()} onClick={() => onSave(nickname.trim())}>
            <Check className="h-4 w-4" /> Save
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── HeroSection ─── */

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-zinc-900 to-slate-900 dark:from-zinc-950 dark:via-slate-950 dark:to-zinc-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.15),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(16,185,129,0.10),transparent_60%)]" />
      <div className="relative max-w-5xl mx-auto px-6 py-16 sm:py-20">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-medium text-white/80 mb-6">
          <Sparkles className="h-3 w-3 text-amber-400" />
          Free · No CLI · No setup required
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight tracking-tight mb-4">
          Export Base44 to GitHub
          <span className="block text-emerald-400 mt-1">in under 15 seconds</span>
        </h1>
        <p className="text-white/70 text-base sm:text-lg leading-relaxed max-w-xl mb-10">
          Download your full source code — JSX pages, components, entities, config — and push it to any GitHub repo in a single commit. No CLI, no manual copying.
        </p>

        {/* Stats */}
        <div className="flex flex-wrap gap-6 mb-10">
          {[
            { icon: <Package className="h-4 w-4" />, label: "100+ files per export" },
            { icon: <Clock className="h-4 w-4" />, label: "5–15 second push" },
            { icon: <Shield className="h-4 w-4" />, label: "API key never stored" },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-sm text-white/60">
              <span className="text-emerald-400">{icon}</span>
              {label}
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { n: "01", title: "Enter credentials", desc: "Paste your Base44 App ID and API key from the dashboard." },
            { n: "02", title: "Connect GitHub", desc: "OAuth one-click or paste a Personal Access Token." },
            { n: "03", title: "Push & done", desc: "All files land in your repo as a single clean commit." },
          ].map(({ n, title, desc }) => (
            <div key={n} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/8 transition-colors">
              <span className="text-xs font-bold text-emerald-400/80 font-mono">{n}</span>
              <h3 className="text-sm font-semibold text-white mt-1 mb-1">{title}</h3>
              <p className="text-xs text-white/50 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── PushHistorySection ─── */

function PushHistorySection({ history, onClear }: { history: PushHistoryItem[]; onClear: () => void }) {
  if (history.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          Recent exports
        </h2>
        <button
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
        >
          <Trash2 className="h-3 w-3" /> Clear
        </button>
      </div>
      <div className="space-y-2">
        {history.map(item => {
          const d = new Date(item.date);
          const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
            " at " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
          return (
            <div key={item.id} className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl hover:border-border/80 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0">
                <GitCommit className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{item.repo}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{item.filesCount} files</span>
                </div>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
              <a
                href={item.commitUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── FAQSection ─── */

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="text-sm font-medium text-foreground">{q}</span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border pt-3 text-sm text-muted-foreground leading-relaxed animate-in fade-in duration-150">
          {a}
        </div>
      )}
    </div>
  );
}

function FAQSection() {
  const faqs = [
    {
      q: "Is my API key stored anywhere?",
      a: "No. Your Base44 API key is sent directly to the Base44 API to download your files, then immediately discarded. It is never logged, stored in a database, or retained on the server. The same applies to your GitHub token.",
    },
    {
      q: "Will this overwrite files in my existing repo?",
      a: "Yes — the eject pushes all source files as a new commit. Files that existed in the repo but are not in the Base44 export are left untouched. If you want a clean slate, create a new repo or a new branch.",
    },
    {
      q: "What files does the eject include?",
      a: "Everything in the Base44 eject archive: JSX pages, components, entities (data models), config files, package.json, and any other source files. Binary files and node_modules are excluded automatically.",
    },
    {
      q: "Can I push to a private GitHub repo?",
      a: "Yes — toggle 'Private repo' in the GitHub destination step. If the repo doesn't exist yet, it will be created as private. If it already exists, its visibility is unchanged.",
    },
    {
      q: "Do I need the GitHub CLI or any other tool installed?",
      a: "No. Everything runs in the browser and on our server. You only need your Base44 API key and a GitHub token (or OAuth).",
    },
    {
      q: "What is the GitHub OAuth flow?",
      a: "Click 'Connect GitHub' and you'll be redirected to GitHub to authorise access. After approving, you're redirected back and connected automatically. Your session persists across page refreshes for convenience.",
    },
    {
      q: "Can I push to a GitHub Organisation repo?",
      a: "Yes — enter the organisation name as the 'Owner' field. If the repo doesn't exist yet, it will be created under the org (requires your token to have org write access).",
    },
  ];

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-foreground">Frequently asked questions</h2>
      <div className="space-y-2">
        {faqs.map(({ q, a }) => <FAQItem key={q} q={q} a={a} />)}
      </div>
    </section>
  );
}

/* ─── PageFooter ─── */

function PageFooter() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="w-5 h-5 bg-primary rounded-md flex items-center justify-center">
            <GitBranch className="h-3 w-3 text-primary-foreground" />
          </div>
          <span className="font-medium text-foreground">Base44 → GitHub</span>
          <span>· Built for Base44 developers</span>
        </div>
        <div className="flex items-center gap-5 text-xs text-muted-foreground">
          <a href="https://app.base44.com" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors flex items-center gap-1">
            Base44 <ExternalLink className="h-2.5 w-2.5" />
          </a>
          <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors flex items-center gap-1">
            GitHub <ExternalLink className="h-2.5 w-2.5" />
          </a>
          <span>No data stored · Free to use</span>
        </div>
      </div>
    </footer>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════ */

export default function Home() {
  const { toast } = useToast();
  const { dark, toggle: toggleDark } = useDarkMode();
  const [tab, setTab] = useState<Tab>("eject");
  const { history, add: addToHistory, clear: clearHistory } = usePushHistory();
  const { apps: savedApps, save: saveApp, remove: removeSavedApp } = useSavedApps();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isPrivateRepo, setIsPrivateRepo] = useState(false);

  /* ── Session storage helpers ── */
  function _readSS<T>(key: string): T | null {
    try { return JSON.parse(sessionStorage.getItem(key) ?? "null") as T; } catch { return null; }
  }

  /* ── Eject state ── */
  const _savedCreds = _readSS<z.infer<typeof ejectStep1Schema>>("eject_step1");
  const [ejectStep, setEjectStep] = useState<1 | 2>(_savedCreds ? 2 : 1);
  const [ejectStep1Data, setEjectStep1Data] = useState<z.infer<typeof ejectStep1Schema> | null>(_savedCreds);
  const { state: streamState, run: runStream, reset: resetStream } = useEjectStream();

  const ejectForm1 = useForm<z.infer<typeof ejectStep1Schema>>({
    resolver: zodResolver(ejectStep1Schema),
    defaultValues: _savedCreds ?? { base44AppId: "", base44ApiKey: "" },
  });

  const ejectForm2 = useForm<z.infer<typeof ejectStep2Schema>>({
    resolver: zodResolver(ejectStep2Schema),
    defaultValues: { githubToken: "", githubOwner: "", githubRepo: "", branch: "main", commitMessage: "feat: eject from Base44" },
  });

  /* ── GitHub OAuth ── */
  const [ghSession, setGhSessionRaw] = useState<GhSession | null>(() => ssGet<GhSession>("gh_session"));
  const [ghConnecting, setGhConnecting] = useState(false);
  const [useManualToken, setUseManualToken] = useState(false);

  const setGhSession = (s: GhSession | null) => {
    setGhSessionRaw(s);
    if (s) ssSet("gh_session", s); else ssDel("gh_session");
  };

  /* ── GitHub repos for picker ── */
  const { repos: userRepos, loading: reposLoading } = useUserRepos(ghSession?.token ?? null);

  /* Handle ?code= OAuth callback */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const returnedState = params.get("state");
    if (!code) return;

    window.history.replaceState({}, "", window.location.pathname);

    const savedState = sessionStorage.getItem("gh_oauth_state");
    ssDel("gh_oauth_state");
    if (returnedState && savedState && returnedState !== savedState) {
      toast({ title: "GitHub auth failed", description: "State mismatch — please try again.", variant: "destructive" });
      return;
    }

    setGhConnecting(true);
    fetch("/api/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, redirect_uri: window.location.origin + window.location.pathname }),
    })
      .then(r => r.json())
      .then((data: { token?: string; login?: string; avatar_url?: string; error?: string; error_description?: string }) => {
        if (data.token) {
          setGhSession({ token: data.token, login: data.login ?? "", avatar_url: data.avatar_url ?? "" });
        } else {
          toast({ title: "GitHub auth failed", description: data.error_description ?? data.error ?? "Unknown error", variant: "destructive" });
        }
      })
      .catch(() => toast({ title: "GitHub auth failed", description: "Could not reach the server.", variant: "destructive" }))
      .finally(() => setGhConnecting(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ghSession) {
      ejectForm2.setValue("githubToken", ghSession.token);
      if (ghSession.login) ejectForm2.setValue("githubOwner", ghSession.login);
    }
  }, [ghSession, ejectForm2]);

  const startWebFlow = async () => {
    try {
      const state = crypto.randomUUID();
      sessionStorage.setItem("gh_oauth_state", state);
      const redirectUri = window.location.origin + window.location.pathname;
      const res = await fetch(`/api/auth/web/start?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`);
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Failed to start GitHub auth");
      window.location.href = data.url;
    } catch (err) {
      toast({ title: "GitHub connection failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const disconnectGitHub = () => {
    setGhSession(null);
    setUseManualToken(false);
    ejectForm2.setValue("githubToken", "");
    ejectForm2.setValue("githubOwner", "");
  };

  /* ── Eject form handlers ── */
  const onEjectStep1Submit = (values: z.infer<typeof ejectStep1Schema>) => {
    try { sessionStorage.setItem("eject_step1", JSON.stringify(values)); } catch { /* noop */ }
    setEjectStep1Data(values);
    setEjectStep(2);
  };

  const onEjectStep2Submit = (values: z.infer<typeof ejectStep2Schema>) => {
    if (!ejectStep1Data) return;
    runStream({ ...ejectStep1Data, ...values, private: isPrivateRepo });
  };

  const resetEject = () => {
    resetStream();
    setEjectStep(1);
    setEjectStep1Data(null);
    try { sessionStorage.removeItem("eject_step1"); } catch { /* noop */ }
    ejectForm1.reset();
    ejectForm2.reset();
    setIsPrivateRepo(false);
  };

  /* Track successful ejects in push history */
  useEffect(() => {
    if (streamState.status === "done") {
      const repo = `${ejectForm2.getValues("githubOwner")}/${ejectForm2.getValues("githubRepo")}`;
      addToHistory({
        repo,
        commitUrl: streamState.commitUrl,
        filesCount: streamState.filesCount,
        appId: ejectStep1Data?.base44AppId ?? "",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamState.status]);

  const isRunning = streamState.status === "running";
  const isDone = streamState.status === "done";
  const isError = streamState.status === "error";
  const showTerminal = streamState.status === "running" || streamState.status === "done" || streamState.status === "error";
  const logs = showTerminal ? streamState.logs : [];

  /* ── Repo picker handler ── */
  const handleRepoSelect = (r: UserRepo) => {
    ejectForm2.setValue("githubOwner", r.owner);
    ejectForm2.setValue("githubRepo", r.name);
    setIsPrivateRepo(r.private);
  };

  /* ── Metadata push state ── */
  const [metaStep, setMetaStep] = useState<1 | 2 | 3>(1);
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [pushResult, setPushResult] = useState<{ url: string; count: number } | null>(null);

  const form1 = useForm<z.infer<typeof previewSchema>>({
    resolver: zodResolver(previewSchema),
    defaultValues: { base44AppId: "", base44ApiKey: "", base44AppUrl: "" },
  });
  const form2 = useForm<z.infer<typeof githubSchema>>({
    resolver: zodResolver(githubSchema),
    defaultValues: { githubToken: "", githubOwner: "", githubRepo: "", branch: "main", commitMessage: "chore: sync from Base44" },
  });
  const previewMutation = usePreviewBase44Files();
  const pushMutation = usePushToGithub();

  useEffect(() => {
    if (ghSession) form2.setValue("githubToken", ghSession.token);
  }, [ghSession, form2]);

  const onPreviewSubmit = (values: z.infer<typeof previewSchema>) => {
    previewMutation.mutate({ data: values }, {
      onSuccess: (data) => { setPreviewData(data); setMetaStep(2); },
      onError: (err: unknown) => {
        const msg = (err as { error?: string })?.error ?? "Could not connect to Base44.";
        toast({ title: "Connection failed", description: msg, variant: "destructive" });
      },
    });
  };

  const onPushSubmit = (values: z.infer<typeof githubSchema>) => {
    const base44Values = form1.getValues();
    pushMutation.mutate({ data: { ...base44Values, ...values } }, {
      onSuccess: (data) => {
        if (data.success) { setPushResult({ url: data.commitUrl, count: data.filesCount }); setMetaStep(3); }
        else toast({ title: "Push failed", description: data.message, variant: "destructive" });
      },
      onError: (err: unknown) => {
        const msg = (err as { error?: string })?.error ?? "Something went wrong.";
        toast({ title: "Push failed", description: msg, variant: "destructive" });
      },
    });
  };

  const TABS: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: "eject", icon: <Terminal className="h-4 w-4" />, label: "Eject Full Code" },
    { id: "manual", icon: <Puzzle className="h-4 w-4" />, label: "Manual Methods" },
    { id: "metadata", icon: <Database className="h-4 w-4" />, label: "Schema & Config" },
  ];

  /* ══ Render ══ */
  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* ── Header ── */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <GitBranch className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm text-foreground">Base44 → GitHub</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleDark}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Toggle dark mode"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <a href="https://app.base44.com" target="_blank" rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              Open Base44 <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <HeroSection />

      {/* ── Main content ── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-10 space-y-10">

        {/* Tool card */}
        <div className="max-w-2xl mx-auto space-y-5" id="tool">

          <div className="space-y-1">
            <h2 className="text-xl font-bold text-foreground tracking-tight">Export your app</h2>
            <p className="text-muted-foreground text-sm">Choose a method below to push your Base44 source code to GitHub.</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-muted rounded-xl">
            {TABS.map(({ id, icon, label }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                  tab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}>
                {icon}{label}
              </button>
            ))}
          </div>

          {/* ══ TAB: EJECT FULL CODE ══ */}
          {tab === "eject" && (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">

              <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl p-4">
                <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">One-click full export</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Calls the Base44 API with your key, downloads all source files, then pushes to GitHub in a single commit.
                    <strong className="text-foreground"> No CLI required.</strong> Takes ~5–15 seconds.
                  </p>
                </div>
              </div>

              {/* Step 1 form */}
              {ejectStep === 1 && !showTerminal && (
                <SectionCard className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <StepBadge current={1} />
                    <div className="flex items-center gap-2">
                      {ejectStep1Data && (
                        <Button variant="ghost" size="sm" className="text-xs h-7 gap-1.5"
                          onClick={() => { setEjectStep(2); }}>
                          Skip <ArrowRight className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Key className="h-4 w-4 text-muted-foreground" /> Base44 credentials
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Your app ID and API key from the Base44 dashboard.</p>
                  </div>

                  <SavedAppsBar
                    apps={savedApps}
                    onSelect={app => { ejectForm1.setValue("base44AppId", app.appId); ejectForm1.setValue("base44ApiKey", app.apiKey); }}
                    onRemove={removeSavedApp}
                  />

                  <Form {...ejectForm1}>
                    <form id="eject-step1-form" onSubmit={ejectForm1.handleSubmit(onEjectStep1Submit)} className="space-y-3">
                      <FormField control={ejectForm1.control} name="base44AppId" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">App ID</FormLabel>
                          <FormControl>
                            <Input placeholder="69dff787f3edfb6f77adcfb0" className="text-sm font-mono" {...field} />
                          </FormControl>
                          <FieldHint>
                            Find it in <HelpLink href="https://app.base44.com">Base44 → Settings → App ID</HelpLink> or in the URL of your app editor.
                          </FieldHint>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )} />
                      <FormField control={ejectForm1.control} name="base44ApiKey" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">API Key</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••••••••••••••" className="text-sm" {...field} />
                          </FormControl>
                          <FieldHint>
                            SDK runtime key from <HelpLink href="https://app.base44.com">Base44 → Settings → API Keys</HelpLink>.
                          </FieldHint>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )} />
                      <div className="flex items-center gap-2 pt-1">
                        <Button type="submit" className="flex-1 gap-2">
                          Continue <ArrowRight className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="gap-2 shrink-0"
                          onClick={() => {
                            const vals = ejectForm1.getValues();
                            if (vals.base44AppId && vals.base44ApiKey) setShowSaveDialog(true);
                            else toast({ description: "Fill in your credentials first to save them.", variant: "destructive" });
                          }}
                        >
                          <BookMarked className="h-4 w-4" /> Save
                        </Button>
                      </div>
                    </form>
                  </Form>
                </SectionCard>
              )}

              {/* Step 2 form */}
              {ejectStep === 2 && !showTerminal && (
                <SectionCard className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <StepBadge current={2} />
                    <Button variant="ghost" size="sm" className="text-xs h-7 gap-1.5"
                      onClick={() => setEjectStep(1)}>
                      <ArrowLeft className="h-3 w-3" /> Back
                    </Button>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Github className="h-4 w-4 text-muted-foreground" /> GitHub destination
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Where should the code be pushed?</p>
                  </div>

                  {/* GitHub auth */}
                  {!ghSession && !useManualToken ? (
                    <div className="space-y-2">
                      <Button
                        type="button"
                        className="w-full gap-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white"
                        onClick={startWebFlow}
                        disabled={ghConnecting}
                      >
                        {ghConnecting
                          ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</>
                          : <><Github className="h-4 w-4" /> Connect GitHub</>}
                      </Button>
                      <button
                        type="button"
                        onClick={() => setUseManualToken(true)}
                        className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-1 transition-colors"
                      >
                        Or use a Personal Access Token instead
                      </button>
                    </div>
                  ) : ghSession ? (
                    <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                      <div className="flex items-center gap-3">
                        <img src={ghSession.avatar_url} alt="" className="w-7 h-7 rounded-full border border-emerald-200 dark:border-emerald-800" />
                        <div>
                          <p className="text-xs font-semibold text-foreground">Connected as @{ghSession.login}</p>
                          <p className="text-xs text-muted-foreground">GitHub OAuth</p>
                        </div>
                      </div>
                      <button onClick={disconnectGitHub} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <FormField control={ejectForm2.control} name="githubToken" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">Personal Access Token</FormLabel>
                          <FormControl><Input type="password" placeholder="ghp_…" className="text-sm font-mono" {...field} /></FormControl>
                          <FieldHint>
                            Create one at <HelpLink href="https://github.com/settings/tokens">github.com/settings/tokens</HelpLink> with <code className="bg-muted px-1 rounded text-xs">repo</code> scope.
                          </FieldHint>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )} />
                      <button
                        type="button"
                        onClick={() => { setUseManualToken(false); ejectForm2.setValue("githubToken", ""); }}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        ← Back to OAuth
                      </button>
                    </div>
                  )}

                  {/* Repo destination fields */}
                  <Form {...ejectForm2}>
                    <form id="eject-step2-form" onSubmit={ejectForm2.handleSubmit(onEjectStep2Submit)} className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <FormField control={ejectForm2.control} name="githubOwner" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium">Owner / Org</FormLabel>
                            <FormControl><Input placeholder="your-username" className="text-sm" {...field} /></FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )} />
                        <FormField control={ejectForm2.control} name="githubRepo" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium">Repository</FormLabel>
                            <FormControl><Input placeholder="my-app" className="text-sm" {...field} /></FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )} />
                      </div>

                      {/* Repo picker chips */}
                      {(ghSession || useManualToken) && (
                        <RepoChips
                          repos={userRepos}
                          loading={reposLoading}
                          onSelect={handleRepoSelect}
                          currentRepo={ejectForm2.watch("githubRepo")}
                        />
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <FormField control={ejectForm2.control} name="branch" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium">Branch</FormLabel>
                            <FormControl><Input placeholder="main" className="text-sm" {...field} /></FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )} />
                        <FormField control={ejectForm2.control} name="commitMessage" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium">Commit message</FormLabel>
                            <FormControl><Input className="text-sm" {...field} /></FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )} />
                      </div>

                      {/* Private repo toggle */}
                      <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border cursor-pointer hover:bg-muted/80 transition-colors">
                        <div
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                            isPrivateRepo ? "bg-primary border-primary" : "border-border bg-background"
                          }`}
                          onClick={() => setIsPrivateRepo(v => !v)}
                        >
                          {isPrivateRepo && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium text-foreground">Private repo</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">Only applies when creating a new repo.</p>
                        </div>
                      </label>

                      <Button type="submit" className="w-full gap-2" disabled={isRunning}>
                        {isRunning
                          ? <><Loader2 className="h-4 w-4 animate-spin" /> Pushing…</>
                          : <><Zap className="h-4 w-4" /> Eject &amp; Push to GitHub</>}
                      </Button>
                    </form>
                  </Form>
                </SectionCard>
              )}

              {/* Terminal + results */}
              {showTerminal && (
                <div className="space-y-4">
                  <LiveTerminal logs={logs} running={isRunning} />

                  {isDone && streamState.status === "done" && (
                    <SectionCard className="p-5">
                      <div className="text-center space-y-3 py-2">
                        <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border-2 border-emerald-300 dark:border-emerald-700 flex items-center justify-center mx-auto">
                          <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-foreground">
                            {streamState.filesCount} files pushed to GitHub
                          </h3>
                          <p className="text-sm text-muted-foreground mt-0.5">Your source code is live on GitHub.</p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 justify-center">
                          <a
                            href={streamState.commitUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                          >
                            <Github className="h-4 w-4" /> View commit on GitHub
                          </a>
                          <Button variant="outline" className="gap-2" onClick={resetEject}>
                            <RefreshCw className="h-4 w-4" /> Eject another app
                          </Button>
                        </div>
                      </div>
                    </SectionCard>
                  )}

                  {isError && streamState.status === "error" && (
                    <SectionCard className="p-5">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-destructive">Export failed</p>
                          <p className="text-xs text-muted-foreground mt-1 break-words">{streamState.message}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button variant="outline" className="flex-1 gap-2" onClick={() => {
                          if (ejectStep1Data && ejectForm2.getValues().githubToken) {
                            onEjectStep2Submit(ejectForm2.getValues());
                          }
                        }}>
                          <RefreshCw className="h-4 w-4" /> Try again
                        </Button>
                        <Button variant="ghost" className="flex-1" onClick={resetEject}>Start over</Button>
                      </div>
                    </SectionCard>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ══ TAB: MANUAL METHODS ══ */}
          {tab === "manual" && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <CollapseCard
                defaultOpen
                icon={<Globe className="h-4 w-4 text-emerald-600" />}
                badge="Easiest"
                title="Chrome Extension"
                desc="Install a browser extension that adds a ZIP export button to Base44."
              >
                <p className="text-sm text-muted-foreground">
                  Search the Chrome Web Store for "Base44 ZIP exporter" or similar community tools. Once installed, open your Base44 app and click the extension to download all files as a ZIP.
                </p>
                <p className="text-sm text-muted-foreground">
                  After downloading, unzip and push manually with <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">git push</code>.
                </p>
              </CollapseCard>

              <CollapseCard
                icon={<Terminal className="h-4 w-4 text-emerald-600" />}
                badge="CLI"
                title="Base44 CLI"
                desc="Run the official Base44 eject command locally in your terminal."
              >
                <CodeBlock code={`npx base44 eject --app-id YOUR_APP_ID --api-key YOUR_API_KEY`} />
                <p className="text-sm text-muted-foreground">
                  This downloads all source files to the current directory. Then commit and push as usual.
                </p>
              </CollapseCard>

              <CollapseCard
                icon={<Copy className="h-4 w-4 text-emerald-600" />}
                badge="Manual"
                title="Copy-paste from editor"
                desc="Open each file in the Base44 editor and copy the source directly."
              >
                <p className="text-sm text-muted-foreground leading-relaxed">
                  In the Base44 editor, click any file in the left sidebar to view its source. Copy the contents and paste into a matching file in your local repo. Best for small apps with few files.
                </p>
              </CollapseCard>
            </div>
          )}

          {/* ══ TAB: SCHEMA & CONFIG ══ */}
          {tab === "metadata" && (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-start gap-3 bg-muted/50 border border-border rounded-xl p-4">
                <Database className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Push schema &amp; config only</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Fetches the entity schema, app config, and data model as JSON files and pushes them to GitHub — without the full source code. Useful for version-controlling your data model separately.
                  </p>
                </div>
              </div>

              {metaStep === 1 && (
                <SectionCard className="p-5 space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Step 1 — Fetch from Base44</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Connect to your app to preview what will be pushed.</p>
                  </div>
                  <Form {...form1}>
                    <form onSubmit={form1.handleSubmit(onPreviewSubmit)} className="space-y-3">
                      <FormField control={form1.control} name="base44AppId" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">App ID</FormLabel>
                          <FormControl><Input placeholder="69dff787f3edfb6f77adcfb0" className="text-sm font-mono" {...field} /></FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )} />
                      <FormField control={form1.control} name="base44ApiKey" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">API Key</FormLabel>
                          <FormControl><Input type="password" placeholder="••••••••••••••••••••" className="text-sm" {...field} /></FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )} />
                      <FormField control={form1.control} name="base44AppUrl" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">App URL <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                          <FormControl><Input placeholder="https://my-app.base44.app" className="text-sm" {...field} /></FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )} />
                      <Button type="submit" className="w-full gap-2" disabled={previewMutation.isPending}>
                        {previewMutation.isPending
                          ? <><Loader2 className="h-4 w-4 animate-spin" /> Fetching…</>
                          : <><ArrowRight className="h-4 w-4" /> Fetch files</>}
                      </Button>
                    </form>
                  </Form>
                </SectionCard>
              )}

              {metaStep === 2 && previewData && (
                <>
                  <SectionCard className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">Files to push ({previewData.files?.length ?? 0})</p>
                      <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => setMetaStep(1)}>
                        <ArrowLeft className="h-3 w-3" /> Back
                      </Button>
                    </div>
                    <ScrollArea className="h-48">
                      <div className="space-y-0.5">
                        {previewData.files?.map((f: { path: string; size: number; type: string }) => (
                          <FileRow key={f.path} path={f.path} size={f.size} type={f.type} />
                        ))}
                      </div>
                    </ScrollArea>
                  </SectionCard>

                  <SectionCard className="p-5 space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Step 2 — Push to GitHub</p>
                    </div>

                    {ghSession && (
                      <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                        <div className="flex items-center gap-3">
                          <img src={ghSession.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                          <span className="text-xs font-medium text-foreground">@{ghSession.login}</span>
                        </div>
                        <span className="text-xs text-emerald-600 dark:text-emerald-400">Connected</span>
                      </div>
                    )}

                    <Form {...form2}>
                      <form onSubmit={form2.handleSubmit(onPushSubmit)} className="space-y-3">
                        {!ghSession && (
                          <FormField control={form2.control} name="githubToken" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium">GitHub Token</FormLabel>
                              <FormControl><Input type="password" placeholder="ghp_…" className="text-sm font-mono" {...field} /></FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )} />
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <FormField control={form2.control} name="githubOwner" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium">Owner</FormLabel>
                              <FormControl><Input placeholder="your-username" className="text-sm" {...field} /></FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )} />
                          <FormField control={form2.control} name="githubRepo" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium">Repository</FormLabel>
                              <FormControl><Input placeholder="my-app" className="text-sm" {...field} /></FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <FormField control={form2.control} name="branch" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium">Branch</FormLabel>
                              <FormControl><Input placeholder="main" className="text-sm" {...field} /></FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )} />
                          <FormField control={form2.control} name="commitMessage" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium">Commit message</FormLabel>
                              <FormControl><Input className="text-sm" {...field} /></FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )} />
                        </div>
                        <div className="flex gap-3 pt-1">
                          <Button variant="outline" type="button" className="gap-2" onClick={() => setMetaStep(1)}>
                            <ArrowLeft className="h-4 w-4" /> Back
                          </Button>
                          <Button type="submit" className="flex-1 gap-2" disabled={pushMutation.isPending}>
                            {pushMutation.isPending
                              ? <><Loader2 className="h-4 w-4 animate-spin" /> Pushing…</>
                              : <><Github className="h-4 w-4" /> Push to GitHub</>}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </SectionCard>
                </>
              )}

              {metaStep === 3 && pushResult && (
                <SectionCard className="p-6">
                  <div className="text-center space-y-3 py-2">
                    <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border-2 border-emerald-300 dark:border-emerald-700 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground">{pushResult.count} files pushed</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">Schema and config are live on GitHub.</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 justify-center">
                      <a
                        href={pushResult.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                      >
                        <Github className="h-4 w-4" /> View commit on GitHub
                      </a>
                      <Button variant="outline" onClick={() => { setMetaStep(1); setPushResult(null); setPreviewData(null); form1.reset(); }}>
                        Push another
                      </Button>
                    </div>
                  </div>
                </SectionCard>
              )}
            </div>
          )}
        </div>

        {/* Push history */}
        <div className="max-w-2xl mx-auto">
          <PushHistorySection history={history} onClear={clearHistory} />
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <FAQSection />
        </div>
      </main>

      <PageFooter />

      {/* Save app dialog */}
      {showSaveDialog && (
        <SaveAppDialog
          onSave={nickname => {
            const vals = ejectForm1.getValues();
            saveApp({ nickname, appId: vals.base44AppId, apiKey: vals.base44ApiKey });
            setShowSaveDialog(false);
            toast({ description: `"${nickname}" saved — you can load it quickly next time.` });
          }}
          onCancel={() => setShowSaveDialog(false)}
        />
      )}
    </div>
  );
}
