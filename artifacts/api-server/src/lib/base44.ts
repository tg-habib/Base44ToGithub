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

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type JsonObj = { [k: string]: Json };

function runtimeHeaders(appId: string, apiKey: string): Record<string, string> {
  return {
    "X-App-Id": appId,
    "api_key": apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function studioHeaders(apiKey: string): Record<string, string> {
  return {
    "api_key": apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
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
  return {
    path,
    content,
    size: Buffer.byteLength(content, "utf8"),
    type: detectType(path),
  };
}

async function safeGet(url: string, headers: Record<string, string>): Promise<Json | null> {
  try {
    const res = await fetch(url, { method: "GET", headers });
    if (res.status === 401 || res.status === 403) {
      throw new Error("UNAUTHORIZED");
    }
    if (!res.ok) return null;
    return await res.json() as Json;
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") throw err;
    return null;
  }
}

function extractName(data: Json): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const obj = data as JsonObj;
  const name = obj["name"] ?? obj["appName"] ?? obj["app_name"] ?? obj["title"];
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

function extractEntitiesFromResponse(data: Json): Base44File[] {
  const files: Base44File[] = [];

  if (!data || typeof data !== "object") return files;

  const obj = data as JsonObj;

  logger.info(
    { keys: Object.keys(obj), types: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, Array.isArray(v) ? `array(${(v as Json[]).length})` : typeof v])) },
    "Base44 app response shape",
  );

  const candidateKeys = ["entities", "entitySchemas", "entity_schemas", "schema", "models", "collections", "tables"];
  for (const key of candidateKeys) {
    const val = obj[key];
    if (!val) continue;

    if (Array.isArray(val) && val.length > 0) {
      for (const entity of val as JsonObj[]) {
        const name = String(entity["name"] ?? entity["entityName"] ?? entity["type"] ?? "entity");
        files.push(toFile(`entities/${name}.json`, JSON.stringify(entity, null, 2)));
      }
      if (files.length > 0) {
        logger.info({ key, count: files.length }, "Extracted entities from app metadata");
        return files;
      }
    } else if (typeof val === "object" && !Array.isArray(val)) {
      const nested = val as JsonObj;
      for (const [entityName, schema] of Object.entries(nested)) {
        files.push(toFile(`entities/${entityName}.json`, JSON.stringify(schema, null, 2)));
      }
      if (files.length > 0) {
        logger.info({ key, count: files.length }, "Extracted entities from app metadata (object form)");
        return files;
      }
    }
  }

  logger.info({ keys: Object.keys(obj) }, "No entity schemas found in app metadata — full keys logged");
  return files;
}

function extractFunctionsFromResponse(data: Json): Base44File[] {
  const files: Base44File[] = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return files;
  const obj = data as JsonObj;

  const candidateKeys = ["functions", "backendFunctions", "backend_functions", "serverFunctions", "server_functions"];
  for (const key of candidateKeys) {
    const val = obj[key];
    if (!val || !Array.isArray(val) || val.length === 0) continue;

    for (const fn of val as JsonObj[]) {
      const name = String(fn["name"] ?? fn["functionName"] ?? "function");
      const code = fn["code"] ?? fn["body"] ?? fn["source"];
      if (typeof code === "string" && code.trim()) {
        files.push(toFile(`functions/${name}.js`, code));
      } else {
        files.push(toFile(`functions/${name}.json`, JSON.stringify(fn, null, 2)));
      }
    }
    if (files.length > 0) return files;
  }
  return files;
}

async function fetchAppMetadata(appId: string, apiKey: string): Promise<{ appName: string; raw: Json | null }> {
  const endpoints: Array<{ url: string; headers: Record<string, string> }> = [
    { url: `${STUDIO_API}/apps/${appId}`, headers: studioHeaders(apiKey) },
    { url: `${STUDIO_API}/apps/${appId}?include=entities,functions,schema`, headers: studioHeaders(apiKey) },
    { url: `${STUDIO_API}/studio/apps/${appId}`, headers: studioHeaders(apiKey) },
    { url: `${RUNTIME_API}/apps/${appId}`, headers: runtimeHeaders(appId, apiKey) },
  ];

  for (const { url, headers } of endpoints) {
    try {
      const data = await safeGet(url, headers);
      if (!data) continue;

      const name = extractName(data);
      if (name) {
        logger.info({ url, name }, "App metadata fetched from Base44");
        return { appName: name, raw: data };
      }
    } catch (err) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") {
        throw new Error("Invalid Base44 credentials. Check your App ID and API Key.");
      }
    }
  }

  const probe = await fetch(`${RUNTIME_API}/apps/${appId}/entities/User`, {
    method: "GET",
    headers: runtimeHeaders(appId, apiKey),
  });
  if (probe.status === 401 || probe.status === 403) {
    throw new Error("Invalid Base44 credentials. Check your App ID and API Key.");
  }

  return { appName: appId, raw: null };
}

async function fetchEntitySchemasFromDedicatedEndpoints(
  appId: string,
  apiKey: string,
): Promise<Base44File[]> {
  const endpoints: Array<{ url: string; headers: Record<string, string> }> = [
    { url: `${STUDIO_API}/apps/${appId}/entities`, headers: studioHeaders(apiKey) },
    { url: `${STUDIO_API}/apps/${appId}/schema`, headers: studioHeaders(apiKey) },
    { url: `${STUDIO_API}/apps/${appId}/entity-schemas`, headers: studioHeaders(apiKey) },
    { url: `${STUDIO_API}/apps/${appId}/models`, headers: studioHeaders(apiKey) },
    { url: `${STUDIO_API}/studio/apps/${appId}/entities`, headers: studioHeaders(apiKey) },
    { url: `${STUDIO_API}/studio/apps/${appId}/schema`, headers: studioHeaders(apiKey) },
    { url: `${RUNTIME_API}/apps/${appId}/schema`, headers: runtimeHeaders(appId, apiKey) },
    { url: `${RUNTIME_API}/apps/${appId}/entities`, headers: runtimeHeaders(appId, apiKey) },
  ];

  for (const { url, headers } of endpoints) {
    const data = await safeGet(url, headers).catch(() => null);
    if (!data) continue;

    const files: Base44File[] = [];

    if (Array.isArray(data) && data.length > 0) {
      for (const entity of data as JsonObj[]) {
        const name = String(entity["name"] ?? entity["entityName"] ?? "entity");
        files.push(toFile(`entities/${name}.json`, JSON.stringify(entity, null, 2)));
      }
      if (files.length > 0) {
        logger.info({ url, count: files.length }, "Entities fetched from dedicated endpoint");
        return files;
      }
    }

    if (data && typeof data === "object" && !Array.isArray(data)) {
      const extracted = extractEntitiesFromResponse(data);
      if (extracted.length > 0) return extracted;
    }
  }

  return [];
}

function generateSetupFiles(appId: string, appName: string): Base44File[] {
  const displayName = appName !== appId ? appName : "Base44 App";

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

  const readme = `# ${displayName}

**App ID:** \`${appId}\`

Exported from [Base44](https://app.base44.com) on ${new Date().toISOString().split("T")[0]}.

## Setup

\`\`\`bash
npm install @base44/sdk
\`\`\`

Copy \`.env.example\` to \`.env\` and fill in your API key.

\`\`\`typescript
import base44 from './base44-client';

// List all records for an entity
const records = await base44.entities.MyEntity.list();

// Get a specific record
const item = await base44.entities.MyEntity.get('record-id');

// Create a new record
const created = await base44.entities.MyEntity.create({ field: 'value' });
\`\`\`

## Structure

| Path | Description |
|------|-------------|
| \`base44-client.js\` | Pre-configured SDK client |
| \`.env.example\` | Environment variable template |
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
  const { appName, raw } = await fetchAppMetadata(appId, apiKey);

  let entityFiles: Base44File[] = [];
  let functionFiles: Base44File[] = [];

  if (raw) {
    entityFiles = extractEntitiesFromResponse(raw);
    functionFiles = extractFunctionsFromResponse(raw);
  }

  if (entityFiles.length === 0) {
    entityFiles = await fetchEntitySchemasFromDedicatedEndpoints(appId, apiKey);
  }

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

  return {
    appName: appName !== appId ? appName : "Base44 App",
    files: allFiles,
  };
}
