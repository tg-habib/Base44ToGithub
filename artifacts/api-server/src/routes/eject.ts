import { Router, type IRouter } from "express";
import { EjectAndPushBody } from "@workspace/api-zod";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { pushFilesToGitHub } from "../lib/github";
import { logger } from "../lib/logger";

const execFileAsync = promisify(execFile);

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

router.post("/eject", async (req, res): Promise<void> => {
  const parsed = EjectAndPushBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { base44AppId, base44ApiKey, githubToken, githubOwner, githubRepo, branch, commitMessage } =
    parsed.data;

  let tmpDir: string | null = null;
  let cliLogs = "";

  try {
    tmpDir = await mkdtemp(join(tmpdir(), "b44-eject-"));
    logger.info({ tmpDir, base44AppId }, "Starting base44 eject");

    try {
      const { stdout, stderr } = await execFileAsync(
        "npx",
        ["--yes", "base44", "eject", "--app-id", base44AppId, "--path", tmpDir, "--yes"],
        {
          env: {
            ...process.env,
            BASE44_API_KEY: base44ApiKey,
            BASE44_APP_ID: base44AppId,
          },
          timeout: 120_000,
          maxBuffer: 10 * 1024 * 1024,
        }
      );
      cliLogs = [stdout, stderr].filter(Boolean).join("\n");
    } catch (execErr) {
      const err = execErr as { stdout?: string; stderr?: string; message?: string };
      cliLogs = [err.stdout, err.stderr].filter(Boolean).join("\n");
      logger.error({ err, cliLogs }, "base44 eject command failed");
      res.status(500).json({
        error: `base44 eject failed: ${err.message ?? "unknown error"}. Logs: ${cliLogs.slice(0, 500)}`,
      });
      return;
    }

    logger.info({ tmpDir, cliLogs }, "base44 eject completed, reading files");

    const files = await walkDir(tmpDir);
    if (files.length === 0) {
      res.status(500).json({
        error: "base44 eject ran but produced no files. Check your App ID and API Key.",
        logs: cliLogs,
      });
      return;
    }

    logger.info({ fileCount: files.length, githubOwner, githubRepo, branch }, "Pushing ejected files to GitHub");

    const { commitUrl, filesCount } = await pushFilesToGitHub({
      token: githubToken,
      owner: githubOwner,
      repo: githubRepo,
      branch,
      commitMessage,
      files,
    });

    res.json({
      success: true,
      filesCount,
      commitUrl,
      message: `Successfully ejected ${filesCount} file${filesCount !== 1 ? "s" : ""} to ${githubOwner}/${githubRepo}@${branch}`,
      logs: cliLogs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err }, "Eject route error");
    res.status(500).json({ error: message });
  } finally {
    if (tmpDir) {
      rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
});

export default router;
