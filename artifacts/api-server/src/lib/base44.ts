import { logger } from "./logger";

const BASE44_API = "https://base44.app/api";

export interface Base44File {
  path: string;
  content: string;
  size: number;
  type: string;
}

export interface Base44AppInfo {
  appName: string;
  files: Base44File[];
}

function headers(appId: string, apiKey: string): Record<string, string> {
  return {
    "X-App-Id": appId,
    "api_key": apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function get(path: string, appId: string, apiKey: string): Promise<Response> {
  return fetch(`${BASE44_API}${path}`, {
    method: "GET",
    headers: headers(appId, apiKey),
  });
}

function detectType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript-react",
    js: "javascript", jsx: "javascript-react",
    json: "json", css: "css", html: "html",
    md: "markdown", yaml: "yaml", yml: "yaml",
    env: "env", toml: "toml", sh: "shell", py: "python",
  };
  return map[ext] ?? "text";
}

function toContent(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

async function verifyCredentials(appId: string, apiKey: string): Promise<string> {
  const res = await get(`/apps/${appId}/entities`, appId, apiKey);
  if (res.status === 401 || res.status === 403) {
    throw new Error("Invalid Base44 credentials. Check your App ID and API Key.");
  }
  if (res.ok) {
    const data = await res.json() as unknown;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const obj = data as Record<string, unknown>;
      return String(obj.name ?? obj.appName ?? obj.app_name ?? appId);
    }
  }
  return appId;
}

async function fetchEntities(appId: string, apiKey: string): Promise<Base44File[]> {
  const res = await get(`/apps/${appId}/entities`, appId, apiKey);
  if (!res.ok) return [];
  const data = await res.json() as unknown;

  const files: Base44File[] = [];

  if (Array.isArray(data)) {
    for (const entity of data as Array<Record<string, unknown>>) {
      const name = String(entity.name ?? entity.entityName ?? "Entity");
      const content = JSON.stringify(entity, null, 2);
      files.push({
        path: `entities/${name}.json`,
        content,
        size: Buffer.byteLength(content, "utf8"),
        type: "json",
      });
    }
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (obj.entities && Array.isArray(obj.entities)) {
      return fetchEntities(appId, apiKey);
    }
    for (const [key, value] of Object.entries(obj)) {
      const content = toContent(value);
      files.push({
        path: `entities/${key}.json`,
        content,
        size: Buffer.byteLength(content, "utf8"),
        type: "json",
      });
    }
  }

  return files;
}

async function fetchFunctions(appId: string, apiKey: string): Promise<Base44File[]> {
  const res = await get(`/apps/${appId}/functions`, appId, apiKey);
  if (!res.ok) return [];

  const data = await res.json() as unknown;
  const files: Base44File[] = [];

  if (Array.isArray(data)) {
    for (const fn of data as Array<Record<string, unknown>>) {
      const name = String(fn.name ?? fn.functionName ?? "function");
      const code = fn.code ?? fn.body ?? fn.source;
      if (code) {
        const content = String(code);
        files.push({
          path: `functions/${name}.js`,
          content,
          size: Buffer.byteLength(content, "utf8"),
          type: "javascript",
        });
      } else {
        const content = JSON.stringify(fn, null, 2);
        files.push({
          path: `functions/${name}.json`,
          content,
          size: Buffer.byteLength(content, "utf8"),
          type: "json",
        });
      }
    }
  }

  return files;
}

async function tryExportEndpoints(appId: string, apiKey: string): Promise<Base44File[] | null> {
  const exportPaths = [
    `/apps/${appId}/export`,
    `/apps/${appId}/export/code`,
    `/apps/${appId}/code`,
    `/apps/${appId}/download`,
    `/apps/${appId}/source`,
  ];

  for (const path of exportPaths) {
    try {
      const res = await get(path, appId, apiKey);
      if (!res.ok) continue;

      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("application/zip") || contentType.includes("application/octet-stream")) {
        logger.info({ path }, "Base44 export returned a ZIP — extraction not supported server-side");
        continue;
      }

      const data = await res.json() as unknown;
      const files = await buildFilesFromExport(data);
      if (files.length > 0) {
        logger.info({ path, count: files.length }, "Base44 export succeeded");
        return files;
      }
    } catch {
    }
  }

  return null;
}

async function buildFilesFromExport(data: unknown): Promise<Base44File[]> {
  if (!data || typeof data !== "object") return [];

  const files: Base44File[] = [];

  if (Array.isArray(data)) {
    for (const f of data as Array<Record<string, unknown>>) {
      const path = String(f.path ?? f.name ?? f.filename ?? "file.txt");
      const content = toContent(f.content ?? f.code ?? f.body ?? f);
      files.push({ path, content, size: Buffer.byteLength(content, "utf8"), type: detectType(path) });
    }
    return files;
  }

  const obj = data as Record<string, unknown>;

  if (obj.files && Array.isArray(obj.files)) {
    return buildFilesFromExport(obj.files);
  }

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string" && key.includes("/")) {
      files.push({ path: key, content: value, size: Buffer.byteLength(value, "utf8"), type: detectType(key) });
    }
  }

  return files;
}

async function generateSdkSetup(appId: string, appName: string): Promise<Base44File[]> {
  const sdkSetup = `import { createClient } from '@base44/sdk';

const base44 = createClient({
  appId: "${appId}",
  headers: {
    "api_key": process.env.BASE44_API_KEY,
  },
});

export default base44;
`;

  const readme = `# ${appName}

This repository was exported from [Base44](https://base44.com).

## App ID

\`${appId}\`

## Setup

\`\`\`bash
npm install @base44/sdk
\`\`\`

\`\`\`typescript
import { createClient } from '@base44/sdk';

const base44 = createClient({
  appId: "${appId}",
  headers: {
    "api_key": process.env.BASE44_API_KEY,
  },
});
\`\`\`

## Structure

- \`entities/\` — Entity schema definitions
- \`functions/\` — Backend function source code
- \`base44-client.js\` — Pre-configured SDK client
`;

  return [
    {
      path: "base44-client.js",
      content: sdkSetup,
      size: Buffer.byteLength(sdkSetup, "utf8"),
      type: "javascript",
    },
    {
      path: "README.md",
      content: readme,
      size: Buffer.byteLength(readme, "utf8"),
      type: "markdown",
    },
  ];
}

export async function fetchBase44App(appId: string, apiKey: string): Promise<Base44AppInfo> {
  let appName = appId;

  try {
    appName = await verifyCredentials(appId, apiKey);
  } catch (err) {
    throw err;
  }

  const allFiles: Base44File[] = [];

  const exportFiles = await tryExportEndpoints(appId, apiKey);
  if (exportFiles && exportFiles.length > 0) {
    return { appName, files: exportFiles };
  }

  const [entityFiles, functionFiles, sdkFiles] = await Promise.all([
    fetchEntities(appId, apiKey),
    fetchFunctions(appId, apiKey),
    generateSdkSetup(appId, appName),
  ]);

  allFiles.push(...entityFiles, ...functionFiles, ...sdkFiles);

  if (allFiles.length === 0) {
    throw new Error(
      `No exportable content found for app ${appId}. ` +
      `The app may have no entities or functions yet, or the API doesn't support code export.`,
    );
  }

  logger.info(
    { appId, appName, entityCount: entityFiles.length, functionCount: functionFiles.length },
    "Base44 app fetched",
  );

  return { appName, files: allFiles };
}
