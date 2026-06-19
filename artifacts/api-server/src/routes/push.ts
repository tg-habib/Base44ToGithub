import { Router, type IRouter } from "express";
import {
  PushToGithubBody,
  PreviewBase44FilesBody,
} from "@workspace/api-zod";
import { fetchBase44App } from "../lib/base44";
import { pushFilesToGitHub } from "../lib/github";

const router: IRouter = Router();

router.post("/preview", async (req, res): Promise<void> => {
  const parsed = PreviewBase44FilesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { base44AppId, base44ApiKey } = parsed.data;

  try {
    const appInfo = await fetchBase44App(base44AppId, base44ApiKey);
    res.json({
      appName: appInfo.appName,
      files: appInfo.files.map((f) => ({
        path: f.path,
        size: f.size,
        type: f.type,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err }, "Failed to fetch Base44 app");
    res.status(500).json({ error: message });
  }
});

router.post("/push", async (req, res): Promise<void> => {
  const parsed = PushToGithubBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    base44AppId,
    base44ApiKey,
    githubToken,
    githubOwner,
    githubRepo,
    branch,
    commitMessage,
  } = parsed.data;

  try {
    const appInfo = await fetchBase44App(base44AppId, base44ApiKey);

    if (appInfo.files.length === 0) {
      res.status(400).json({ error: "No files found in the Base44 app to push." });
      return;
    }

    const { commitUrl, filesCount } = await pushFilesToGitHub({
      token: githubToken,
      owner: githubOwner,
      repo: githubRepo,
      branch: branch ?? "main",
      commitMessage: commitMessage ?? "chore: sync from Base44",
      files: appInfo.files.map((f) => ({ path: f.path, content: f.content })),
    });

    res.json({
      success: true,
      filesCount,
      commitUrl,
      message: `Successfully pushed ${filesCount} file${filesCount !== 1 ? "s" : ""} to ${githubOwner}/${githubRepo}@${branch ?? "main"}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err }, "Failed to push to GitHub");
    res.status(500).json({ error: message });
  }
});

export default router;
