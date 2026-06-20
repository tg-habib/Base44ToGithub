import { logger } from "./logger";

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

function runtimeHeaders(apiKey: string): Record<string, string> {
  return {
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
    const text = await res.text();
    try {
      return JSON.parse(text) as Json;
    } catch {
      return null;
    }
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") throw err;
    return null;
  }
}

// ---------- Step 1: fetch app metadata from studio API ----------

interface AppMetadata {
  appName: string;
  subdomain: string | null;
  runtimeBase: string | null;
}

async function fetchAppMetadata(appId: string, apiKey: string): Promise<AppMetadata> {
  const studioCandidates = [
    `${STUDIO_API}/apps/${appId}`,
    `${STUDIO_API}/apps/${appId}?include=all`,
    `${STUDIO_API}/studio/apps/${appId}`,
  ];

  for (const url of studioCandidates) {
    try {
      const data = await safeGet(url, studioHeaders(apiKey));
      if (!data || typeof data !== "object" || Array.isArray(data)) continue;
      const obj = data as JsonObj;

      logger.info(
        {
          url,
          keys: Object.keys(obj),
          types: Object.fromEntries(
            Object.entries(obj).map(([k, v]) => [
              k,
              Array.isArray(v) ? `array(${(v as Json[]).length})` : typeof v,
            ]),
          ),
        },
        "Base44 studio app metadata response shape",
      );

      const name = String(obj["name"] ?? obj["appName"] ?? obj["title"] ?? appId).trim();
      const subdomain =
        typeof obj["subdomain"] === "string" ? obj["subdomain"] :
        typeof obj["slug"] === "string" ? obj["slug"] :
        typeof obj["domain"] === "string" ? (obj["domain"] as string).replace(/\.base44\.app$/, "") :
        typeof obj["url"] === "string" ? extractSubdomainFromUrl(obj["url"] as string) :
        typeof obj["appUrl"] === "string" ? extractSubdomainFromUrl(obj["appUrl"] as string) :
        typeof obj["app_url"] === "string" ? extractSubdomainFromUrl(obj["app_url"] as string) :
        null;

      const runtimeBase = subdomain ? `https://${subdomain}.base44.app/api` : null;

      logger.info({ appId, name, subdomain, runtimeBase, url }, "App metadata resolved");
      return { appName: name, subdomain, runtimeBase };
    } catch (err) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") {
        throw new Error("Invalid Base44 credentials. Check your App ID and API Key.");
      }
    }
  }

  // Last resort: probe runtime API using appId as subdomain candidate — won't work,
  // but helps produce a useful error vs a silent failure.
  throw new Error(
    "Could not reach Base44 API. Verify your App ID is correct and that your API Key has access.",
  );
}

function extractSubdomainFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    const match = host.match(/^([^.]+)\.base44\.app$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ---------- Step 2: fetch OpenAPI spec from runtime URL ----------

interface ParsedOpenApiSpec {
  entitySchemas: Record<string, JsonObj>;
  entityNames: string[];
  rawSpec: JsonObj;
}

async function fetchOpenApiSpec(runtimeBase: string, apiKey: string): Promise<ParsedOpenApiSpec | null> {
  const candidates = [
    `${runtimeBase}/openapi.json`,
    `${runtimeBase}/openapi`,
    `${runtimeBase}/docs/openapi.json`,
    `${runtimeBase}/swagger.json`,
  ];

  for (const url of candidates) {
    const data = await safeGet(url, runtimeHeaders(apiKey)).catch(() => null);
    if (!data || typeof data !== "object" || Array.isArray(data)) continue;
    const spec = data as JsonObj;

    if (!spec["openapi"] && !spec["swagger"]) continue;

    logger.info({ url }, "OpenAPI spec fetched from Base44 runtime");

    const components = spec["components"] as JsonObj | undefined;
    const schemas = components?.["schemas"] as Record<string, JsonObj> | undefined;

    if (!schemas || Object.keys(schemas).length === 0) {
      logger.info({ url }, "OpenAPI spec has no schemas in components");
      return { entitySchemas: {}, entityNames: [], rawSpec: spec };
    }

    const entityNames = Object.keys(schemas);
    logger.info({ count: entityNames.length, entities: entityNames }, "Entities found in OpenAPI spec");

    return { entitySchemas: schemas, entityNames, rawSpec: spec };
  }

  return null;
}

// ---------- Step 3: generate files from OpenAPI spec ----------

function schemasToFiles(schemas: Record<string, JsonObj>): Base44File[] {
  const files: Base44File[] = [];

  for (const [entityName, schema] of Object.entries(schemas)) {
    files.push(toFile(`entities/${entityName}.json`, JSON.stringify(schema, null, 2)));
  }

  // Also generate TypeScript interfaces
  const tsLines = [
    `// Auto-generated from Base44 OpenAPI spec`,
    `// Do not edit manually — regenerate by running the Base44 to GitHub export tool`,
    ``,
  ];

  for (const [entityName, schema] of Object.entries(schemas)) {
    const props = (schema["properties"] as Record<string, JsonObj>) ?? {};
    const required = (schema["required"] as string[]) ?? [];
    const description = schema["description"] as string | undefined;

    if (description) tsLines.push(`/** ${description} */`);
    tsLines.push(`export interface ${entityName} {`);

    for (const [propName, propSchema] of Object.entries(props)) {
      const propObj = propSchema as JsonObj;
      const isRequired = required.includes(propName);
      const tsType = jsonSchemaTypeToTs(propObj);
      const desc = propObj["description"] as string | undefined;
      if (desc) tsLines.push(`  /** ${desc} */`);
      tsLines.push(`  ${propName}${isRequired ? "" : "?"}: ${tsType};`);
    }

    tsLines.push(`}`, ``);
  }

  files.push(toFile("types.ts", tsLines.join("\n")));

  return files;
}

function jsonSchemaTypeToTs(schema: JsonObj): string {
  const type = schema["type"] as string | undefined;
  const enumVals = schema["enum"] as string[] | undefined;

  if (enumVals) return enumVals.map((e) => JSON.stringify(e)).join(" | ");

  switch (type) {
    case "string": return "string";
    case "integer":
    case "number": return "number";
    case "boolean": return "boolean";
    case "array": {
      const items = schema["items"] as JsonObj | undefined;
      return items ? `${jsonSchemaTypeToTs(items)}[]` : "unknown[]";
    }
    case "object": return "Record<string, unknown>";
    default: return "unknown";
  }
}

// ---------- Step 4: generate setup files ----------

function generateSetupFiles(appId: string, appName: string, runtimeBase: string | null, openApiSpec: ParsedOpenApiSpec | null): Base44File[] {
  const displayName = appName;
  const apiBase = runtimeBase ?? `https://YOUR-APP.base44.app/api`;

  const clientCode = `import { createClient } from '@base44/sdk';

// Base44 client pre-configured for ${displayName}
// Set BASE44_API_KEY in your environment
const base44 = createClient({
  appId: "${appId}",
  headers: {
    "api_key": process.env.BASE44_API_KEY,
  },
});

export default base44;

/*
  Usage examples:
    const users = await base44.entities.User.list();
    const user  = await base44.entities.User.get('record-id');
    const newUser = await base44.entities.User.create({ ... });
    await base44.entities.User.update('record-id', { ... });
    await base44.entities.User.delete('record-id');
*/
`;

  const envExample = `# Base44 credentials
# Get your API key from the Base44 dashboard → User Profile
BASE44_API_KEY=your_api_key_here
`;

  const entityList = openApiSpec?.entityNames.map((n) => `| \`entities/${n}.json\` | ${n} entity schema |`).join("\n") ?? "";

  const readme = `# ${displayName}

> Exported from [Base44](https://app.base44.com) on ${new Date().toISOString().split("T")[0]}

**App ID:** \`${appId}\`  
**API Base:** \`${apiBase}\`

## Quick start

\`\`\`bash
npm install @base44/sdk
cp .env.example .env
# edit .env and add your API key
\`\`\`

\`\`\`typescript
import base44 from './base44-client';

// List all User records
const users = await base44.entities.User.list();
console.log(users);
\`\`\`

## File structure

| File | Description |
|------|-------------|
| \`base44-client.js\` | Pre-configured SDK client |
| \`types.ts\` | TypeScript interfaces for all entities |
| \`.env.example\` | Environment variable template |
${entityList}
${openApiSpec ? `| \`openapi.json\` | Full OpenAPI 3.0 spec |` : ""}

## Authentication

Add the \`api_key\` header to all requests:

\`\`\`
api_key: <your_api_key>
\`\`\`

## API reference

See \`openapi.json\` for the full interactive API reference, or visit the Base44 dashboard.
`;

  const files: Base44File[] = [
    toFile("base44-client.js", clientCode),
    toFile(".env.example", envExample),
    toFile("README.md", readme),
  ];

  if (openApiSpec) {
    files.push(toFile("openapi.json", JSON.stringify(openApiSpec.rawSpec, null, 2)));
  }

  return files;
}

// ---------- Main export ----------

export async function fetchBase44App(appId: string, apiKey: string, appUrl?: string): Promise<Base44AppInfo> {
  // If the user explicitly provides their app URL, use it directly as the runtime base
  // and still fetch the app name from the studio API (best-effort).
  let resolvedRuntimeBase: string | null = null;
  let appName = appId;
  let subdomain: string | null = null;

  if (appUrl) {
    // Normalise: strip trailing slash, strip /api suffix
    const cleaned = appUrl.trim().replace(/\/api\/?$/, "").replace(/\/$/, "");
    resolvedRuntimeBase = `${cleaned}/api`;
    subdomain = extractSubdomainFromUrl(cleaned);
    logger.info({ appUrl, resolvedRuntimeBase, subdomain }, "Using user-provided app URL");
    // Still try to get the friendly app name from studio
    try {
      const meta = await fetchAppMetadata(appId, apiKey);
      appName = meta.appName;
    } catch {
      // non-fatal — keep appId as fallback
    }
  } else {
    const meta = await fetchAppMetadata(appId, apiKey);
    appName = meta.appName;
    subdomain = meta.subdomain;
    resolvedRuntimeBase = meta.runtimeBase;
  }

  let openApiResult: ParsedOpenApiSpec | null = null;

  if (resolvedRuntimeBase) {
    openApiResult = await fetchOpenApiSpec(resolvedRuntimeBase, apiKey);
  } else {
    logger.warn({ appId }, "No app URL found — cannot fetch OpenAPI spec. Provide your app URL for full export.");
  }

  const entityFiles = openApiResult ? schemasToFiles(openApiResult.entitySchemas) : [];
  const setupFiles = generateSetupFiles(appId, appName, resolvedRuntimeBase, openApiResult);

  const allFiles = [...entityFiles, ...setupFiles];

  logger.info(
    {
      appId,
      appName,
      subdomain,
      runtimeBase: resolvedRuntimeBase,
      entityCount: openApiResult?.entityNames.length ?? 0,
      totalFiles: allFiles.length,
    },
    "Base44 app fetched",
  );

  return {
    appName,
    files: allFiles,
  };
}
