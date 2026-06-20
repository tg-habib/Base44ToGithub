import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

/**
 * POST /auth/device/start
 * Initiates the GitHub Device Authorization Flow.
 * Returns user_code + verification_uri to display to the user.
 * Requires GITHUB_CLIENT_ID env var (set a GitHub OAuth App Client ID).
 */
router.post("/auth/device/start", async (req: Request, res: Response) => {
  if (!CLIENT_ID) {
    res.status(503).json({
      error: "GitHub OAuth is not configured. Set the GITHUB_CLIENT_ID environment variable.",
    });
    return;
  }

  try {
    const r = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: CLIENT_ID, scope: "repo" }),
    });

    if (!r.ok) {
      const text = await r.text();
      res.status(502).json({ error: `GitHub error: ${text}` });
      return;
    }

    const data = (await r.json()) as {
      device_code: string;
      user_code: string;
      verification_uri: string;
      expires_in: number;
      interval: number;
      error?: string;
    };

    if (data.error) {
      res.status(400).json({ error: data.error });
      return;
    }

    res.json({
      device_code: data.device_code,
      user_code: data.user_code,
      verification_uri: data.verification_uri,
      expires_in: data.expires_in,
      interval: data.interval,
    });
  } catch {
    res.status(500).json({ error: "Failed to start GitHub device flow" });
  }
});

/**
 * POST /auth/device/poll
 * Poll GitHub for the access token using the device_code.
 * Returns { status: "pending" | "success" | "expired" | "denied", token?, login?, avatar_url? }
 */
router.post("/auth/device/poll", async (req: Request, res: Response) => {
  if (!CLIENT_ID) {
    res.status(503).json({ error: "GitHub OAuth is not configured." });
    return;
  }

  const { device_code } = req.body as { device_code?: string };
  if (!device_code || typeof device_code !== "string") {
    res.status(400).json({ error: "device_code is required" });
    return;
  }

  try {
    const body: Record<string, string> = {
      client_id: CLIENT_ID,
      device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    };
    // GitHub OAuth Apps require the client_secret in the token exchange step
    if (CLIENT_SECRET) body.client_secret = CLIENT_SECRET;

    const r = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });

    const data = (await r.json()) as {
      access_token?: string;
      token_type?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (data.access_token) {
      let login = "";
      let avatar_url = "";
      try {
        const userRes = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
            Accept: "application/vnd.github+json",
          },
        });
        if (userRes.ok) {
          const user = (await userRes.json()) as { login: string; avatar_url: string };
          login = user.login;
          avatar_url = user.avatar_url;
        }
      } catch { /* noop */ }

      res.json({ status: "success", token: data.access_token, login, avatar_url });
      return;
    }

    if (data.error === "authorization_pending") {
      res.json({ status: "pending" });
      return;
    }

    if (data.error === "slow_down") {
      // GitHub wants us to slow down; still pending but we acknowledge it
      res.json({ status: "pending" });
      return;
    }

    if (data.error === "expired_token") {
      res.json({ status: "expired" });
      return;
    }

    if (data.error === "access_denied") {
      res.json({ status: "denied" });
      return;
    }

    // Any other error (e.g. incorrect_client_credentials, bad_verification_code)
    // surface it rather than silently looping as "pending"
    res.json({
      status: "error",
      error: data.error ?? "unknown_error",
      error_description: data.error_description ?? "GitHub returned an unexpected error during token exchange.",
    });
  } catch {
    res.status(500).json({ error: "Failed to poll device flow" });
  }
});

export default router;
