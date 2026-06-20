export interface GitHubFile {
  path: string;
  content: string;
}

interface GitRef {
  ref: string;
  object: { sha: string };
}

interface GitCommit {
  sha: string;
  tree: { sha: string };
  html_url: string;
}

interface GitTree {
  sha: string;
}

interface GitBlob {
  sha: string;
}

interface NewCommit {
  sha: string;
  html_url: string;
}

interface RepoInfo {
  default_branch: string;
  size: number;
}

interface ContentsResponse {
  commit: { sha: string; html_url: string };
}

const GH_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
});

async function githubRequest<T>(
  method: string,
  url: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: GH_HEADERS(token),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${method} ${url} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

async function githubGet<T>(url: string, token: string): Promise<T | null> {
  const res = await fetch(url, { method: "GET", headers: GH_HEADERS(token) });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

async function createBlobs(
  base: string,
  token: string,
  files: GitHubFile[],
): Promise<Array<{ path: string; sha: string; mode: string; type: string }>> {
  return Promise.all(
    files.map(async (file) => {
      const blob = await githubRequest<GitBlob>("POST", `${base}/git/blobs`, token, {
        content: Buffer.from(file.content).toString("base64"),
        encoding: "base64",
      });
      return { path: file.path, sha: blob.sha, mode: "100644", type: "blob" };
    }),
  );
}

async function pushToExistingBranch(params: {
  base: string;
  token: string;
  branch: string;
  commitMessage: string;
  files: GitHubFile[];
  branchSha: string;
}): Promise<{ commitUrl: string; filesCount: number }> {
  const { base, token, branch, commitMessage, files, branchSha } = params;

  const commitData = await githubRequest<GitCommit>(
    "GET",
    `${base}/git/commits/${branchSha}`,
    token,
  );

  const blobs = await createBlobs(base, token, files);

  const tree = await githubRequest<GitTree>("POST", `${base}/git/trees`, token, {
    base_tree: commitData.tree.sha,
    tree: blobs,
  });

  const newCommit = await githubRequest<NewCommit>("POST", `${base}/git/commits`, token, {
    message: commitMessage,
    tree: tree.sha,
    parents: [branchSha],
  });

  await githubRequest("PATCH", `${base}/git/refs/heads/${branch}`, token, {
    sha: newCommit.sha,
    force: false,
  });

  return { commitUrl: newCommit.html_url, filesCount: files.length };
}

/**
 * GitHub returns 409 "Git Repository is empty" for ALL git data API calls
 * (blobs, trees, commits) on repos that have never had a single commit.
 * Work around this by first seeding the repo via the Contents API (the only
 * API that works on truly empty repos), then doing the full bulk push via
 * the Git Data API on top of that seed commit — giving one final commit.
 */
async function seedEmptyRepoAndPush(params: {
  base: string;
  token: string;
  branch: string;
  commitMessage: string;
  files: GitHubFile[];
}): Promise<{ commitUrl: string; filesCount: number }> {
  const { base, token, branch, commitMessage, files } = params;

  const seedFile = files[0];

  const initResponse = await githubRequest<ContentsResponse>(
    "PUT",
    `${base}/contents/${seedFile.path}`,
    token,
    {
      message: "chore: initialise repository",
      content: Buffer.from(seedFile.content).toString("base64"),
      branch,
    },
  );

  const initSha = initResponse.commit.sha;

  return pushToExistingBranch({
    base,
    token,
    branch,
    commitMessage,
    files,
    branchSha: initSha,
  });
}

async function pushAsInitialCommit(params: {
  base: string;
  token: string;
  branch: string;
  commitMessage: string;
  files: GitHubFile[];
}): Promise<{ commitUrl: string; filesCount: number }> {
  const { base, token, branch, commitMessage, files } = params;

  try {
    const blobs = await createBlobs(base, token, files);

    const tree = await githubRequest<GitTree>("POST", `${base}/git/trees`, token, {
      tree: blobs,
    });

    const newCommit = await githubRequest<NewCommit>("POST", `${base}/git/commits`, token, {
      message: commitMessage,
      tree: tree.sha,
      parents: [],
    });

    await githubRequest("POST", `${base}/git/refs`, token, {
      ref: `refs/heads/${branch}`,
      sha: newCommit.sha,
    });

    return { commitUrl: newCommit.html_url, filesCount: files.length };
  } catch (err) {
    if (err instanceof Error && err.message.includes("409")) {
      return seedEmptyRepoAndPush({ base, token, branch, commitMessage, files });
    }
    throw err;
  }
}

export async function pushFilesToGitHub(params: {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  commitMessage: string;
  files: GitHubFile[];
}): Promise<{ commitUrl: string; filesCount: number }> {
  const { token, owner, repo, branch, commitMessage, files } = params;
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  const repoInfo = await githubGet<RepoInfo>(base, token);
  if (!repoInfo) {
    throw new Error(
      `Repository "${owner}/${repo}" not found. Make sure it exists on GitHub and your token has access to it.`,
    );
  }

  const branchRef = await githubGet<GitRef>(
    `${base}/git/refs/heads/${branch}`,
    token,
  );

  if (branchRef) {
    return pushToExistingBranch({
      base, token, branch, commitMessage, files,
      branchSha: branchRef.object.sha,
    });
  }

  if (repoInfo.size === 0) {
    return seedEmptyRepoAndPush({ base, token, branch, commitMessage, files });
  }

  const defaultRef = await githubGet<GitRef>(
    `${base}/git/refs/heads/${repoInfo.default_branch}`,
    token,
  );

  if (defaultRef) {
    return pushToExistingBranch({
      base, token, branch, commitMessage, files,
      branchSha: defaultRef.object.sha,
    });
  }

  return pushAsInitialCommit({ base, token, branch, commitMessage, files });
}
