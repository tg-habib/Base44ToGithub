import { Router, type IRouter } from "express";
import { EjectAndPushBody } from "@workspace/api-zod";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { mkdtemp, readFile, rm, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { Readable } from "node:stream";
import tar from "tar-stream";
import { pushFilesToGitHub } from "../lib/github";
import { logger } from "../lib/logger";

/* ─────────────────────────────────────────────────────────────────────────
   Direct Base44 API eject — no CLI required.
   GET https://app.base44.com/api/apps/{appId}/eject?api_key={key}
   Returns a gzipped tar archive of all source files.
────────────────────────────────────────────────────────────────────────── */

const BASE44_API_URL = process.env.BASE44_API_URL ?? "https://app.base44.com";

const SKIP_DIRS = new Set([".git", "node_modules", "dist", ".cache", ".next"]);
const MAX_FILE_SIZE = 2_000_000; // 2 MB per file

/**
 * Fetch the eject archive from Base44 and write all files to a Map.
 * Returns { path -> content } for every text file in the archive.
 */
async function fetchEjectFiles(
  appId: string,
  apiKey: string
): Promise<Array<{ path: string; content: string }>> {
  const url = `${BASE44_API_URL}/api/apps/${appId}/eject?api_key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Base44-to-GitHub/1.0" },
  });

  if (!res.ok) {
    let detail = "";
    try { detail = await res.text(); } catch { /* noop */ }
    throw new Error(`Base44 API returned ${res.status}: ${detail || res.statusText}`);
  }

  if (!res.body) throw new Error("Base44 API returned empty body");

  // Pipe: fetch body → gunzip → tar extract
  const files: Array<{ path: string; content: string }> = [];

  await new Promise<void>((resolve, reject) => {
    const extract = tar.extract();

    extract.on("entry", (header, stream, next) => {
      const filePath = header.name.replace(/^\.\//, "");

      // Skip directories and filtered paths
      const shouldSkip =
        header.type !== "file" ||
        filePath.split("/").some((part) => SKIP_DIRS.has(part)) ||
        (header.size ?? 0) > MAX_FILE_SIZE;

      if (shouldSkip) {
        stream.resume();
        stream.on("end", next);
        return;
      }

      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        try {
          const content = Buffer.concat(chunks).toString("utf8");
          files.push({ path: filePath, content });
        } catch {
          // skip binary files that can't be decoded as UTF-8
        }
        next();
      });
      stream.on("error", next);
    });

    extract.on("finish", resolve);
    extract.on("error", reject);

    // Build pipeline: fetch ReadableStream → Node Readable → gunzip → tar
    const nodeReadable = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
    nodeReadable.pipe(createGunzip()).pipe(extract);
    nodeReadable.on("error", reject);
  });

  return files;
}

const router: IRouter = Router();

/* ─────────────────────────────────────────────────────────────────────────
   POST /eject/stream  — Server-Sent Events endpoint
────────────────────────────────────────────────────────────────────────── */
router.post("/eject/stream", async (req, res): Promise<void> => {
  const parsed = EjectAndPushBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { base44AppId, base44ApiKey, githubToken, githubOwner, githubRepo, branch, commitMessage } =
    parsed.data;

  const isPrivate = Boolean((req.body as Record<string, unknown>)?.private);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const sendLog = (line: string) => sendEvent("log", { line });
  const sendError = (message: string) => sendEvent("error", { message });
  const sendResult = (data: object) => sendEvent("result", data);

  try {
    sendLog(`▶ Fetching source code from Base44 (app: ${base44AppId})…`);
    logger.info({ base44AppId }, "Fetching eject from Base44 API");

    const files = await fetchEjectFiles(base44AppId, base44ApiKey);

    if (files.length === 0) {
      sendError("Base44 returned no source files. Check your App ID and API Key.");
      res.end();
      return;
    }

    sendLog(`✓ Downloaded ${files.length} file${files.length !== 1 ? "s" : ""}`);
    sendLog(`▶ Pushing to github.com/${githubOwner}/${githubRepo}@${branch}…`);

    const { commitUrl, filesCount } = await pushFilesToGitHub({
      token: githubToken,
      owner: githubOwner,
      repo: githubRepo,
      branch,
      commitMessage,
      files,
      onLog: sendLog,
      private: isPrivate,
    });

    sendLog(`✓ ${filesCount} file${filesCount !== 1 ? "s" : ""} committed to GitHub`);
    sendLog(`✓ Done!`);

    sendResult({
      success: true,
      filesCount,
      commitUrl,
      message: `Ejected ${filesCount} files to ${githubOwner}/${githubRepo}@${branch}`,
    });

    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err }, "Eject stream error");
    sendError(message);
    res.end();
  }
});

/* ─────────────────────────────────────────────────────────────────────────
   POST /eject  — Non-streaming endpoint (kept for compatibility)
────────────────────────────────────────────────────────────────────────── */
router.post("/eject", async (req, res): Promise<void> => {
  const parsed = EjectAndPushBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { base44AppId, base44ApiKey, githubToken, githubOwner, githubRepo, branch, commitMessage } =
    parsed.data;

  try {
    const files = await fetchEjectFiles(base44AppId, base44ApiKey);

    if (files.length === 0) {
      res.status(500).json({ error: "Base44 returned no source files." });
      return;
    }

    const { commitUrl, filesCount } = await pushFilesToGitHub({
      token: githubToken, owner: githubOwner, repo: githubRepo, branch, commitMessage, files,
    });

    res.json({ success: true, filesCount, commitUrl, message: `Ejected ${filesCount} files` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
