import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  label: string;
  description?: string;
}

interface Props {
  steps: Step[];
  current: number;
}

export function StepWizard({ steps, current }: Props) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;

        return (
          <div key={i} className="flex items-center">
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ring-2",
                  done
                    ? "bg-primary ring-primary text-primary-foreground"
                    : active
                    ? "bg-primary/10 ring-primary text-primary"
                    : "bg-muted ring-border text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : <span>{i + 1}</span>}
              </div>
              <div className="hidden sm:block">
                <p className={cn("text-xs font-semibold leading-none", active ? "text-foreground" : done ? "text-primary" : "text-muted-foreground")}>
                  {step.label}
                </p>
                {step.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                )}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className={cn("h-px w-8 sm:w-12 mx-2 sm:mx-3", i < current ? "bg-primary" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
