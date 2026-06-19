export interface GitHubFile {
  path: string;
  content: string;
}

interface GitRef {
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

async function githubRequest<T>(
  method: string,
  url: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${method} ${url} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
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

  const refData = await githubRequest<GitRef>(
    "GET",
    `${base}/git/refs/heads/${branch}`,
    token,
  );
  const latestCommitSha = refData.object.sha;

  const commitData = await githubRequest<GitCommit>(
    "GET",
    `${base}/git/commits/${latestCommitSha}`,
    token,
  );
  const baseTreeSha = commitData.tree.sha;

  const blobs = await Promise.all(
    files.map(async (file) => {
      const blob = await githubRequest<GitBlob>(
        "POST",
        `${base}/git/blobs`,
        token,
        { content: Buffer.from(file.content).toString("base64"), encoding: "base64" },
      );
      return { path: file.path, sha: blob.sha, mode: "100644", type: "blob" };
    }),
  );

  const tree = await githubRequest<GitTree>(
    "POST",
    `${base}/git/trees`,
    token,
    { base_tree: baseTreeSha, tree: blobs },
  );

  const newCommit = await githubRequest<NewCommit>(
    "POST",
    `${base}/git/commits`,
    token,
    {
      message: commitMessage,
      tree: tree.sha,
      parents: [latestCommitSha],
    },
  );

  await githubRequest(
    "PATCH",
    `${base}/git/refs/heads/${branch}`,
    token,
    { sha: newCommit.sha, force: false },
  );

  return { commitUrl: newCommit.html_url, filesCount: files.length };
}
