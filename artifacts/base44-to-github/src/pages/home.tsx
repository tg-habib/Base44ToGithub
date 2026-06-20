import { useState } from "react";
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
  useEjectAndPush,
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

const ejectSchema = z.object({
  base44AppId: z.string().min(1, "App ID is required"),
  base44ApiKey: z.string().min(1, "API Key is required"),
  githubToken: z.string().min(1, "Personal Access Token is required"),
  githubOwner: z.string().min(1, "Owner or org name is required"),
  githubRepo: z.string().min(1, "Repository name is required"),
  branch: z.string().min(1).default("main"),
  commitMessage: z.string().min(1).default("feat: eject from Base44"),
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

/* ── Tabs ── */

type Tab = "eject" | "manual" | "metadata";

export default function Home() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("eject");

  /* ── Eject state ── */
  const [ejectStep, setEjectStep] = useState<1 | 2>(1);
  const [ejectCreds, setEjectCreds] = useState<z.infer<typeof ejectSchema> | null>(null);
  const [ejectResult, setEjectResult] = useState<{ url: string; count: number; logs?: string } | null>(null);

  const ejectForm = useForm<z.infer<typeof ejectSchema>>({
    resolver: zodResolver(ejectSchema),
    defaultValues: { base44AppId: "", base44ApiKey: "", githubToken: "", githubOwner: "", githubRepo: "", branch: "main", commitMessage: "feat: eject from Base44" },
  });

  const ejectMutation = useEjectAndPush();

  const onEjectStep1 = (values: z.infer<typeof ejectSchema>) => {
    setEjectCreds(values);
    setEjectStep(2);
  };

  const onEjectSubmit = () => {
    if (!ejectCreds) return;
    ejectMutation.mutate(
      { data: ejectCreds },
      {
        onSuccess: (data) => {
          if (data.success) {
            setEjectResult({ url: data.commitUrl, count: data.filesCount, logs: data.logs ?? undefined });
          } else {
            toast({ title: "Eject failed", description: data.message, variant: "destructive" });
          }
        },
        onError: (err: unknown) => {
          const msg = (err as { error?: string })?.error ?? "Something went wrong.";
          toast({ title: "Eject failed", description: msg, variant: "destructive" });
        },
      }
    );
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

        {/* ═══════════════════════════════════════════════
            TAB: EJECT FULL CODE (via base44 CLI on server)
        ═══════════════════════════════════════════════ */}
        {tab === "eject" && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">

            <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl p-4">
              <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground">How this works</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  This tab runs <code className="bg-muted px-1 rounded">npx base44 eject</code> on the server using your API key, collects all your React/JSX source files, and pushes them to GitHub in one commit.
                  Takes ~30–90 seconds. <strong className="text-foreground">Free — no paid Base44 plan required.</strong>
                </p>
              </div>
            </div>

            {/* Success screen */}
            {ejectResult ? (
              <Card>
                <div className="p-10 flex flex-col items-center text-center gap-5">
                  <div className="w-16 h-16 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-xl font-bold text-foreground">Eject successful!</h2>
                    <p className="text-muted-foreground text-sm">
                      {ejectResult.count} file{ejectResult.count !== 1 ? "s" : ""} pushed to GitHub.
                    </p>
                  </div>
                  <a href={ejectResult.url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2.5 px-5 py-2.5 bg-foreground text-background rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                    <Github className="h-4 w-4" />
                    View commit on GitHub
                    <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                  </a>
                  {ejectResult.logs && (
                    <details className="w-full text-left">
                      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">View CLI logs</summary>
                      <pre className="mt-2 text-xs bg-muted rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap text-muted-foreground">{ejectResult.logs}</pre>
                    </details>
                  )}
                  <button
                    onClick={() => { setEjectResult(null); setEjectStep(1); ejectForm.reset(); ejectMutation.reset(); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                  >Eject another app</button>
                </div>
              </Card>
            ) : (
              <>
                <StepBadge current={ejectStep} />

                {/* Step 1: All credentials in one form */}
                {ejectStep === 1 && (
                  <Card>
                    <div className="p-5 border-b border-border">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                          <Key className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <h2 className="font-semibold text-foreground">Base44 credentials</h2>
                          <p className="text-sm text-muted-foreground mt-0.5">Found under <strong>API → Documentation</strong> in your Base44 dashboard.</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-5">
                      <Form {...ejectForm}>
                        <form id="eject-form-1" onSubmit={ejectForm.handleSubmit(onEjectStep1)} className="space-y-5">
                          <FormField control={ejectForm.control} name="base44AppId" render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center justify-between">
                                <FormLabel>App ID</FormLabel>
                                <HelpLink href="https://app.base44.com">Find in dashboard</HelpLink>
                              </div>
                              <FormControl>
                                <Input placeholder="5cd25d4561300955d4b9509e7" className="font-mono text-sm" {...field} />
                              </FormControl>
                              <FieldHint>The alphanumeric ID shown in the SDK snippet (also visible in your editor URL).</FieldHint>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={ejectForm.control} name="base44ApiKey" render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center justify-between">
                                <FormLabel>API Key</FormLabel>
                                <HelpLink href="https://app.base44.com">Find under API → Docs</HelpLink>
                              </div>
                              <FormControl>
                                <Input type="password" placeholder="Your Base44 API key" className="font-mono text-sm" {...field} />
                              </FormControl>
                              <FieldHint>Used as <code className="bg-muted px-1 rounded text-xs">BASE44_API_KEY</code> to authenticate the CLI non-interactively.</FieldHint>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </form>
                      </Form>
                    </div>
                    <div className="p-4 border-t border-border bg-muted/30 rounded-b-xl flex items-center justify-between gap-3">
                      <div className="flex items-start gap-2 text-xs text-muted-foreground">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>Credentials are never stored — only used for this request.</span>
                      </div>
                      <Button type="submit" form="eject-form-1" className="shrink-0">
                        Next <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                )}

                {/* Step 2: GitHub destination + run */}
                {ejectStep === 2 && (
                  <Card>
                    <div className="p-5 border-b border-border">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                          <Github className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <h2 className="font-semibold text-foreground">GitHub destination</h2>
                          <p className="text-sm text-muted-foreground mt-0.5">The repository must already exist on GitHub.</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-5 space-y-5">
                      <Form {...ejectForm}>
                        <form id="eject-form-2" className="space-y-5">
                          <FormField control={ejectForm.control} name="githubToken" render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center justify-between">
                                <FormLabel>Personal Access Token</FormLabel>
                                <HelpLink href="https://github.com/settings/tokens/new?scopes=repo&description=Base44+Eject">Create on GitHub</HelpLink>
                              </div>
                              <FormControl>
                                <Input type="password" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" className="font-mono text-sm" {...field} />
                              </FormControl>
                              <FieldHint>Needs <code className="bg-muted px-1 rounded text-xs">repo</code> scope (classic) or <code className="bg-muted px-1 rounded text-xs">Contents: Read and write</code> (fine-grained).</FieldHint>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <div className="grid grid-cols-2 gap-4">
                            <FormField control={ejectForm.control} name="githubOwner" render={({ field }) => (
                              <FormItem>
                                <FormLabel>Owner</FormLabel>
                                <FormControl><Input placeholder="your-username" {...field} /></FormControl>
                                <FieldHint>GitHub username or org.</FieldHint>
                                <FormMessage />
                              </FormItem>
                            )} />
                            <FormField control={ejectForm.control} name="githubRepo" render={({ field }) => (
                              <FormItem>
                                <FormLabel>Repository</FormLabel>
                                <FormControl><Input placeholder="my-base44-app" {...field} /></FormControl>
                                <FieldHint>Must already exist.</FieldHint>
                                <FormMessage />
                              </FormItem>
                            )} />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <FormField control={ejectForm.control} name="branch" render={({ field }) => (
                              <FormItem>
                                <FormLabel>Branch</FormLabel>
                                <FormControl><Input placeholder="main" {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                            <FormField control={ejectForm.control} name="commitMessage" render={({ field }) => (
                              <FormItem>
                                <FormLabel>Commit message</FormLabel>
                                <FormControl><Input placeholder="feat: eject from Base44" {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                          </div>
                        </form>
                      </Form>

                      {ejectMutation.isPending && (
                        <div className="flex flex-col items-center gap-3 py-4 text-center">
                          <Loader2 className="h-7 w-7 animate-spin text-primary" />
                          <div>
                            <p className="text-sm font-medium text-foreground">Ejecting your app…</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Running <code className="bg-muted px-1 rounded">npx base44 eject</code> on the server. This takes 30–90 seconds.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-4 border-t border-border bg-muted/30 rounded-b-xl flex items-center justify-between gap-3">
                      <Button variant="outline" onClick={() => setEjectStep(1)} disabled={ejectMutation.isPending}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back
                      </Button>
                      <Button
                        onClick={() => {
                          ejectForm.handleSubmit(() => onEjectSubmit())();
                        }}
                        disabled={ejectMutation.isPending}
                      >
                        {ejectMutation.isPending
                          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Ejecting…</>
                          : <><Terminal className="mr-2 h-4 w-4" />Eject &amp; Push</>}
                      </Button>
                    </div>
                  </Card>
                )}
              </>
            )}

            {/* Info box */}
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                <strong>About the backend:</strong> The exported code includes your full React/JSX frontend.
                The backend logic runs via <code className="bg-amber-100 px-1 rounded">base44-sdk</code> which still calls Base44's servers —
                a Base44 account is needed to run your app's data and auth.
              </p>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            TAB: MANUAL METHODS (Chrome ext + manual copy)
        ═══════════════════════════════════════════════ */}
        {tab === "manual" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-sm text-emerald-800 leading-relaxed">
                These methods export your <strong>full React/JSX source code</strong> without touching our server — everything runs in your browser or terminal.
              </p>
            </div>

            <Collapsible
              icon={<Puzzle className="h-5 w-5 text-emerald-600" />}
              badge="Recommended — No server needed"
              title="Chrome Extension: Base44 Downloader"
              desc="One-click ZIP export directly from the Base44 editor. Works on the free plan."
              defaultOpen={true}
            >
              <div className="space-y-3">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Step 1 — Install the extension</p>
                <div className="space-y-1.5">
                  <a href="https://chromewebstore.google.com/detail/base44-downloader/ngbhbpaflbegfjgaibhldjlmmfonpief"
                    target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline font-medium">
                    Base44 Downloader — Chrome Web Store <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <p className="text-xs text-muted-foreground">
                    Alternative: <a href="https://chromewebstore.google.com/detail/vibeapp-exporter-base44-d/ccmjgcjhglnfahjppjinaegigjoabjjb"
                      target="_blank" rel="noreferrer" className="text-primary hover:underline">VibeApp Exporter</a> — exports Base44, Lovable, and Bolt.
                  </p>
                </div>
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Step 2 — Export from Base44</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside leading-relaxed">
                  <li>Open your app in <strong className="text-foreground">app.base44.com</strong></li>
                  <li>Click the <strong className="text-foreground">Code tab</strong> (<code className="bg-muted px-1 rounded">{`> _`}</code>)</li>
                  <li>Click the extension icon in your Chrome toolbar → <strong className="text-foreground">Export as ZIP</strong></li>
                </ol>
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Step 3 — Push to GitHub</p>
                <CodeBlock code={`unzip your-base44-project.zip -d my-project
cd my-project
git init
git add .
git commit -m "feat: export from Base44"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main`} />
              </div>
            </Collapsible>

            <Collapsible
              icon={<Copy className="h-5 w-5 text-emerald-600" />}
              badge="Always Free — Manual"
              title="Copy-paste from Code Tab"
              desc="No tools needed. Open each file in the Base44 editor and copy it locally."
            >
              <div className="space-y-3">
                <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside leading-relaxed">
                  <li>Open your app → click the <strong className="text-foreground">Code tab</strong></li>
                  <li>Click <strong className="text-foreground">"See all files"</strong> to view the full tree</li>
                  <li>Open each file, select all, copy, paste it locally at the same path</li>
                  <li>Repeat for every file</li>
                </ol>
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">Tedious for large projects. Use the Chrome extension or the Eject tab instead.</p>
                </div>
                <CodeBlock code={`git init
git add .
git commit -m "feat: export from Base44"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main`} />
              </div>
            </Collapsible>
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            TAB: SCHEMA & CONFIG (metadata push)
        ═══════════════════════════════════════════════ */}
        {tab === "metadata" && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl p-4">
              <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-800 leading-relaxed">
                This pushes your app's <strong>entity schemas, TypeScript types, OpenAPI spec, and SDK config</strong>.
                For full JSX source code use <button onClick={() => setTab("eject")} className="underline font-semibold cursor-pointer">Eject Full Code</button>.
              </p>
            </div>

            {metaStep === 1 && (
              <Card>
                <div className="p-5 border-b border-border">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                      <Key className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-foreground">Connect your Base44 app</h2>
                      <p className="text-sm text-muted-foreground mt-0.5">Credentials are in your Base44 dashboard under API → Documentation.</p>
                    </div>
                  </div>
                </div>
                <div className="p-5">
                  <Form {...form1}>
                    <form id="form-1" onSubmit={form1.handleSubmit(onPreviewSubmit)} className="space-y-5">
                      <FormField control={form1.control} name="base44AppId" render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>App ID</FormLabel>
                            <HelpLink href="https://app.base44.com">Find in dashboard</HelpLink>
                          </div>
                          <FormControl><Input placeholder="5cd25d4561300955d4b9509e7" className="font-mono text-sm" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form1.control} name="base44ApiKey" render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>API Key</FormLabel>
                            <HelpLink href="https://app.base44.com">Find under API → Docs</HelpLink>
                          </div>
                          <FormControl><Input type="password" placeholder="Your Base44 API key" className="font-mono text-sm" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form1.control} name="base44AppUrl" render={({ field }) => (
                        <FormItem>
                          <FormLabel>App URL <span className="text-xs font-normal text-muted-foreground">(optional)</span></FormLabel>
                          <FormControl><Input placeholder="https://my-app.base44.app" className="font-mono text-sm" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </form>
                  </Form>
                </div>
                <div className="p-4 border-t border-border bg-muted/30 rounded-b-xl flex justify-end">
                  <Button type="submit" form="form-1" disabled={previewMutation.isPending}>
                    {previewMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Connecting…</> : <>Preview files <ArrowRight className="ml-2 h-4 w-4" /></>}
                  </Button>
                </div>
              </Card>
            )}

            {metaStep === 2 && (
              <div className="space-y-5">
                <Card>
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">{previewData?.appName ?? "App files"}</span>
                    </div>
                    <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">{previewData?.files.length ?? 0} files</span>
                  </div>
                  <ScrollArea className="h-52">
                    <div className="p-2">
                      {previewData?.files.length === 0
                        ? <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2"><File className="h-8 w-8 opacity-30" /><p className="text-sm">No files found.</p></div>
                        : previewData?.files.map((file, idx) => <FileRow key={idx} path={file.path} size={file.size ?? 0} type={file.type ?? "file"} />)}
                    </div>
                  </ScrollArea>
                </Card>

                <Card>
                  <div className="p-5 border-b border-border">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                        <Github className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h2 className="font-semibold text-foreground">GitHub destination</h2>
                        <p className="text-sm text-muted-foreground mt-0.5">Repository must already exist.</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-5">
                    <Form {...form2}>
                      <form id="form-2" onSubmit={form2.handleSubmit(onPushSubmit)} className="space-y-5">
                        <FormField control={form2.control} name="githubToken" render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Personal Access Token</FormLabel>
                              <HelpLink href="https://github.com/settings/tokens/new?scopes=repo">Create on GitHub</HelpLink>
                            </div>
                            <FormControl><Input type="password" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" className="font-mono text-sm" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <div className="grid grid-cols-2 gap-4">
                          <FormField control={form2.control} name="githubOwner" render={({ field }) => (
                            <FormItem><FormLabel>Owner</FormLabel><FormControl><Input placeholder="username" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form2.control} name="githubRepo" render={({ field }) => (
                            <FormItem><FormLabel>Repository</FormLabel><FormControl><Input placeholder="my-base44-app" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <FormField control={form2.control} name="branch" render={({ field }) => (
                            <FormItem><FormLabel>Branch</FormLabel><FormControl><Input placeholder="main" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form2.control} name="commitMessage" render={({ field }) => (
                            <FormItem><FormLabel>Commit message</FormLabel><FormControl><Input placeholder="chore: sync from Base44" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                        </div>
                      </form>
                    </Form>
                  </div>
                  <div className="p-4 border-t border-border bg-muted/30 rounded-b-xl flex items-center justify-between gap-3">
                    <Button variant="outline" onClick={() => setMetaStep(1)}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
                    <Button type="submit" form="form-2" disabled={pushMutation.isPending || (previewData?.files.length === 0)}>
                      {pushMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Pushing…</> : <>Push to GitHub <ArrowRight className="ml-2 h-4 w-4" /></>}
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {metaStep === 3 && pushResult && (
              <Card>
                <div className="p-10 flex flex-col items-center text-center gap-5">
                  <div className="w-16 h-16 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-xl font-bold text-foreground">Push successful</h2>
                    <p className="text-muted-foreground text-sm">{pushResult.count} file{pushResult.count !== 1 ? "s" : ""} committed to GitHub.</p>
                  </div>
                  <a href={pushResult.url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2.5 px-5 py-2.5 bg-foreground text-background rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                    <Github className="h-4 w-4" />View commit on GitHub<ExternalLink className="h-3.5 w-3.5 opacity-60" />
                  </a>
                  <button onClick={() => { setMetaStep(1); setPushResult(null); setPreviewData(null); form1.reset(); form2.reset(); previewMutation.reset(); pushMutation.reset(); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors">Push another app</button>
                </div>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
