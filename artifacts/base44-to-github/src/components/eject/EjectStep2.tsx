import { UseFormReturn } from "react-hook-form";
import { ArrowLeft, Zap, Loader2, Lock, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { GitHubConnect } from "@/components/github/GitHubConnect";
import { RepoPicker } from "@/components/github/RepoPicker";
import { cn } from "@/lib/utils";
import type { GhSession, UserRepo } from "@/lib/types";
import * as z from "zod";

export const step2Schema = z.object({
  githubToken: z.string().min(1, "GitHub token is required"),
  githubOwner: z.string().min(1, "Owner is required"),
  githubRepo: z.string().min(1, "Repository is required"),
  branch: z.string().min(1).default("main"),
  commitMessage: z.string().min(1).default("feat: eject from Base44"),
});

export type Step2Values = z.infer<typeof step2Schema>;

interface Props {
  form: UseFormReturn<Step2Values>;
  ghSession: GhSession | null;
  ghConnecting: boolean;
  useManualToken: boolean;
  repos: UserRepo[];
  reposLoading: boolean;
  isPrivate: boolean;
  onTogglePrivate: () => void;
  onStartOAuth: () => void;
  onDisconnect: () => void;
  onToggleManual: () => void;
  onBack: () => void;
  onSubmit: (v: Step2Values) => void;
  isRunning: boolean;
}

export function EjectStep2({
  form, ghSession, ghConnecting, useManualToken, repos, reposLoading,
  isPrivate, onTogglePrivate, onStartOAuth, onDisconnect, onToggleManual,
  onBack, onSubmit, isRunning,
}: Props) {
  const currentRepo = form.watch("githubRepo");

  const handleRepoSelect = (repo: UserRepo) => {
    form.setValue("githubOwner", repo.owner);
    form.setValue("githubRepo", repo.name);
    if (repo.private) onTogglePrivate();
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground">GitHub destination</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Where should your code be pushed?</p>
      </div>
      <div className="p-5 space-y-5">
        {/* GitHub Auth */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            GitHub account
          </p>
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
        </div>

        {/* Repo fields */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Repository
              </p>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="githubOwner" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Owner / Org</FormLabel>
                    <FormControl>
                      <Input placeholder="your-username" className="h-9 text-sm" {...field} />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )} />
                <FormField control={form.control} name="githubRepo" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Repository name</FormLabel>
                    <FormControl>
                      <Input placeholder="my-app" className="h-9 text-sm" {...field} />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )} />
              </div>

              {/* Repo picker */}
              {(ghSession || useManualToken) && (
                <div className="mt-3">
                  <RepoPicker
                    repos={repos}
                    loading={reposLoading}
                    currentRepo={currentRepo}
                    onSelect={handleRepoSelect}
                  />
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Commit options
              </p>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="branch" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Branch</FormLabel>
                    <FormControl>
                      <Input placeholder="main" className="h-9 text-sm" {...field} />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )} />
                <FormField control={form.control} name="commitMessage" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Commit message</FormLabel>
                    <FormControl>
                      <Input className="h-9 text-sm" {...field} />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Private toggle */}
            <button
              type="button"
              onClick={onTogglePrivate}
              className={cn(
                "w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all",
                isPrivate
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-muted/30 hover:border-border/80",
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                isPrivate ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}>
                {isPrivate ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  {isPrivate ? "Private repository" : "Public repository"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isPrivate
                    ? "New repos will be created as private."
                    : "New repos will be created as public. Click to make private."}
                </p>
              </div>
              <div className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                isPrivate ? "border-primary bg-primary" : "border-muted-foreground/30",
              )}>
                {isPrivate && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </button>

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onBack} className="gap-2 h-10">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button type="submit" className="flex-1 h-10 gap-2" disabled={isRunning}>
                {isRunning
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Pushing…</>
                  : <><Zap className="h-4 w-4" /> Eject &amp; Push</>}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
