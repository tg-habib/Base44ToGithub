import { AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "info" | "success" | "warning" | "error";

const CONFIG: Record<Variant, { icon: React.ReactNode; classes: string }> = {
  info: {
    icon: <Info className="h-4 w-4 shrink-0 mt-0.5" />,
    classes: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300",
  },
  success: {
    icon: <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />,
    classes: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300",
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />,
    classes: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300",
  },
  error: {
    icon: <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />,
    classes: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300",
  },
};

interface Props {
  variant?: Variant;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}

export function InfoBanner({ variant = "info", title, children, className }: Props) {
  const { icon, classes } = CONFIG[variant];
  return (
    <div className={cn("flex items-start gap-3 border rounded-xl px-4 py-3.5", classes, className)}>
      {icon}
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-semibold mb-0.5">{title}</p>}
        {children && <div className="text-xs leading-relaxed opacity-90">{children}</div>}
      </div>
    </div>
  );
}
