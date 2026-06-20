import { logger } from "./logger";

const RUNTIME_API = "https://base44.app/api";
const STUDIO_API = "https://app.base44.com/api";

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

function runtimeHeaders(appId: string, apiKey: string): Record<string, string> {
  return {
    "X-App-Id": appId,
    "api_key": apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function runtimeGet(path: string, appId: string, apiKey: string): Promise<Response> {
  return fetch(`${RUNTIME_API}${path}`, {
    method: "GET",
    headers: runtimeHeaders(appId, apiKey),
  });
}

async function studioGet(path: string, apiKey: string): Promise<Response> {
  return fetch(`${STUDIO_API}${path}`, {
    method: "GET",
    headers: {
      "api_key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
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

function toFile(path: string, content: string): Base44File {
  const str = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  return { path, content: str, size: Buffer.byteLength(str, "utf8"), type: detectType(path) };
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function safeJson(data: JsonValue): string {
  return JSON.stringify(data, null, 2);
}

async function tryGetJson(res: Response): Promise<JsonValue | null> {
  if (!res.ok) return null;
  try { return await res.json() as JsonValue; } catch { return null; }
}

async function verifyCredentials(appId: string, apiKey: string): Promise<string> {
  const endpointsToTry = [
    `${RUNTIME_API}/apps/${appId}`,
    `${STUDIO_API}/apps/${appId}`,
    `${STUDIO_API}/studio/apps/${appId}`,
  ];

  for (const url of endpointsToTry) {
    const isRuntime = url.startsWith(RUNTIME_API);
    const headers = isRuntime ? runtimeHeaders(appId, apiKey) : {
      "api_key": apiKey, "Content-Type": "application/json", Accept: "application/json",
    };

    const res = await fetch(url, { method: "GET", headers });

    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "Invalid Base44 credentials. Check your App ID and API Key.",
      );
    }

    if (res.ok) {
      const data = await tryGetJson(res) as Record<string, JsonValue> | null;
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const name = data["name"] ?? data["appName"] ?? data["app_name"] ?? data["title"];
        if (name && typeof name === "string") return name;
      }
    }
  }

  const probe = await runtimeGet(`/apps/${appId}/entities/User`, appId, apiKey);
  if (probe.status === 401 || probe.status === 403) {
    throw new Error("Invalid Base44 credentials. Check your App ID and API Key.");
  }

  return appId;
}

interface EntitySchema {
  name: string;
  fields?: Array<{ name: string; type: string; required?: boolean }>;
  [key: string]: JsonValue | undefined;
}

async function fetchEntitySchemas(appId: string, apiKey: string): Promise<Base44File[]> {
  const schemaPaths = [
    `${RUNTIME_API}/apps/${appId}/schema`,
    `${RUNTIME_API}/apps/${appId}/entities-schema`,
    `${RUNTIME_API}/apps/${appId}/entities`,
    `${STUDIO_API}/apps/${appId}/schema`,
    `${STUDIO_API}/apps/${appId}/entities`,
    `${STUDIO_API}/studio/apps/${appId}/schema`,
  ];

  for (const url of schemaPaths) {
    const isRuntime = url.startsWith(RUNTIME_API);
    const headers = isRuntime ? runtimeHeaders(appId, apiKey) : {
      "api_key": apiKey, "Content-Type": "application/json", Accept: "application/json",
    };

    try {
      const res = await fetch(url, { method: "GET", headers });
      if (!res.ok) continue;

      const data = await tryGetJson(res);
      if (!data) continue;

      logger.info({ url }, "Base44 schema endpoint responded");

      const files: Base44File[] = [];

      if (Array.isArray(data)) {
        for (const entity of data as EntitySchema[]) {
          const name = entity.name ?? entity["entityName"] ?? "entity";
          files.push(toFile(`entities/${name}.json`, safeJson(entity)));
        }
        if (files.length > 0) return files;
      } else if (data && typeof data === "object" && !Array.isArray(data)) {
        const obj = data as Record<string, JsonValue>;

        const entities = obj["entities"] ?? obj["schema"] ?? obj["entitySchemas"];
        if (entities && Array.isArray(entities)) {
          for (const entity of entities as EntitySchema[]) {
            const name = entity.name ?? entity["entityName"] ?? "entity";
            files.push(toFile(`entities/${name}.json`, safeJson(entity)));
          }
          if (files.length > 0) return files;
        }

        const knownSchemaKeys = Object.keys(obj).filter(
          (k) => !["id", "appId", "name", "createdAt", "updatedAt"].includes(k),
        );
        if (knownSchemaKeys.length > 0) {
          for (const key of knownSchemaKeys) {
            files.push(toFile(`entities/${key}.json`, safeJson(obj[key])));
          }
          if (files.length > 0) return files;
        }
      }
    } catch {
    }
  }

  return [];
}

async function fetchFunctions(appId: string, apiKey: string): Promise<Base44File[]> {
  const functionPaths = [
    `${RUNTIME_API}/apps/${appId}/functions`,
    `${STUDIO_API}/apps/${appId}/functions`,
    `${STUDIO_API}/studio/apps/${appId}/functions`,
  ];

  for (const url of functionPaths) {
    const isRuntime = url.startsWith(RUNTIME_API);
    const headers = isRuntime ? runtimeHeaders(appId, apiKey) : {
      "api_key": apiKey, "Content-Type": "application/json", Accept: "application/json",
    };

    try {
      const res = await fetch(url, { method: "GET", headers });
      if (!res.ok) continue;

      const data = await tryGetJson(res);
      if (!data || !Array.isArray(data)) continue;

      const files: Base44File[] = [];
      for (const fn of data as Array<Record<string, JsonValue>>) {
        const name = String(fn["name"] ?? fn["functionName"] ?? "function");
        const code = fn["code"] ?? fn["body"] ?? fn["source"];
        if (typeof code === "string" && code.trim()) {
          files.push(toFile(`functions/${name}.js`, code));
        } else {
          files.push(toFile(`functions/${name}.json`, safeJson(fn)));
        }
      }
      if (files.length > 0) return files;
    } catch {
    }
  }

  return [];
}

function generateSetupFiles(appId: string, appName: string): Base44File[] {
  const clientCode = `import { createClient } from '@base44/sdk';

const base44 = createClient({
  appId: "${appId}",
  headers: {
    "api_key": process.env.BASE44_API_KEY,
  },
});

export default base44;
`;

  const envExample = `# Base44 credentials
BASE44_API_KEY=your_api_key_here
`;

  const readme = `# ${appName !== appId ? appName : "Base44 App"}

**App ID:** \`${appId}\`

Exported from [Base44](https://app.base44.com) on ${new Date().toISOString().split("T")[0]}.

## Setup

\`\`\`bash
npm install @base44/sdk
\`\`\`

Copy \`.env.example\` to \`.env\` and fill in your API key.

\`\`\`typescript
import base44 from './base44-client';

// List all User records
const users = await base44.entities.User.list();

// Get a specific record
const user = await base44.entities.User.get('record-id');

// Create a new record
const newUser = await base44.entities.User.create({ email: 'user@example.com' });
\`\`\`

## Files in this repository

| File | Description |
|------|-------------|
| \`base44-client.js\` | Pre-configured SDK client |
| \`entities/\` | Entity schema definitions |
| \`functions/\` | Backend function source code |
`;

  return [
    toFile("base44-client.js", clientCode),
    toFile(".env.example", envExample),
    toFile("README.md", readme),
  ];
}

export async function fetchBase44App(appId: string, apiKey: string): Promise<Base44AppInfo> {
  let appName = appId;

  try {
    appName = await verifyCredentials(appId, apiKey);
  } catch (err) {
    throw err;
  }

  const [entityFiles, functionFiles] = await Promise.all([
    fetchEntitySchemas(appId, apiKey),
    fetchFunctions(appId, apiKey),
  ]);

  const setupFiles = generateSetupFiles(appId, appName);
  const allFiles = [...entityFiles, ...functionFiles, ...setupFiles];

  logger.info(
    {
      appId,
      appName,
      entityCount: entityFiles.length,
      functionCount: functionFiles.length,
      setupCount: setupFiles.length,
    },
    "Base44 app fetched",
  );

  return { appName: appName !== appId ? appName : "Base44 App", files: allFiles };
}
