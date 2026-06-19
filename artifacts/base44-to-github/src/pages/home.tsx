import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { usePreviewBase44Files, usePushToGithub } from "@workspace/api-client-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileCode, Loader2, GitCommitHorizontal, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import type { PreviewResult } from "@workspace/api-client-react/src/generated/api.schemas";

// Schemas
const previewSchema = z.object({
  base44AppId: z.string().min(1, "App ID is required"),
  base44ApiKey: z.string().min(1, "API Key is required"),
});

const githubSchema = z.object({
  githubToken: z.string().min(1, "GitHub Token is required"),
  githubOwner: z.string().min(1, "Owner is required"),
  githubRepo: z.string().min(1, "Repository is required"),
  branch: z.string().default("main"),
  commitMessage: z.string().default("chore: sync from Base44"),
});

export default function Home() {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [pushResult, setPushResult] = useState<{ url: string; count: number } | null>(null);

  // Forms
  const form1 = useForm<z.infer<typeof previewSchema>>({
    resolver: zodResolver(previewSchema),
    defaultValues: { base44AppId: "", base44ApiKey: "" },
  });

  const form2 = useForm<z.infer<typeof githubSchema>>({
    resolver: zodResolver(githubSchema),
    defaultValues: { githubToken: "", githubOwner: "", githubRepo: "", branch: "main", commitMessage: "chore: sync from Base44" },
  });

  // Mutations
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
        onError: (err: any) => {
          toast({
            title: "Preview failed",
            description: err?.error || "Could not fetch app files.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const onPushSubmit = (values: z.infer<typeof githubSchema>) => {
    const previewValues = form1.getValues();
    pushMutation.mutate(
      {
        data: {
          ...previewValues,
          ...values,
        },
      },
      {
        onSuccess: (data) => {
          if (data.success) {
            setPushResult({ url: data.commitUrl, count: data.filesCount });
            setStep(3);
          } else {
            toast({
              title: "Push failed",
              description: data.message || "An error occurred during push.",
              variant: "destructive",
            });
          }
        },
        onError: (err: any) => {
          toast({
            title: "Push failed",
            description: err?.error || "An error occurred during push.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 dark">
      <div className="w-full max-w-2xl space-y-8">
        
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center p-3 bg-primary/10 mb-4 border border-primary/20">
            <GitCommitHorizontal className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl font-mono font-bold tracking-tight text-foreground uppercase">B44 &gt; GH</h1>
          <p className="mt-2 text-muted-foreground font-mono text-sm">Export Base44 to version control</p>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center justify-between mb-8 relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-px bg-border -z-10"></div>
          {[1, 2, 3].map((s) => (
            <div 
              key={s} 
              className={`w-8 h-8 flex items-center justify-center font-mono text-sm font-bold border transition-colors duration-300
                ${s === step ? "bg-primary border-primary text-primary-foreground" : 
                  s < step ? "bg-card border-primary text-primary" : "bg-card border-border text-muted-foreground"}`}
            >
              {s}
            </div>
          ))}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <Card className="border-border bg-card shadow-xl rounded-none">
            <CardHeader className="border-b border-border bg-muted/30">
              <CardTitle className="font-mono text-lg flex items-center gap-2">
                <span className="text-primary">01.</span> Connect Base44
              </CardTitle>
              <CardDescription className="font-mono text-xs">Enter your application credentials to preview files.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <Form {...form1}>
                <form id="form-1" onSubmit={form1.handleSubmit(onPreviewSubmit)} className="space-y-4">
                  <FormField
                    control={form1.control}
                    name="base44AppId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">App ID</FormLabel>
                        <FormControl>
                          <Input placeholder="app_1234567890" className="font-mono bg-background rounded-none border-border focus-visible:ring-primary" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form1.control}
                    name="base44ApiKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">API Key</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="b44_key_..." className="font-mono bg-background rounded-none border-border focus-visible:ring-primary" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </form>
              </Form>
            </CardContent>
            <CardFooter className="border-t border-border bg-muted/30 flex justify-end p-4">
              <Button 
                type="submit" 
                form="form-1" 
                disabled={previewMutation.isPending}
                className="font-mono rounded-none px-8"
              >
                {previewMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Fetching...</>
                ) : (
                  <>Preview <ArrowRight className="ml-2 h-4 w-4" /></>
                )}
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Preview Section */}
            <Card className="border-border bg-card rounded-none overflow-hidden">
              <div className="px-4 py-2 bg-muted/50 border-b border-border flex justify-between items-center">
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Preview ({previewData?.appName})</span>
                <span className="font-mono text-xs text-primary">{previewData?.files.length} files</span>
              </div>
              <ScrollArea className="h-48 bg-[#0d1117]">
                <div className="p-4 font-mono text-sm space-y-1">
                  {previewData?.files.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors">
                      <FileCode className="h-4 w-4 text-gray-500 shrink-0" />
                      <span className="truncate flex-1">{file.path}</span>
                      <span className="text-gray-600 text-xs shrink-0">{(file.size / 1024).toFixed(1)}kb</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Card>

            <Card className="border-border bg-card shadow-xl rounded-none">
              <CardHeader className="border-b border-border bg-muted/30">
                <CardTitle className="font-mono text-lg flex items-center gap-2">
                  <span className="text-primary">02.</span> Target Repository
                </CardTitle>
                <CardDescription className="font-mono text-xs">Configure the GitHub destination.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <Form {...form2}>
                  <form id="form-2" onSubmit={form2.handleSubmit(onPushSubmit)} className="space-y-4">
                    <FormField
                      control={form2.control}
                      name="githubToken"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Personal Access Token (Classic/Fine-grained)</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="ghp_..." className="font-mono bg-background rounded-none border-border focus-visible:ring-primary" {...field} />
                          </FormControl>
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
                            <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Owner/Org</FormLabel>
                            <FormControl>
                              <Input placeholder="octocat" className="font-mono bg-background rounded-none border-border focus-visible:ring-primary" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form2.control}
                        name="githubRepo"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Repository Name</FormLabel>
                            <FormControl>
                              <Input placeholder="hello-world" className="font-mono bg-background rounded-none border-border focus-visible:ring-primary" {...field} />
                            </FormControl>
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
                            <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Branch</FormLabel>
                            <FormControl>
                              <Input placeholder="main" className="font-mono bg-background rounded-none border-border focus-visible:ring-primary" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form2.control}
                        name="commitMessage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Commit Message</FormLabel>
                            <FormControl>
                              <Input placeholder="chore: sync from Base44" className="font-mono bg-background rounded-none border-border focus-visible:ring-primary" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </form>
                </Form>
              </CardContent>
              <CardFooter className="border-t border-border bg-muted/30 flex justify-between p-4">
                <Button 
                  variant="outline" 
                  onClick={() => setStep(1)} 
                  disabled={pushMutation.isPending}
                  className="font-mono rounded-none"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button 
                  type="submit" 
                  form="form-2" 
                  disabled={pushMutation.isPending}
                  className="font-mono rounded-none px-8"
                >
                  {pushMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Pushing...</>
                  ) : (
                    <>Push Code <ArrowRight className="ml-2 h-4 w-4" /></>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && pushResult && (
          <div className="animate-in fade-in zoom-in-95 duration-500 flex flex-col items-center justify-center text-center space-y-6 pt-12">
            <div className="w-20 h-20 bg-primary/20 rounded-none border border-primary flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-mono font-bold text-foreground">Push Successful</h2>
              <p className="text-muted-foreground font-mono">Successfully synced {pushResult.count} files to GitHub.</p>
            </div>
            
            <a 
              href={pushResult.url} 
              target="_blank" 
              rel="noreferrer"
              className="group flex items-center gap-3 px-6 py-3 bg-card border border-border hover:border-primary transition-colors duration-300"
            >
              <GitCommitHorizontal className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="font-mono text-sm group-hover:text-primary transition-colors">View Commit on GitHub</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
            </a>

            <div className="pt-8">
              <Button 
                variant="ghost" 
                onClick={() => {
                  setStep(1);
                  setPushResult(null);
                  setPreviewData(null);
                  form1.reset();
                  form2.reset();
                }}
                className="font-mono rounded-none text-muted-foreground hover:text-foreground"
              >
                Sync another app
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
