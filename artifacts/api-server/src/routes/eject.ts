import { Router, type IRouter } from "express";
import { EjectAndPushBody } from "@workspace/api-zod";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pushFilesToGitHub } from "../lib/github";
import { logger } from "../lib/logger";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".cache"]);
const MAX_FILE_SIZE = 1_000_000;

async function walkDir(dir: string): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = [];

  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const s = await stat(fullPath);
        if (s.size > MAX_FILE_SIZE) continue;
        try {
          const content = await readFile(fullPath, "utf8");
          const relPath = relative(dir, fullPath);
          files.push({ path: relPath, content });
        } catch {
          // skip binary or unreadable files
        }
      }
    }
  }

  await walk(dir);
  return files;
}

const router: IRouter = Router();

/* ─────────────────────────────────────────────────────────────────────────
   POST /eject/stream  — Server-Sent Events endpoint
   Streams base44 eject output line-by-line, then pushes to GitHub.
────────────────────────────────────────────────────────────────────────── */
router.post("/eject/stream", async (req, res): Promise<void> => {
  const parsed = EjectAndPushBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { base44AppId, base44ApiKey, githubToken, githubOwner, githubRepo, branch, commitMessage } =
    parsed.data;

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const sendLog = (line: string) => sendEvent("log", { line: line.trimEnd() });
  const sendError = (message: string) => sendEvent("error", { message });
  const sendResult = (data: object) => sendEvent("result", data);

  let tmpDir: string | null = null;

  const cleanup = () => {
    if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  };

  try {
    tmpDir = await mkdtemp(join(tmpdir(), "b44-eject-"));
    sendLog(`▶ Running: npx base44 eject --app-id ${base44AppId} --path ${tmpDir} --yes`);
    logger.info({ tmpDir, base44AppId }, "Starting base44 eject (stream)");

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        "npx",
        ["--yes", "base44", "eject", "--app-id", base44AppId, "--path", tmpDir!, "--yes"],
        {
          env: {
            ...process.env,
            BASE44_API_KEY: base44ApiKey,
            BASE44_APP_ID: base44AppId,
            FORCE_COLOR: "0",
          },
        }
      );

      const onClientClose = () => {
        proc.kill("SIGTERM");
        cleanup();
      };
      req.on("close", onClientClose);

      const flushLines = (chunk: Buffer, tag: "stdout" | "stderr") => {
        const text = chunk.toString("utf8");
        for (const line of text.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed) sendLog(`${tag === "stderr" ? "  " : ""}${line}`);
        }
      };

      proc.stdout.on("data", (chunk: Buffer) => flushLines(chunk, "stdout"));
      proc.stderr.on("data", (chunk: Buffer) => flushLines(chunk, "stderr"));

      proc.on("error", (err) => {
        req.off("close", onClientClose);
        reject(err);
      });

      proc.on("close", (code) => {
        req.off("close", onClientClose);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`base44 eject exited with code ${code}`));
        }
      });

      // safety timeout
      setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new Error("base44 eject timed out after 120s"));
      }, 120_000);
    });

    sendLog("");
    sendLog("✓ Eject complete — collecting files…");

    const files = await walkDir(tmpDir);

    if (files.length === 0) {
      sendError("base44 eject produced no files. Check your App ID and API Key.");
      res.end();
      cleanup();
      return;
    }

    sendLog(`✓ Found ${files.length} file${files.length !== 1 ? "s" : ""}`);
    sendLog(`▶ Pushing to github.com/${githubOwner}/${githubRepo}@${branch}…`);

    const { commitUrl, filesCount } = await pushFilesToGitHub({
      token: githubToken,
      owner: githubOwner,
      repo: githubRepo,
      branch,
      commitMessage,
      files,
    });

    sendLog(`✓ ${filesCount} file${filesCount !== 1 ? "s" : ""} committed`);

    sendResult({
      success: true,
      filesCount,
      commitUrl,
      message: `Ejected ${filesCount} files to ${githubOwner}/${githubRepo}@${branch}`,
    });

    res.end();
    cleanup();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err }, "Eject stream error");
    sendError(message);
    res.end();
    cleanup();
  }
});

/* ─────────────────────────────────────────────────────────────────────────
   POST /eject  — Legacy non-streaming endpoint (kept for compatibility)
────────────────────────────────────────────────────────────────────────── */
router.post("/eject", async (req, res): Promise<void> => {
  const parsed = EjectAndPushBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { base44AppId, base44ApiKey, githubToken, githubOwner, githubRepo, branch, commitMessage } =
    parsed.data;

  let tmpDir: string | null = null;

  try {
    tmpDir = await mkdtemp(join(tmpdir(), "b44-eject-"));

    const cliLogs: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        "npx",
        ["--yes", "base44", "eject", "--app-id", base44AppId, "--path", tmpDir!, "--yes"],
        {
          env: {
            ...process.env,
            BASE44_API_KEY: base44ApiKey,
            BASE44_APP_ID: base44AppId,
            FORCE_COLOR: "0",
          },
        }
      );

      proc.stdout.on("data", (c: Buffer) => cliLogs.push(c.toString()));
      proc.stderr.on("data", (c: Buffer) => cliLogs.push(c.toString()));
      proc.on("error", reject);
      proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
      setTimeout(() => { proc.kill(); reject(new Error("Timeout")); }, 120_000);
    });

    const files = await walkDir(tmpDir);
    if (files.length === 0) {
      res.status(500).json({ error: "Eject produced no files.", logs: cliLogs.join("") });
      return;
    }

    const { commitUrl, filesCount } = await pushFilesToGitHub({
      token: githubToken, owner: githubOwner, repo: githubRepo, branch, commitMessage, files,
    });

    res.json({ success: true, filesCount, commitUrl, message: `Ejected ${filesCount} files`, logs: cliLogs.join("") });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  } finally {
    if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

export default router;
