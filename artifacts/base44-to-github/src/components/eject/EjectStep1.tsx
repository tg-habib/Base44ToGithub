import { UseFormReturn } from "react-hook-form";
import { ArrowRight, BookMarked, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { SavedAppsBar } from "@/components/saved/SavedAppsBar";
import type { SavedApp } from "@/lib/types";
import * as z from "zod";

export const step1Schema = z.object({
  base44AppId: z.string().min(1, "App ID is required"),
  base44ApiKey: z.string().min(1, "API Key is required"),
});

export type Step1Values = z.infer<typeof step1Schema>;

interface Props {
  form: UseFormReturn<Step1Values>;
  savedApps: SavedApp[];
  onSelect: (app: SavedApp) => void;
  onRemove: (id: string) => void;
  onSave: () => void;
  onSubmit: (v: Step1Values) => void;
}

export function EjectStep1({ form, savedApps, onSelect, onRemove, onSave, onSubmit }: Props) {
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="space-y-4">
      <SavedAppsBar apps={savedApps} onSelect={onSelect} onRemove={onRemove} />

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/30">
          <h3 className="text-sm font-semibold text-foreground">Base44 credentials</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Your app ID and API key from the Base44 dashboard.</p>
        </div>
        <div className="p-5">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="base44AppId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    App ID
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="69dff787f3edfb6f77adcfb0"
                      className="font-mono text-sm h-10"
                      {...field}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Find it in{" "}
                    <a href="https://app.base44.com" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">
                      Base44 → Settings → App ID
                    </a>
                    {" "}or in the URL of your editor.
                  </p>
                  <FormMessage className="text-xs" />
                </FormItem>
              )} />

              <FormField control={form.control} name="base44ApiKey" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    API Key
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showKey ? "text" : "password"}
                        placeholder="SDK runtime key from Base44 Settings"
                        className="font-mono text-sm h-10 pr-10"
                        {...field}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    SDK runtime key from{" "}
                    <a href="https://app.base44.com" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">
                      Base44 → Settings → API Keys
                    </a>
                    .
                  </p>
                  <FormMessage className="text-xs" />
                </FormItem>
              )} />

              <div className="flex gap-2 pt-1">
                <Button type="submit" className="flex-1 h-10 gap-2">
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 h-10"
                  onClick={onSave}
                >
                  <BookMarked className="h-4 w-4" />
                  Save
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
