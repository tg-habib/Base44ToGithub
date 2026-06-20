import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Database, Loader2, ArrowRight, CheckCircle2,
  FileJson, Github,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { GitHubConnect } from "@/components/github/GitHubConnect";
import { InfoBanner } from "@/components/shared/InfoBanner";
import { StepWizard } from "@/components/shared/StepWizard";
import type { GhSession } from "@/lib/types";

const schema = z.object({
  base44AppId: z.string().min(1, "App ID is required"),
  base44ApiKey: z.string().min(1, "API key is required"),
  githubToken: z.string().min(1, "GitHub token is required"),
  githubOwner: z.string().min(1),
  githubRepo: z.string().min(1),
  branch: z.string().min(1).default("main"),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  ghSession: GhSession | null;
  ghConnecting: boolean;
  useManualToken: boolean;
  onStartOAuth: () => void;
  onDisconnect: () => void;
  onToggleManual: () => void;
}

interface Preview {
  entities: string[];
  schemaFile: boolean;
  configFile: boolean;
}

const STEPS = [
  { label: "Credentials" },
  { label: "Preview" },
  { label: "Push" },
];

export function SchemaView({
  ghSession, ghConnecting, useManualToken, onStartOAuth, onDisconnect, onToggleManual,
}: Props) {
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushDone, setPushDone] = useState(false);
  const [error, setError] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      base44AppId: "",
      base44ApiKey: "",
      githubToken: ghSession?.token ?? "",
      githubOwner: ghSession?.login ?? "",
      githubRepo: "",
      branch: "main",
    },
  });

  const handlePreview = async (values: FormValues) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base44AppId: values.base44AppId, base44ApiKey: values.base44ApiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      setPreview({
        entities: data.entities ?? [],
        schemaFile: !!data.schemaFile,
        configFile: !!data.configFile,
      });
      form.setValue("githubToken", ghSession?.token ?? values.githubToken);
      form.setValue("githubOwner", ghSession?.login ?? values.githubOwner);
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handlePush = async () => {
    const values = form.getValues();
    setPushLoading(true);
    setError("");
    try {
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base44AppId: values.base44AppId,
          base44ApiKey: values.base44ApiKey,
          githubToken: values.githubToken,
          githubOwner: values.githubOwner,
          githubRepo: values.githubRepo,
          branch: values.branch,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Push failed");
      setPushDone(true);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Database className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Schema &amp; Config</h1>
            <p className="text-sm text-muted-foreground">Preview your data models and push them to GitHub as JSON.</p>
          </div>
        </div>
      </div>

      <StepWizard steps={STEPS} current={step} />

      {error && <InfoBanner variant="error" title="Error">{error}</InfoBanner>}

      {step === 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/30">
            <p className="text-sm font-semibold text-foreground">Connect your Base44 app</p>
          </div>
          <div className="p-5">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handlePreview)} className="space-y-4">
                <FormField control={form.control} name="base44AppId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">App ID</FormLabel>
                    <FormControl><Input placeholder="69dff787f3edfb6f77adcfb0" className="font-mono h-10 text-sm" {...field} /></FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )} />
                <FormField control={form.control} name="base44ApiKey" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">API Key</FormLabel>
                    <FormControl><Input type="password" placeholder="SDK runtime key" className="font-mono h-10 text-sm" {...field} /></FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )} />
                <Button type="submit" className="w-full h-10 gap-2" disabled={loading}>
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Fetching…</> : <><ArrowRight className="h-4 w-4" /> Preview schema</>}
                </Button>
              </form>
            </Form>
          </div>
        </div>
      )}

      {step >= 1 && preview && (
        <div className="space-y-4">
          {/* Preview */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Files to push</p>
              <span className="text-xs text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">
                {(preview.schemaFile ? 1 : 0) + (preview.configFile ? 1 : 0)} files
              </span>
            </div>
            <div className="p-4 space-y-2">
              {preview.schemaFile && (
                <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl border border-border">
                  <FileJson className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">schema.json</p>
                    <p className="text-xs text-muted-foreground">{preview.entities.length} entities: {preview.entities.join(", ")}</p>
                  </div>
                </div>
              )}
              {preview.configFile && (
                <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl border border-border">
                  <FileJson className="h-4 w-4 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">config.json</p>
                    <p className="text-xs text-muted-foreground">App configuration</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* GitHub destination */}
          {step === 1 && !pushDone && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border bg-muted/30">
                <p className="text-sm font-semibold text-foreground">GitHub destination</p>
              </div>
              <div className="p-5 space-y-4">
                <GitHubConnect
                  session={ghSession}
                  connecting={ghConnecting}
                  useManualToken={useManualToken}
                  tokenValue={form.watch("githubToken")}
                  onTokenChange={(v) => form.setValue("githubToken", v)}
                  onStartOAuth={onStartOAuth}
                  onDisconnect={onDisconnect}
                  onToggleManual={onToggleManual}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="githubOwner" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Owner</FormLabel>
                      <FormControl><Input className="h-9 text-sm" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="githubRepo" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Repo</FormLabel>
                      <FormControl><Input placeholder="my-app" className="h-9 text-sm" {...field} /></FormControl>
                    </FormItem>
                  )} />
                </div>
                <Button
                  onClick={handlePush}
                  disabled={pushLoading || !form.getValues("githubRepo")}
                  className="w-full h-10 gap-2"
                >
                  {pushLoading
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Pushing…</>
                    : <><Github className="h-4 w-4" /> Push to GitHub</>}
                </Button>
              </div>
            </div>
          )}

          {pushDone && (
            <InfoBanner variant="success" title="Schema pushed!">
              Files committed to <code className="font-mono">{form.getValues("githubOwner")}/{form.getValues("githubRepo")}</code>
            </InfoBanner>
          )}
        </div>
      )}
    </div>
  );
}
