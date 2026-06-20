import { useState } from "react";
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
  Download,
  Copy,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import type { PreviewResult } from "@workspace/api-client-react/src/generated/api.schemas";

const previewSchema = z.object({
  base44AppId: z.string().min(1, "App ID is required"),
  base44ApiKey: z.string().min(1, "API Key is required"),
  base44AppUrl: z.string().optional(),
});

const githubSchema = z.object({
  githubToken: z.string().min(1, "Personal Access Token is required"),
  githubOwner: z.string().min(1, "Owner or org name is required"),
  githubRepo: z.string().min(1, "Repository name is required"),
  branch: z.string().min(1, "Branch is required").default("main"),
  commitMessage: z.string().min(1, "Commit message is required").default("chore: sync from Base44"),
});

function HelpLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline text-xs font-medium"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Connect Base44" },
    { n: 2, label: "Push to GitHub" },
    { n: 3, label: "Done" },
  ];
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => {
        const done = step.n < current;
        const active = step.n === current;
        return (
          <div key={step.n} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all
                  ${active ? "bg-primary text-primary-foreground shadow-sm" :
                    done ? "bg-primary/15 text-primary" :
                    "bg-muted text-muted-foreground"}`}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : step.n}
              </div>
              <span className={`text-sm font-medium hidden sm:block transition-colors
                ${active ? "text-foreground" : done ? "text-primary" : "text-muted-foreground"}`}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground/40 mx-3" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{children}</p>
  );
}

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
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
    size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` :
    `${(size / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="flex items-center gap-2.5 py-2 px-3 rounded-lg hover:bg-muted/60 transition-colors group">
      <FileCode2 className="h-4 w-4 text-primary/70 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          {folder && (
            <span className="text-muted-foreground text-xs truncate">{folder}/</span>
          )}
          <span className="text-sm font-medium text-foreground truncate">{filename}</span>
        </div>
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
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative group">
      <pre className="bg-muted/70 border border-border rounded-lg px-4 py-3 text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap">
        {code}
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-background border border-border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
        title="Copy"
      >
        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
    </div>
  );
}

function FreeMethodCard({
  icon,
  badge,
  title,
  desc,
  children,
  defaultOpen = false,
}: {
  icon: React.ReactNode;
  badge: string;
  title: string;
  desc: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <button
        className="w-full flex items-start gap-3.5 p-4 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="w-9 h-9 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
          {icon}
        </div>
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

type Tab = "free" | "metadata";

export default function Home() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("free");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [pushResult, setPushResult] = useState<{ url: string; count: number } | null>(null);

  const form1 = useForm<z.infer<typeof previewSchema>>({
    resolver: zodResolver(previewSchema),
    defaultValues: { base44AppId: "", base44ApiKey: "", base44AppUrl: "" },
  });

  const form2 = useForm<z.infer<typeof githubSchema>>({
    resolver: zodResolver(githubSchema),
    defaultValues: {
      githubToken: "",
      githubOwner: "",
      githubRepo: "",
      branch: "main",
      commitMessage: "chore: sync from Base44",
    },
  });

  const previewMutation = usePreviewBase44Files();
  const pushMutation = usePushToGithub();

  const onPreviewSubmit = (values: z.infer<typeof previewSchema>) => {
    previewMutation.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          setPreviewData(data);
          setStep(2);
        },
        onError: (err: unknown) => {
          const msg = (err as { error?: string })?.error ?? "Could not connect to Base44. Check your credentials.";
          toast({ title: "Connection failed", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const onPushSubmit = (values: z.infer<typeof githubSchema>) => {
    const base44Values = form1.getValues();
    pushMutation.mutate(
      { data: { ...base44Values, ...values } },
      {
        onSuccess: (data) => {
          if (data.success) {
            setPushResult({ url: data.commitUrl, count: data.filesCount });
            setStep(3);
          } else {
            toast({ title: "Push failed", description: data.message, variant: "destructive" });
          }
        },
        onError: (err: unknown) => {
          const msg = (err as { error?: string })?.error ?? "Something went wrong while pushing to GitHub.";
          toast({ title: "Push failed", description: msg, variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <GitBranch className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm text-foreground">Base44 → GitHub</span>
          </div>
          <a
            href="https://app.base44.com"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            Open Base44 <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Push your Base44 app to GitHub
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Research-backed methods to get your code out of Base44 and into GitHub — including free tricks.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setTab("free")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
              tab === "free"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="h-4 w-4 text-emerald-500" />
            Free Methods
          </button>
          <button
            onClick={() => setTab("metadata")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
              tab === "metadata"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Github className="h-4 w-4" />
            Push Schema & Config
          </button>
        </div>

        {/* ── FREE METHODS TAB ── */}
        {tab === "free" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">

            <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-sm text-emerald-800 leading-relaxed">
                These methods export your <strong>full React/JSX source code</strong> — pages, components, everything — for free, no paid plan needed.
              </p>
            </div>

            {/* Method 1: Chrome Extension */}
            <FreeMethodCard
              icon={<Puzzle className="h-5 w-5 text-emerald-600" />}
              badge="Easiest — Recommended"
              title="Chrome Extension: Base44 Downloader"
              desc="One-click export of your full project as a ZIP directly from the Base44 editor. No login, no paid plan."
              defaultOpen={true}
            >
              <div className="space-y-3">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Step 1 — Install the extension</p>
                  <a
                    href="https://chromewebstore.google.com/detail/base44-downloader/ngbhbpaflbegfjgaibhldjlmmfonpief"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline font-medium"
                  >
                    <Download className="h-4 w-4" />
                    Base44 Downloader on Chrome Web Store
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <p className="text-xs text-muted-foreground">
                    Alternative: <a href="https://chromewebstore.google.com/detail/vibeapp-exporter-base44-d/ccmjgcjhglnfahjppjinaegigjoabjjb" target="_blank" rel="noreferrer" className="text-primary hover:underline">VibeApp Exporter</a> — also exports Base44, Lovable, Bolt apps.
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Step 2 — Export your code</p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside leading-relaxed">
                    <li>Open your app in <strong className="text-foreground">app.base44.com</strong></li>
                    <li>Click the <strong className="text-foreground">Code tab</strong> (the <code className="bg-muted px-1 rounded">{`> _`}</code> icon in the top navigation)</li>
                    <li>Click the extension icon in your Chrome toolbar</li>
                    <li>Click <strong className="text-foreground">Export as ZIP</strong> — your full project downloads immediately</li>
                  </ol>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Step 3 — Push the ZIP to GitHub</p>
                  <CodeBlock code={`# Unzip the downloaded file
unzip your-base44-project.zip -d my-project
cd my-project

# Initialize Git
git init
git add .
git commit -m "feat: export from Base44"

# Push to GitHub (create the repo on github.com first)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main`} />
                </div>
              </div>
            </FreeMethodCard>

            {/* Method 2: CLI eject */}
            <FreeMethodCard
              icon={<Terminal className="h-5 w-5 text-emerald-600" />}
              badge="Official CLI — Free"
              title="base44 eject (Official CLI)"
              desc="The official Base44 CLI has an eject command that exports your app to a local codebase you can push anywhere."
            >
              <div className="space-y-3">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Step 1 — Install the CLI</p>
                  <p className="text-xs text-muted-foreground">Requires Node.js 20.19.0 or higher.</p>
                  <CodeBlock code={`npm install -g @base44/cli`} />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Step 2 — Login & eject</p>
                  <CodeBlock code={`# Log in to your Base44 account
base44 login

# Eject your app to a local folder
# (run this in the folder where you want your project)
base44 eject`} />
                  <p className="text-xs text-muted-foreground">
                    The eject command will ask which app to eject and create a local React project folder.
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Step 3 — Push to GitHub</p>
                  <CodeBlock code={`cd your-ejected-app

git init
git add .
git commit -m "feat: ejected from Base44"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main`} />
                </div>

                <a
                  href="https://github.com/base44/cli"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                >
                  <Github className="h-3.5 w-3.5" />
                  View base44/cli on GitHub
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </FreeMethodCard>

            {/* Method 3: Manual */}
            <FreeMethodCard
              icon={<Copy className="h-5 w-5 text-emerald-600" />}
              badge="Always Free — Tedious"
              title="Manual Copy from Code Tab"
              desc="No tools needed. Open each file in the Base44 code editor and copy-paste into your local project."
            >
              <div className="space-y-3">
                <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside leading-relaxed">
                  <li>Open your app in Base44 → click the <strong className="text-foreground">Code tab</strong> (<code className="bg-muted px-1 rounded">{`> _`}</code>)</li>
                  <li>Click <strong className="text-foreground">"See all files"</strong> to view the full file tree</li>
                  <li>Open each file, select all (<kbd className="bg-muted px-1 rounded text-[10px]">Ctrl+A</kbd>), and copy it</li>
                  <li>Create the same file path locally and paste the content</li>
                  <li>Repeat for every file in the project</li>
                </ol>
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">Time-consuming for large projects. Use the Chrome extension instead.</p>
                </div>
                <CodeBlock code={`# After copying all files locally:
git init
git add .
git commit -m "feat: export from Base44"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main`} />
              </div>
            </FreeMethodCard>

            {/* Important note about backend */}
            <div className="flex items-start gap-3 bg-muted/50 border border-border rounded-xl p-4">
              <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-foreground">About the backend</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  All methods export your <strong className="text-foreground">frontend code</strong> (React/JSX pages, components, styles).
                  The backend database and auth logic runs via the <code className="bg-muted px-1 rounded">base44-sdk</code> which calls Base44's servers — this part is not exportable.
                  Your app will still need a Base44 account to run the backend.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── METADATA/SCHEMA PUSH TAB ── */}
        {tab === "metadata" && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">

            <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl p-4">
              <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-800 leading-relaxed">
                This tool pushes your app's <strong>entity schemas, types, OpenAPI spec, and SDK config</strong> to GitHub.
                For full JSX source code, use the <button onClick={() => setTab("free")} className="underline font-semibold cursor-pointer">Free Methods tab</button>.
              </p>
            </div>

            <StepIndicator current={step} />

            {step === 1 && (
              <SectionCard>
                <div className="p-5 border-b border-border">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                      <Key className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-foreground">Connect your Base44 app</h2>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        You'll find both credentials in your Base44 app dashboard under API → Documentation.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-5">
                  <Form {...form1}>
                    <form id="form-1" onSubmit={form1.handleSubmit(onPreviewSubmit)} className="space-y-5">
                      <FormField
                        control={form1.control}
                        name="base44AppId"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel className="text-sm font-medium">App ID</FormLabel>
                              <HelpLink href="https://app.base44.com">Find it in your dashboard</HelpLink>
                            </div>
                            <FormControl>
                              <Input placeholder="5cd25d4561300955d4b9509e7" className="font-mono text-sm" {...field} />
                            </FormControl>
                            <FieldHint>The alphanumeric ID from the SDK snippet under API → Documentation.</FieldHint>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form1.control}
                        name="base44ApiKey"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel className="text-sm font-medium">API Key</FormLabel>
                              <HelpLink href="https://app.base44.com">Find it under API → Documentation</HelpLink>
                            </div>
                            <FormControl>
                              <Input type="password" placeholder="Your Base44 API key" className="font-mono text-sm" {...field} />
                            </FormControl>
                            <FieldHint>Found in the same code snippet — it's the value of the <code className="bg-muted px-1 rounded text-xs">api_key</code> field.</FieldHint>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form1.control}
                        name="base44AppUrl"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel className="text-sm font-medium">
                                App URL
                                <span className="ml-2 text-xs font-normal text-muted-foreground">(optional)</span>
                              </FormLabel>
                              <HelpLink href="https://app.base44.com">Find it in your dashboard</HelpLink>
                            </div>
                            <FormControl>
                              <Input placeholder="https://my-app-name.base44.app" className="font-mono text-sm" {...field} />
                            </FormControl>
                            <FieldHint>Your live app URL — enables a more accurate OpenAPI spec.</FieldHint>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </form>
                  </Form>
                </div>

                <div className="p-4 border-t border-border bg-muted/30 rounded-b-xl flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Credentials are never stored — used only for this request.</span>
                  </div>
                  <Button type="submit" form="form-1" disabled={previewMutation.isPending} className="shrink-0">
                    {previewMutation.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Connecting…</>
                    ) : (
                      <>Preview files <ArrowRight className="ml-2 h-4 w-4" /></>
                    )}
                  </Button>
                </div>
              </SectionCard>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <SectionCard>
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">
                        {previewData?.appName ?? "App files"}
                      </span>
                    </div>
                    <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {previewData?.files.length ?? 0} files
                    </span>
                  </div>
                  <ScrollArea className="h-52">
                    <div className="p-2">
                      {previewData?.files.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                          <File className="h-8 w-8 opacity-30" />
                          <p className="text-sm">No files found in this app yet.</p>
                        </div>
                      ) : (
                        previewData?.files.map((file, idx) => (
                          <FileRow key={idx} path={file.path} size={file.size ?? 0} type={file.type ?? "file"} />
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </SectionCard>

                <SectionCard>
                  <div className="p-5 border-b border-border">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                        <Github className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h2 className="font-semibold text-foreground">GitHub destination</h2>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          The repository must already exist on GitHub.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-5">
                    <Form {...form2}>
                      <form id="form-2" onSubmit={form2.handleSubmit(onPushSubmit)} className="space-y-5">
                        <FormField
                          control={form2.control}
                          name="githubToken"
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center justify-between">
                                <FormLabel className="text-sm font-medium">Personal Access Token</FormLabel>
                                <HelpLink href="https://github.com/settings/tokens/new?scopes=repo&description=Base44+to+GitHub">
                                  Create one on GitHub
                                </HelpLink>
                              </div>
                              <FormControl>
                                <Input type="password" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" className="font-mono text-sm" {...field} />
                              </FormControl>
                              <FieldHint>
                                Needs <code className="bg-muted px-1 rounded text-xs">repo</code> scope (classic) or <code className="bg-muted px-1 rounded text-xs">Contents: Read and write</code> (fine-grained).
                              </FieldHint>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form2.control}
                            name="githubOwner"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">Owner</FormLabel>
                                <FormControl><Input placeholder="your-username" {...field} /></FormControl>
                                <FieldHint>GitHub username or org.</FieldHint>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form2.control}
                            name="githubRepo"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">Repository</FormLabel>
                                <FormControl><Input placeholder="my-base44-app" {...field} /></FormControl>
                                <FieldHint>Must already exist.</FieldHint>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form2.control}
                            name="branch"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">Branch</FormLabel>
                                <FormControl><Input placeholder="main" {...field} /></FormControl>
                                <FieldHint>Branch to push into.</FieldHint>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form2.control}
                            name="commitMessage"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">Commit message</FormLabel>
                                <FormControl><Input placeholder="chore: sync from Base44" {...field} /></FormControl>
                                <FieldHint>Shows in your Git history.</FieldHint>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </form>
                    </Form>
                  </div>

                  <div className="p-4 border-t border-border bg-muted/30 rounded-b-xl flex items-center justify-between gap-3">
                    <Button variant="outline" onClick={() => setStep(1)}>
                      <ArrowLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                    <Button
                      type="submit"
                      form="form-2"
                      disabled={pushMutation.isPending || (previewData?.files.length === 0)}
                    >
                      {pushMutation.isPending ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Pushing…</>
                      ) : (
                        <>Push to GitHub <ArrowRight className="ml-2 h-4 w-4" /></>
                      )}
                    </Button>
                  </div>
                </SectionCard>
              </div>
            )}

            {step === 3 && pushResult && (
              <SectionCard>
                <div className="p-10 flex flex-col items-center text-center gap-5">
                  <div className="w-16 h-16 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-xl font-bold text-foreground">Push successful</h2>
                    <p className="text-muted-foreground text-sm">
                      {pushResult.count} file{pushResult.count !== 1 ? "s" : ""} committed to GitHub.
                    </p>
                  </div>
                  <a
                    href={pushResult.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2.5 px-5 py-2.5 bg-foreground text-background rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    <Github className="h-4 w-4" />
                    View commit on GitHub
                    <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                  </a>
                  <button
                    onClick={() => {
                      setStep(1);
                      setPushResult(null);
                      setPreviewData(null);
                      form1.reset();
                      form2.reset();
                      previewMutation.reset();
                      pushMutation.reset();
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
                  >
                    Push another app
                  </button>
                </div>
              </SectionCard>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
