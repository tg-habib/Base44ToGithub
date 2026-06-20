import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Zap, ChevronDown, ChevronUp, BookMarked } from "lucide-react";
import { StepWizard } from "@/components/shared/StepWizard";
import { EjectStep1, step1Schema, type Step1Values } from "./EjectStep1";
import { EjectStep2, step2Schema, type Step2Values } from "./EjectStep2";
import { LiveTerminal } from "./LiveTerminal";
import { SuccessView } from "./SuccessView";
import { ErrorView } from "./ErrorView";
import { SaveAppDialog } from "@/components/saved/SaveAppDialog";
import { useEjectStream } from "@/hooks/useEjectStream";
import { useSavedApps } from "@/hooks/useSavedApps";
import { useUserRepos } from "@/hooks/useUserRepos";
import { ssGet, ssSet, ssDel } from "@/lib/storage";
import type { GhSession, PushHistoryItem } from "@/lib/types";

const STEPS = [
  { label: "Credentials",  description: "Base44 app" },
  { label: "Destination",  description: "GitHub repo" },
  { label: "Push",         description: "Eject & commit" },
];

interface Props {
  ghSession: GhSession | null;
  ghConnecting: boolean;
  useManualToken: boolean;
  onStartOAuth: () => void;
  onDisconnect: () => void;
  onToggleManual: () => void;
  onAddToHistory: (item: Omit<PushHistoryItem, "id" | "date">) => void;
}

export function EjectView({
  ghSession, ghConnecting, useManualToken,
  onStartOAuth, onDisconnect, onToggleManual, onAddToHistory,
}: Props) {
  const [step, setStep] = useState(0);
  const [step1Data, setStep1Data] = useState<Step1Values | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLogs, setShowLogs] = useState(true);

  const { apps: savedApps, save: saveApp, remove: removeApp } = useSavedApps();
  const { state, run, reset } = useEjectStream();
  const { repos, loading: reposLoading } = useUserRepos(
    ghSession?.token ?? null
  );

  const form1 = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: { base44AppId: "", base44ApiKey: "" },
  });

  const form2 = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      githubToken: "",
      githubOwner: "",
      githubRepo: "",
      branch: "main",
      commitMessage: "feat: eject from Base44",
    },
  });

  // Restore persisted step 1 from sessionStorage
  useEffect(() => {
    const saved = ssGet<Step1Values>("eject_step1");
    if (saved) {
      form1.reset(saved);
    }
  }, []);

  // Sync GitHub session token into form2
  useEffect(() => {
    if (ghSession) {
      form2.setValue("githubToken", ghSession.token);
      form2.setValue("githubOwner", ghSession.login);
    }
  }, [ghSession]);

  const handleStep1Submit = (values: Step1Values) => {
    setStep1Data(values);
    ssSet("eject_step1", values);
    setStep(1);
  };

  const handleStep2Submit = async (values: Step2Values) => {
    if (!step1Data) return;
    setStep(2);
    setShowLogs(true);
    await run({
      base44AppId: step1Data.base44AppId,
      base44ApiKey: step1Data.base44ApiKey,
      githubToken: values.githubToken,
      githubOwner: values.githubOwner,
      githubRepo: values.githubRepo,
      branch: values.branch,
      commitMessage: values.commitMessage,
      private: isPrivate,
    });
  };

  // Record history on success
  useEffect(() => {
    if (state.status === "done") {
      const vals2 = form2.getValues();
      onAddToHistory({
        repo: `${vals2.githubOwner}/${vals2.githubRepo}`,
        commitUrl: state.commitUrl,
        filesCount: state.filesCount,
        appId: step1Data?.base44AppId ?? "",
      });
    }
  }, [state.status]);

  const handleReset = () => {
    reset();
    form1.reset();
    form2.reset({ branch: "main", commitMessage: "feat: eject from Base44", githubToken: ghSession?.token ?? "", githubOwner: ghSession?.login ?? "", githubRepo: "" });
    setStep1Data(null);
    setIsPrivate(false);
    setStep(0);
    ssDel("eject_step1");
  };

  const handleRetry = () => {
    const vals2 = form2.getValues();
    handleStep2Submit(vals2);
  };

  const handleSaveApp = (nickname: string) => {
    const vals = form1.getValues();
    saveApp({ nickname, appId: vals.base44AppId, apiKey: vals.base44ApiKey });
    setShowSaveDialog(false);
  };

  const handleSelectSaved = (app: { appId: string; apiKey: string }) => {
    form1.setValue("base44AppId", app.appId);
    form1.setValue("base44ApiKey", app.apiKey);
  };

  const currentStep = state.status === "done" || state.status === "error"
    ? 2
    : step === 2
    ? 2
    : step;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Eject full code</h1>
            <p className="text-sm text-muted-foreground">Download all source files and push to GitHub in one click.</p>
          </div>
        </div>
      </div>

      {/* Step indicator */}
      <StepWizard steps={STEPS} current={currentStep} />

      {/* Step content */}
      {step === 0 && (
        <EjectStep1
          form={form1}
          savedApps={savedApps}
          onSelect={handleSelectSaved}
          onRemove={removeApp}
          onSave={() => setShowSaveDialog(true)}
          onSubmit={handleStep1Submit}
        />
      )}

      {step === 1 && state.status === "idle" && (
        <EjectStep2
          form={form2}
          ghSession={ghSession}
          ghConnecting={ghConnecting}
          useManualToken={useManualToken}
          repos={repos}
          reposLoading={reposLoading}
          isPrivate={isPrivate}
          onTogglePrivate={() => setIsPrivate((v) => !v)}
          onStartOAuth={onStartOAuth}
          onDisconnect={onDisconnect}
          onToggleManual={onToggleManual}
          onBack={() => setStep(0)}
          onSubmit={handleStep2Submit}
          isRunning={false}
        />
      )}

      {/* Terminal (shown during running, done, or error) */}
      {(state.status === "running" || state.status === "done" || state.status === "error") && (
        <div className="space-y-4">
          {/* Success / Error */}
          {state.status === "done" && (
            <SuccessView
              commitUrl={state.commitUrl}
              filesCount={state.filesCount}
              repoLabel={`${form2.getValues("githubOwner")}/${form2.getValues("githubRepo")}`}
              onReset={handleReset}
            />
          )}
          {state.status === "error" && (
            <ErrorView message={state.message} onRetry={handleRetry} onReset={handleReset} />
          )}

          {/* Collapsible terminal */}
          <div>
            <button
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground mb-2 transition-colors"
              onClick={() => setShowLogs((v) => !v)}
            >
              {showLogs ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showLogs ? "Hide" : "Show"} output log
              <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">
                {state.logs.length} lines
              </span>
            </button>
            {showLogs && (
              <LiveTerminal logs={state.logs} running={state.status === "running"} />
            )}
          </div>
        </div>
      )}

      {/* Step2 form while running */}
      {step === 1 && state.status === "running" && (
        <EjectStep2
          form={form2}
          ghSession={ghSession}
          ghConnecting={ghConnecting}
          useManualToken={useManualToken}
          repos={repos}
          reposLoading={reposLoading}
          isPrivate={isPrivate}
          onTogglePrivate={() => setIsPrivate((v) => !v)}
          onStartOAuth={onStartOAuth}
          onDisconnect={onDisconnect}
          onToggleManual={onToggleManual}
          onBack={() => setStep(0)}
          onSubmit={handleStep2Submit}
          isRunning={true}
        />
      )}

      {/* Save app dialog */}
      {showSaveDialog && (
        <SaveAppDialog
          onSave={handleSaveApp}
          onCancel={() => setShowSaveDialog(false)}
        />
      )}
    </div>
  );
}
