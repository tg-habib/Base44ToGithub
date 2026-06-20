import { useState, useRef } from "react";
import type { StreamState } from "@/lib/types";

export interface EjectPayload {
  base44AppId: string;
  base44ApiKey: string;
  githubToken: string;
  githubOwner: string;
  githubRepo: string;
  branch: string;
  commitMessage: string;
  private?: boolean;
}

export function useEjectStream() {
  const [state, setState] = useState<StreamState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const run = async (payload: EjectPayload) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setState({ status: "running", logs: [] });

    try {
      const res = await fetch("/api/eject/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text();
        let msg = text;
        try { msg = JSON.parse(text).error ?? text; } catch { /* noop */ }
        setState({ status: "error", logs: [], message: msg });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const logs: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const chunk of parts) {
          const lines = chunk.split("\n");
          let eventName = "";
          let dataLine = "";
          for (const l of lines) {
            if (l.startsWith("event: ")) eventName = l.slice(7).trim();
            if (l.startsWith("data: ")) dataLine = l.slice(6);
          }
          if (!dataLine) continue;
          let parsed: Record<string, unknown>;
          try { parsed = JSON.parse(dataLine); } catch { continue; }

          if (eventName === "log") {
            const line = String(parsed.line ?? "");
            logs.push(line);
            setState({ status: "running", logs: [...logs] });
          } else if (eventName === "result") {
            setState({
              status: "done",
              logs: [...logs],
              commitUrl: String(parsed.commitUrl ?? ""),
              filesCount: Number(parsed.filesCount ?? 0),
            });
          } else if (eventName === "error") {
            setState({ status: "error", logs: [...logs], message: String(parsed.message ?? "Unknown error") });
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Unknown error";
      setState((prev) => ({
        status: "error",
        logs: prev.status === "running" ? prev.logs : [],
        message: msg,
      }));
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setState({ status: "idle" });
  };

  return { state, run, reset };
}
