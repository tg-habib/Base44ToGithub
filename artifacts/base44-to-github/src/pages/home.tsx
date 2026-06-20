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

export default function Home() {
  const { toast } = useToast();
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
      {/* Top bar */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <GitBranch className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm text-foreground">Base44 to GitHub</span>
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
        {/* Hero */}
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Push your Base44 app to GitHub
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Export your app's entities, backend functions, and configuration to a GitHub
            repository in one click — no code needed.
          </p>
        </div>

        {/* Step indicator */}
        <StepIndicator current={step} />

        {/* ── Step 1: Base44 credentials ── */}
        {step === 1 && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <SectionCard>
              <div className="p-5 border-b border-border">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                    <Key className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground">Connect your Base44 app</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      You'll find both credentials in your Base44 app dashboard.
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
                            <HelpLink href="https://app.base44.com">
                              Find it in your dashboard
                            </HelpLink>
                          </div>
                          <FormControl>
                            <Input
                              placeholder="5cd25d4561300955d4b9509e7"
                              className="font-mono text-sm"
                              {...field}
                            />
                          </FormControl>
                          <FieldHint>
                            The long alphanumeric ID shown in the SDK code snippet under your app's API tab.
                          </FieldHint>
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
                            <HelpLink href="https://app.base44.com">
                              Find it under API → Documentation
                            </HelpLink>
                          </div>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Your Base44 API key"
                              className="font-mono text-sm"
                              {...field}
                            />
                          </FormControl>
                          <FieldHint>
                            Found in the same code snippet as the App ID — it's the value of the <code className="bg-muted px-1 rounded text-xs">api_key</code> field.
                          </FieldHint>
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
                              <span className="ml-2 text-xs font-normal text-muted-foreground">(optional but recommended)</span>
                            </FormLabel>
                            <HelpLink href="https://app.base44.com">
                              Find it in your dashboard
                            </HelpLink>
                          </div>
                          <FormControl>
                            <Input
                              placeholder="https://my-app-name.base44.app"
                              className="font-mono text-sm"
                              {...field}
                            />
                          </FormControl>
                          <FieldHint>
                            Your live app URL — enables exporting entity schemas and the full API spec.
                            Find it in your Base44 dashboard under <strong>API → Documentation</strong> at the top of the page.
                          </FieldHint>
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
                  <span>Your credentials are sent only to the API and never stored.</span>
                </div>
                <Button
                  type="submit"
                  form="form-1"
                  disabled={previewMutation.isPending}
                  className="shrink-0"
                >
                  {previewMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Connecting…</>
                  ) : (
                    <>Preview files <ArrowRight className="ml-2 h-4 w-4" /></>
                  )}
                </Button>
              </div>
            </SectionCard>

            {/* How it works */}
            <SectionCard className="overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">How it works</h3>
              </div>
              <div className="divide-y divide-border">
                {[
                  {
                    icon: <Key className="h-4 w-4 text-primary" />,
                    title: "Connect Base44",
                    desc: "Enter your App ID and API key to fetch your app's entities and functions.",
                  },
                  {
                    icon: <FolderOpen className="h-4 w-4 text-primary" />,
                    title: "Review the files",
                    desc: "See exactly which files will be pushed before committing anything.",
                  },
                  {
                    icon: <Github className="h-4 w-4 text-primary" />,
                    title: "Push to GitHub",
                    desc: "Choose a repository and branch, then push — a real Git commit is created.",
                  },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3.5 p-4">
                    <div className="w-7 h-7 bg-primary/10 rounded-md flex items-center justify-center shrink-0 mt-0.5">
                      {item.icon}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        )}

        {/* ── Step 2: File preview + GitHub config ── */}
        {step === 2 && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* File preview */}
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

            {/* GitHub config */}
            <SectionCard>
              <div className="p-5 border-b border-border">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                    <Github className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground">GitHub destination</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Choose where the files will be pushed.
                      The repository must already exist.
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
                            <Input
                              type="password"
                              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                              className="font-mono text-sm"
                              {...field}
                            />
                          </FormControl>
                          <FieldHint>
                            Needs the <code className="bg-muted px-1 rounded text-xs">repo</code> scope (classic token) or{" "}
                            <code className="bg-muted px-1 rounded text-xs">Contents: Read and write</code> (fine-grained token).
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
                            <FormControl>
                              <Input placeholder="your-username" {...field} />
                            </FormControl>
                            <FieldHint>Your GitHub username or org name.</FieldHint>
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
                            <FormControl>
                              <Input placeholder="my-base44-app" {...field} />
                            </FormControl>
                            <FieldHint>Must already exist on GitHub.</FieldHint>
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
                            <FormControl>
                              <Input placeholder="main" {...field} />
                            </FormControl>
                            <FieldHint>The branch to push into.</FieldHint>
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
                            <FormControl>
                              <Input placeholder="chore: sync from Base44" {...field} />
                            </FormControl>
                            <FieldHint>Shown in your Git history.</FieldHint>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </form>
                </Form>
              </div>

              <div className="p-4 border-t border-border bg-muted/30 rounded-b-xl flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  disabled={pushMutation.isPending}
                >
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

        {/* ── Step 3: Success ── */}
        {step === 3 && pushResult && (
          <div className="animate-in fade-in zoom-in-95 duration-400">
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
          </div>
        )}
      </main>
    </div>
  );
}
