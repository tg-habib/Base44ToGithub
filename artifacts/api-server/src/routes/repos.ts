import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

interface GithubRepo {
  name: string;
  full_name: string;
  private: boolean;
  owner: { login: string };
  updated_at: string;
  description: string | null;
}

router.get("/repos", async (req: Request, res: Response): Promise<void> => {
  const token = req.query.token as string;
  if (!token) {
    res.status(400).json({ error: "Missing token parameter" });
    return;
  }

  try {
    const allRepos: GithubRepo[] = [];
    let page = 1;

    while (true) {
      const r = await fetch(
        `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
      );

      if (!r.ok) {
        const text = await r.text();
        res.status(r.status).json({ error: `GitHub API error: ${text}` });
        return;
      }

      const pageRepos = (await r.json()) as GithubRepo[];
      allRepos.push(...pageRepos);

      if (pageRepos.length < 100) break;
      page++;
      if (page > 5) break;
    }

    res.json({
      repos: allRepos.map((r) => ({
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        owner: r.owner.login,
        updatedAt: r.updated_at,
        description: r.description,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
