import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  onSave: (nickname: string) => void;
  onCancel: () => void;
}

export function SaveAppDialog({ onSave, onCancel }: Props) {
  const [name, setName] = useState("");

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Save this app</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Give it a nickname for quick access.</p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <Input
          placeholder="e.g. My CRM, Marketing Dashboard…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onSave(name.trim()); }}
          autoFocus
        />
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
          <Button
            className="flex-1 gap-2"
            disabled={!name.trim()}
            onClick={() => onSave(name.trim())}
          >
            <Check className="h-4 w-4" /> Save app
          </Button>
        </div>
      </div>
    </div>
  );
}
