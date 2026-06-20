import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import {
  usePreviewBase44Files,
  usePushToGithub,
} from "@workspace/api-client-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileCode2,
  Loader2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Github,
  AlertCircle,
  ChevronRight,
  File,
  FolderOpen,
  Key,
  GitBranch,
  Terminal,
  Puzzle,
  Copy,
  ChevronDown,
  ChevronUp,
  Zap,
  Database,
} from "lucide-react";
import type { PreviewResult } from "@workspace/api-client-react/src/generated/api.schemas";

/* ── Zod schemas ── */

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

/* ── SSE streaming hook ── */

type StreamState =
  | { status: "idle" }
  | { status: "running"; logs: string[] }
  | { status: "done"; logs: string[]; commitUrl: string; filesCount: number }
  | { status: "error"; logs: string[]; message: string };

function useEjectStream() {
  const [state, setState] = useState<StreamState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const run = async (payload: z.infer<typeof ejectStep1Schema> & z.infer<typeof ejectStep2Schema>) => {
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

  const reset = () => {
    abortRef.current?.abort();
    setState({ status: "idle" });
  };

  return { state, run, reset };
}

/* ── Small shared components ── */

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

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card border border-border rounded-xl shadow-sm ${className}`}>
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
        {copied
          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
    </div>
  );
}

function Collapsible({
  icon, badge, title, desc, children, defaultOpen = false,
}: { icon: React.ReactNode; badge: string; title: string; desc: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <button className="w-full flex items-start gap-3.5 p-4 text-left hover:bg-muted/30 transition-colors" onClick={() => setOpen(v => !v)}>
        <div className="w-9 h-9 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-center shrink-0 mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{badge}</span>
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

/* ── Live terminal panel ── */

function LiveTerminal({ logs, running }: { logs: string[]; running: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Terminal title bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-700">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/70" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
          <div className="w-3 h-3 rounded-full bg-green-500/70" />
        </div>
        <div className="flex-1 flex items-center justify-center gap-2">
          <Terminal className="h-3 w-3 text-zinc-400" />
          <span className="text-xs text-zinc-400 font-mono">base44 eject</span>
        </div>
        {running && <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />}
      </div>

      {/* Log output */}
      <div className="bg-zinc-950 h-56 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
        {logs.length === 0 ? (
          <span className="text-zinc-600">Waiting for output…</span>
        ) : (
          logs.map((line, i) => (
            <div key={i} className={
              line.startsWith("✓") ? "text-emerald-400" :
              line.startsWith("▶") ? "text-sky-400" :
              line.startsWith("✗") || line.toLowerCase().includes("error") ? "text-red-400" :
              line.toLowerCase().includes("verification") || line.toLowerCase().includes("device") ? "text-amber-300" :
              "text-zinc-300"
            }>
              {line || <>&nbsp;</>}
            </div>
          ))
        )}
        {running && (
          <div className="text-zinc-500 animate-pulse">█</div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/* ── Tabs ── */

type Tab = "eject" | "manual" | "metadata";

export default function Home() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("eject");

  /* ── Eject state — two forms + SSE stream ── */
  const [ejectStep, setEjectStep] = useState<1 | 2>(1);
  const [ejectStep1Data, setEjectStep1Data] = useState<z.infer<typeof ejectStep1Schema> | null>(null);
  const { state: streamState, run: runStream, reset: resetStream } = useEjectStream();

  const ejectForm1 = useForm<z.infer<typeof ejectStep1Schema>>({
    resolver: zodResolver(ejectStep1Schema),
    defaultValues: { base44AppId: "", base44ApiKey: "" },
  });

  const ejectForm2 = useForm<z.infer<typeof ejectStep2Schema>>({
    resolver: zodResolver(ejectStep2Schema),
    defaultValues: { githubToken: "", githubOwner: "", githubRepo: "", branch: "main", commitMessage: "feat: eject from Base44" },
  });

  const onEjectStep1Submit = (values: z.infer<typeof ejectStep1Schema>) => {
    setEjectStep1Data(values);
    setEjectStep(2);
  };

  const onEjectStep2Submit = (values: z.infer<typeof ejectStep2Schema>) => {
    if (!ejectStep1Data) return;
    runStream({ ...ejectStep1Data, ...values });
  };

  const resetEject = () => {
    resetStream();
    setEjectStep(1);
    setEjectStep1Data(null);
    ejectForm1.reset();
    ejectForm2.reset();
  };

  const isRunning = streamState.status === "running";
  const isDone = streamState.status === "done";
  const isError = streamState.status === "error";
  const showTerminal = streamState.status === "running" || streamState.status === "done" || streamState.status === "error";
  const logs = showTerminal ? streamState.logs : [];

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <GitBranch className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm text-foreground">Base44 → GitHub</span>
          </div>
          <a href="https://app.base44.com" target="_blank" rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            Open Base44 <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Push Base44 to GitHub</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Export your full Base44 source code — JSX pages, components, styles — directly to a GitHub repo.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {TABS.map(({ id, icon, label }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-medium transition-all ${
                tab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}>
              {icon}{label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════
            TAB: EJECT FULL CODE
        ══════════════════════════════════════════ */}
        {tab === "eject" && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">

            <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl p-4">
              <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground">How this works</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Calls the Base44 API directly with your API key to download all source files — JSX pages, components, entities, config — then pushes them to GitHub in a single commit.
                  <strong className="text-foreground"> No CLI, no login required.</strong> Takes ~5–15 seconds.
                </p>
              </div>
            </div>

            {/* ── Success screen ── */}
            {isDone && streamState.status === "done" && (
              <Card>
                <div className="p-8 flex flex-col items-center text-center gap-5">
                  <div className="w-16 h-16 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-xl font-bold text-foreground">Eject successful!</h2>
                    <p className="text-muted-foreground text-sm">
                      {streamState.filesCount} file{streamState.filesCount !== 1 ? "s" : ""} pushed to GitHub.
                    </p>
                  </div>
                  <a href={streamState.commitUrl} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2.5 px-5 py-2.5 bg-foreground text-background rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                    <Github className="h-4 w-4" />
                    View commit on GitHub
                    <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                  </a>
                  <div className="w-full">
                    <LiveTerminal logs={logs} running={false} />
                  </div>
                  <button onClick={resetEject} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Eject another app
                  </button>
                </div>
              </Card>
            )}

            {/* ── Error screen ── */}
            {isError && streamState.status === "error" && (
              <Card>
                <div className="p-6 space-y-4">
                  <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                    <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Eject failed</p>
                      <p className="text-xs text-red-700 mt-0.5 leading-relaxed">{streamState.message}</p>
                    </div>
                  </div>
                  {logs.length > 0 && <LiveTerminal logs={logs} running={false} />}
                  <div className="flex gap-3 pt-1">
                    <Button variant="outline" onClick={() => { resetStream(); }}>
                      Try again
                    </Button>
                    <Button variant="outline" onClick={resetEject}>
                      Start over
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* ── Running screen ── */}
            {isRunning && (
              <Card>
                <div className="p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Fetching &amp; pushing your app…</p>
                      <p className="text-xs text-muted-foreground">Downloading source from Base44 and committing to GitHub. Usually takes 5–15 seconds.</p>
                    </div>
                  </div>
                  <LiveTerminal logs={logs} running={true} />
                </div>
              </Card>
            )}

            {/* ── Forms (hidden while running/done/error) ── */}
            {!isRunning && !isDone && !isError && (
              <>
                <StepBadge current={ejectStep} />

                {/* Step 1: Base44 credentials */}
                {ejectStep === 1 && (
                  <Card>
                    <div className="p-5 border-b border-border">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                          <Key className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <h2 className="text-sm font-semibold text-foreground">Base44 credentials</h2>
                          <p className="text-xs text-muted-foreground mt-0.5">Your app ID and API key from the Base44 dashboard.</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-5">
                      <Form {...ejectForm1}>
                        <form id="eject-step1-form" onSubmit={ejectForm1.handleSubmit(onEjectStep1Submit)} className="space-y-4">
                          <FormField control={ejectForm1.control} name="base44AppId" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium">App ID</FormLabel>
                              <FormControl>
                                <Input placeholder="69dff787f3edfb6f77adcfb0" className="font-mono text-sm" {...field} />
                              </FormControl>
                              <FormMessage className="text-xs" />
                              <FieldHint>
                                Find it in <HelpLink href="https://app.base44.com/settings">Base44 → Settings → App ID</HelpLink> or in the URL of your app editor.
                              </FieldHint>
                            </FormItem>
                          )} />

                          <FormField control={ejectForm1.control} name="base44ApiKey" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium">API Key</FormLabel>
                              <FormControl>
                                <Input type="password" placeholder="••••••••••••••••••••" className="font-mono text-sm" {...field} />
                              </FormControl>
                              <FormMessage className="text-xs" />
                              <FieldHint>
                                <HelpLink href="https://app.base44.com/settings">Base44 → Settings → API Keys</HelpLink>
                              </FieldHint>
                            </FormItem>
                          )} />
                        </form>
                      </Form>
                    </div>

                    <div className="px-5 pb-5">
                      <Button form="eject-step1-form" type="submit" className="w-full gap-2">
                        Continue <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                )}

                {/* Step 2: GitHub */}
                {ejectStep === 2 && (
                  <Card>
                    <div className="p-5 border-b border-border">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                          <Github className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <h2 className="text-sm font-semibold text-foreground">GitHub destination</h2>
                          <p className="text-xs text-muted-foreground mt-0.5">Where to push the ejected source code.</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-5">
                      <Form {...ejectForm2}>
                        <form id="eject-step2-form" onSubmit={ejectForm2.handleSubmit(onEjectStep2Submit)} className="space-y-4">
                          <FormField control={ejectForm2.control} name="githubToken" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium">Personal Access Token</FormLabel>
                              <FormControl>
                                <Input type="password" placeholder="ghp_••••••••••••••" className="font-mono text-sm" {...field} />
                              </FormControl>
                              <FormMessage className="text-xs" />
                              <FieldHint>
                                Needs <code className="bg-muted px-1 rounded">repo</code> scope. Create one at{" "}
                                <HelpLink href="https://github.com/settings/tokens/new?scopes=repo">GitHub → Settings → Tokens</HelpLink>
                              </FieldHint>
                            </FormItem>
                          )} />

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
                        </form>
                      </Form>
                    </div>

                    <div className="px-5 pb-5 flex gap-3">
                      <Button variant="outline" className="gap-2" onClick={() => setEjectStep(1)}>
                        <ArrowLeft className="h-4 w-4" /> Back
                      </Button>
                      <Button form="eject-step2-form" type="submit" className="flex-1 gap-2">
                        <Zap className="h-4 w-4" /> Eject & push to GitHub
                      </Button>
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════
            TAB: MANUAL METHODS
        ══════════════════════════════════════════ */}
        {tab === "manual" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-start gap-3 bg-muted/50 border border-border rounded-xl p-4">
              <Puzzle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                These methods let you export or view code without running the CLI. Useful if the automated eject doesn't work for your app.
              </p>
            </div>

            <Collapsible
              icon={<FileCode2 className="h-4 w-4 text-emerald-600" />}
              badge="Chrome extension"
              title="Base44 Exporter"
              desc="One-click export of all source files from Base44's editor using a browser extension."
              defaultOpen
            >
              <p className="text-xs text-muted-foreground leading-relaxed">
                Install the <strong>Base44 Exporter</strong> extension (if available), open your Base44 project in the editor, and click the extension icon to download all source files as a ZIP.
              </p>
              <CodeBlock code="# Once you have the ZIP, push to GitHub:\nunzip base44-export.zip -d my-app\ncd my-app\ngit init && git add . && git commit -m 'feat: import from Base44'\ngit remote add origin https://github.com/you/my-app.git\ngit push -u origin main" />
            </Collapsible>

            <Collapsible
              icon={<Terminal className="h-4 w-4 text-emerald-600" />}
              badge="CLI — local machine"
              title="Run base44 eject locally"
              desc="Run the CLI on your own machine where you're already logged in to Base44."
            >
              <p className="text-xs text-muted-foreground leading-relaxed">
                If you've used the Base44 CLI before, you may already be authenticated. Run:
              </p>
              <CodeBlock code="npx base44 eject --app-id YOUR_APP_ID --path ./my-app --yes" />
              <p className="text-xs text-muted-foreground">Then push to GitHub normally with <code className="bg-muted px-1 rounded">git push</code>.</p>
            </Collapsible>

            <Collapsible
              icon={<FolderOpen className="h-4 w-4 text-emerald-600" />}
              badge="Copy–paste"
              title="Manual copy from editor"
              desc="Open each file in Base44's code editor and copy the source manually."
            >
              <p className="text-xs text-muted-foreground leading-relaxed">
                In your Base44 app, go to <strong>Settings → Developer → Source files</strong> (or click "View code" in the editor). Copy each file and paste into your local project.
              </p>
            </Collapsible>
          </div>
        )}

        {/* ══════════════════════════════════════════
            TAB: SCHEMA & CONFIG
        ══════════════════════════════════════════ */}
        {tab === "metadata" && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl p-4">
              <Database className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground">Push schema & config to GitHub</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Fetches your Base44 entity schemas, settings, and metadata via the API and commits them to GitHub as JSON. Useful for version-controlling your data model.
                </p>
              </div>
            </div>

            {/* Step 3: Done */}
            {metaStep === 3 && pushResult && (
              <Card>
                <div className="p-8 flex flex-col items-center text-center gap-5">
                  <div className="w-16 h-16 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-xl font-bold text-foreground">Pushed successfully!</h2>
                    <p className="text-muted-foreground text-sm">{pushResult.count} file{pushResult.count !== 1 ? "s" : ""} committed to GitHub.</p>
                  </div>
                  <a href={pushResult.url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2.5 px-5 py-2.5 bg-foreground text-background rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                    <Github className="h-4 w-4" />
                    View commit on GitHub
                    <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                  </a>
                  <button onClick={() => { setMetaStep(1); setPushResult(null); form1.reset(); form2.reset(); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Push again
                  </button>
                </div>
              </Card>
            )}

            {metaStep < 3 && (
              <>
                {/* Step 1 */}
                {metaStep === 1 && (
                  <Card>
                    <div className="p-5 border-b border-border">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                          <Key className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <h2 className="text-sm font-semibold text-foreground">Connect to Base44</h2>
                          <p className="text-xs text-muted-foreground mt-0.5">Fetch schema and metadata from your app.</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-5">
                      <Form {...form1}>
                        <form onSubmit={form1.handleSubmit(onPreviewSubmit)} className="space-y-4">
                          <FormField control={form1.control} name="base44AppId" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium">App ID</FormLabel>
                              <FormControl><Input placeholder="69dff787f3edfb6f77adcfb0" className="font-mono text-sm" {...field} /></FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )} />
                          <FormField control={form1.control} name="base44ApiKey" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium">API Key</FormLabel>
                              <FormControl><Input type="password" placeholder="••••••••••••••••••••" className="font-mono text-sm" {...field} /></FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )} />
                          <FormField control={form1.control} name="base44AppUrl" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium">App URL <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                              <FormControl><Input placeholder="https://yourapp.base44.app" className="text-sm" {...field} /></FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )} />
                          <Button type="submit" className="w-full gap-2" disabled={previewMutation.isPending}>
                            {previewMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Fetching…</> : <>Fetch files <ArrowRight className="h-4 w-4" /></>}
                          </Button>
                        </form>
                      </Form>
                    </div>
                  </Card>
                )}

                {/* Step 2 */}
                {metaStep === 2 && previewData && (
                  <>
                    <Card>
                      <div className="p-5 border-b border-border">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-center shrink-0">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          </div>
                          <div>
                            <h2 className="text-sm font-semibold text-foreground">Files ready</h2>
                            <p className="text-xs text-muted-foreground">{previewData.files.length} file{previewData.files.length !== 1 ? "s" : ""} fetched from Base44</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-3 max-h-52 overflow-y-auto space-y-0.5">
                        {previewData.files.map((f) => (
                          <FileRow key={f.path} path={f.path} size={f.size} type={f.type} />
                        ))}
                      </div>
                    </Card>

                    <Card>
                      <div className="p-5 border-b border-border">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                            <Github className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <h2 className="text-sm font-semibold text-foreground">Push to GitHub</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">Choose a repository to commit these files.</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-5">
                        <Form {...form2}>
                          <form onSubmit={form2.handleSubmit(onPushSubmit)} className="space-y-4">
                            <FormField control={form2.control} name="githubToken" render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-medium">Personal Access Token</FormLabel>
                                <FormControl><Input type="password" placeholder="ghp_••••••••••••••" className="font-mono text-sm" {...field} /></FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )} />
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
                      </div>
                    </Card>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
