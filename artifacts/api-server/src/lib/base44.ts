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

// ---------- Studio API fetch ----------

async function fetchStudioApp(appId: string, apiKey: string): Promise<JsonObj> {
  const url = `${STUDIO_API}/apps/${appId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "api_key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error("Invalid Base44 credentials. Check your App ID and API Key.");
  }
  if (!res.ok) {
    throw new Error(`Could not reach Base44 API (HTTP ${res.status}). Verify your App ID and API Key.`);
  }

  const data = await res.json() as JsonObj;
  logger.info({ appId, keys: Object.keys(data).join(", ") }, "Studio app metadata fetched");
  return data;
}

// ---------- Entity schema extraction ----------

interface EntitySchema {
  name: string;
  schema: JsonObj;
}

function extractEntities(studioData: JsonObj): EntitySchema[] {
  const results: EntitySchema[] = [];

  // 1. user_entity — built-in User entity, always present
  const userEntity = studioData["user_entity"];
  if (userEntity && typeof userEntity === "object" && !Array.isArray(userEntity)) {
    const ue = userEntity as JsonObj;
    const name = typeof ue["name"] === "string" ? ue["name"] : "User";
    results.push({ name, schema: ue });
    logger.info({ name }, "Extracted user_entity");
  }

  // 2. entities — custom entities (object map: entityName → schema)
  const entities = studioData["entities"];
  if (entities && typeof entities === "object" && !Array.isArray(entities)) {
    const entMap = entities as JsonObj;
    for (const [entityName, schema] of Object.entries(entMap)) {
      if (schema && typeof schema === "object") {
        results.push({ name: entityName, schema: schema as JsonObj });
        logger.info({ entityName }, "Extracted custom entity");
      }
    }
  }

  // 3. entities as array
  if (Array.isArray(entities) && entities.length > 0) {
    for (const entity of entities as JsonObj[]) {
      const name = String(entity["name"] ?? entity["entityName"] ?? "entity");
      results.push({ name, schema: entity });
      logger.info({ name }, "Extracted entity from array");
    }
  }

  return results;
}

// ---------- Function extraction ----------

interface FunctionDef {
  name: string;
  code?: string;
  metadata?: JsonObj;
}

function extractFunctions(studioData: JsonObj): FunctionDef[] {
  const results: FunctionDef[] = [];

  const functionNames = studioData["function_names"];
  const functions = studioData["functions"];
  const meta = studioData["backend_function_metadata"];

  const names: string[] = Array.isArray(functionNames) ? functionNames.map(String) : [];

  if (functions && typeof functions === "object" && !Array.isArray(functions)) {
    for (const [name, def] of Object.entries(functions as JsonObj)) {
      const d = def as JsonObj;
      results.push({
        name,
        code: typeof d["code"] === "string" ? d["code"] : undefined,
        metadata: d,
      });
    }
  } else if (names.length > 0 && meta && typeof meta === "object") {
    const metaMap = meta as JsonObj;
    for (const name of names) {
      const fnMeta = metaMap[name];
      results.push({
        name,
        code: undefined,
        metadata: fnMeta && typeof fnMeta === "object" ? fnMeta as JsonObj : undefined,
      });
    }
  }

  return results;
}

// ---------- TypeScript type generation ----------

function jsonSchemaTypeToTs(schema: JsonObj, depth = 0): string {
  if (depth > 3) return "unknown";
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
      return items ? `${jsonSchemaTypeToTs(items, depth + 1)}[]` : "unknown[]";
    }
    case "object": {
      const props = schema["properties"] as Record<string, JsonObj> | undefined;
      if (!props) return "Record<string, unknown>";
      const inner = Object.entries(props).map(([k, v]) => `${k}: ${jsonSchemaTypeToTs(v, depth + 1)};`).join(" ");
      return `{ ${inner} }`;
    }
    default: return "unknown";
  }
}

function entitiesToTypeScript(entities: EntitySchema[]): string {
  const lines = [
    "// Auto-generated from Base44 app metadata",
    "// Re-export by running the Base44 to GitHub export tool",
    "",
  ];

  for (const { name, schema } of entities) {
    const props = (schema["properties"] as Record<string, JsonObj>) ?? {};
    const required = (schema["required"] as string[]) ?? [];
    const description = schema["description"] as string | undefined;
    const title = schema["title"] as string | undefined;

    if (description ?? title) {
      lines.push(`/** ${description ?? title} */`);
    }

    // Add system fields that Base44 always provides
    const systemFields: Record<string, string> = {
      id: "string",
      created_date: "string",
      updated_date: "string",
      created_by_id: "string",
    };

    lines.push(`export interface ${name} {`);
    for (const [propName, propSchema] of Object.entries(props)) {
      const isRequired = required.includes(propName);
      const tsType = jsonSchemaTypeToTs(propSchema as JsonObj);
      const desc = (propSchema as JsonObj)["description"] as string | undefined;
      if (desc) lines.push(`  /** ${desc} */`);
      lines.push(`  ${propName}${isRequired ? "" : "?"}: ${tsType};`);
    }
    // Append system fields not already in properties
    for (const [fieldName, tsType] of Object.entries(systemFields)) {
      if (!props[fieldName]) {
        lines.push(`  /** System field */`);
        lines.push(`  ${fieldName}?: ${tsType};`);
      }
    }
    lines.push("}", "");
  }

  return lines.join("\n");
}

// ---------- OpenAPI spec generation ----------

function generateOpenApiSpec(
  entities: EntitySchema[],
  runtimeBase: string,
  appName: string,
): JsonObj {
  const paths: JsonObj = {};
  const schemas: JsonObj = {};

  for (const { name, schema } of entities) {
    const props = (schema["properties"] as Record<string, JsonObj>) ?? {};
    const required = (schema["required"] as string[]) ?? [];
    const description = schema["description"] as string | undefined;

    // Add system fields to schema
    const fullProps: Record<string, JsonObj> = {
      ...props,
      id: { type: "string", description: "Unique record identifier" },
      created_date: { type: "string", format: "date-time", description: "Record creation timestamp" },
      updated_date: { type: "string", format: "date-time", description: "Record last update timestamp" },
      created_by_id: { type: "string", description: "ID of the user who created the record" },
    };

    schemas[name] = {
      type: "object",
      description: description ?? `${name} entity`,
      properties: fullProps,
      required,
    };

    const ref = { "$ref": `#/components/schemas/${name}` };
    const idParam = {
      name: `${name}_id`,
      in: "path",
      required: true,
      schema: { type: "string" },
      description: "Record ID",
    };

    paths[`/entities/${name}`] = {
      get: {
        tags: [`Entities - ${name}`],
        summary: `List ${name} records`,
        operationId: `list_${name}`,
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: 'JSON query filter, e.g. {"status":"active"}' },
          { name: "limit", in: "query", schema: { type: "integer", default: 100 }, description: "Maximum number of records" },
          { name: "skip", in: "query", schema: { type: "integer", default: 0 }, description: "Number of records to skip" },
          { name: "sort_by", in: "query", schema: { type: "string" }, description: "Field to sort by, prefix with - for descending" },
        ],
        responses: { "200": { description: "List of records", content: { "application/json": { schema: { type: "array", items: ref } } } } },
      },
      post: {
        tags: [`Entities - ${name}`],
        summary: `Create a ${name} record`,
        operationId: `create_${name}`,
        requestBody: { required: true, content: { "application/json": { schema: ref } } },
        responses: { "200": { description: "Created record", content: { "application/json": { schema: ref } } } },
      },
    };

    paths[`/entities/${name}/{${name}_id}`] = {
      get: {
        tags: [`Entities - ${name}`],
        summary: `Get a ${name} record by ID`,
        operationId: `get_${name}`,
        parameters: [idParam],
        responses: { "200": { description: "The record", content: { "application/json": { schema: ref } } } },
      },
      put: {
        tags: [`Entities - ${name}`],
        summary: `Update a ${name} record`,
        operationId: `update_${name}`,
        parameters: [idParam],
        requestBody: { required: true, content: { "application/json": { schema: ref } } },
        responses: { "200": { description: "Updated record", content: { "application/json": { schema: ref } } } },
      },
      delete: {
        tags: [`Entities - ${name}`],
        summary: `Delete a ${name} record`,
        operationId: `delete_${name}`,
        parameters: [idParam],
        responses: { "200": { description: "Deletion result", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" } } } } } } },
      },
    };
  }

  return {
    openapi: "3.0.3",
    info: {
      title: `${appName} API`,
      description: `API documentation for the **${appName}** application.\n\n**Authentication:** Include the \`api_key\` header on every request.`,
      version: "1.0.0",
    },
    servers: [{ url: runtimeBase, description: "API server" }],
    security: [{ ApiKeyAuth: [] }],
    paths,
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "api_key",
          description: "Your API key from the Base44 dashboard.",
        },
      },
      schemas,
    },
    tags: entities.map(({ name }) => ({
      name: `Entities - ${name}`,
      description: `CRUD operations for ${name} records`,
    })),
  };
}

// ---------- Setup files ----------

function generateSetupFiles(
  appId: string,
  appName: string,
  runtimeBase: string,
  entities: EntitySchema[],
): Base44File[] {
  const entityExamples = entities.map(({ name }) =>
    `  // List all ${name} records\n  const ${name.toLowerCase()}s = await base44.entities.${name}.list();\n  console.log(${name.toLowerCase()}s);\n`,
  ).join("\n");

  const clientCode = `import { createClient } from '@base44/sdk';

// Pre-configured Base44 client for ${appName}
// Set BASE44_API_KEY in your environment (.env file)
const base44 = createClient({
  appId: "${appId}",
  headers: {
    "api_key": process.env.BASE44_API_KEY,
  },
});

export default base44;

/*
  Usage examples:

${entityExamples}
  // Get a record by ID
  const item = await base44.entities.User.get('record-id');

  // Create a record
  const newItem = await base44.entities.User.create({ email: 'x@y.com', full_name: 'Jane', role: 'user' });

  // Update a record
  await base44.entities.User.update('record-id', { role: 'admin' });

  // Delete a record
  await base44.entities.User.delete('record-id');
*/
`;

  const envExample = `# Base44 credentials
# Get your API key from the Base44 dashboard → API → Documentation
BASE44_API_KEY=your_api_key_here
`;

  const entityTableRows = entities.map(({ name }) =>
    `| \`entities/${name}.json\` | ${name} entity schema (JSON Schema) |`,
  ).join("\n");

  const readme = `# ${appName}

> Exported from [Base44](https://app.base44.com) on ${new Date().toISOString().split("T")[0]}

**App ID:** \`${appId}\`  
**API Base URL:** \`${runtimeBase}\`

## Quick start

\`\`\`bash
npm install @base44/sdk
cp .env.example .env
# Edit .env and add your API key
\`\`\`

\`\`\`typescript
import base44 from './base44-client';

const users = await base44.entities.User.list();
console.log(users);
\`\`\`

## File structure

| File | Description |
|------|-------------|
| \`base44-client.js\` | Pre-configured SDK client |
| \`types.ts\` | TypeScript interfaces for all entities |
| \`.env.example\` | Environment variable template |
| \`openapi.json\` | Full OpenAPI 3.0 specification |
${entityTableRows}

## Authentication

Every request needs the \`api_key\` header:

\`\`\`
api_key: <your_api_key>
\`\`\`

## Entities

${entities.map(({ name, schema }) => {
  const props = schema["properties"] as Record<string, JsonObj> | undefined ?? {};
  return `### ${name}\n\n| Field | Type | Description |\n|-------|------|-------------|\n${Object.entries(props).map(([k, v]) => `| \`${k}\` | ${(v as JsonObj)["type"] ?? "unknown"} | ${(v as JsonObj)["description"] ?? ""} |`).join("\n")}`;
}).join("\n\n")}
`;

  return [
    toFile("base44-client.js", clientCode),
    toFile(".env.example", envExample),
    toFile("README.md", readme),
  ];
}

// ---------- Main export ----------

export async function fetchBase44App(appId: string, apiKey: string, appUrl?: string): Promise<Base44AppInfo> {
  const studioData = await fetchStudioApp(appId, apiKey);

  const appName = String(studioData["name"] ?? studioData["appName"] ?? appId).trim() || appId;
  const slug = typeof studioData["slug"] === "string" ? studioData["slug"] : null;

  // Determine runtime base URL
  let runtimeBase: string;
  if (appUrl) {
    const cleaned = appUrl.trim().replace(/\/api\/?$/, "").replace(/\/$/, "");
    runtimeBase = `${cleaned}/api`;
  } else if (slug) {
    runtimeBase = `https://${slug}.base44.app/api`;
  } else {
    runtimeBase = `https://your-app.base44.app/api`;
  }

  logger.info({ appId, appName, slug, runtimeBase }, "App resolved");

  // Extract entity schemas from studio metadata
  const entities = extractEntities(studioData);
  const functions = extractFunctions(studioData);

  logger.info(
    { entityCount: entities.length, entities: entities.map((e) => e.name), functionCount: functions.length },
    "Extracted app content",
  );

  // Build files
  const entityFiles = entities.map(({ name, schema }) =>
    toFile(`entities/${name}.json`, JSON.stringify(schema, null, 2)),
  );

  const functionFiles = functions.map(({ name, code, metadata }) =>
    toFile(
      `functions/${name}.${code ? "js" : "json"}`,
      code ?? JSON.stringify(metadata ?? {}, null, 2),
    ),
  );

  const typesTs = entitiesToTypeScript(entities);
  const openApiSpec = generateOpenApiSpec(entities, runtimeBase, appName);

  const setupFiles = generateSetupFiles(appId, appName, runtimeBase, entities);

  const allFiles = [
    ...entityFiles,
    ...functionFiles,
    toFile("types.ts", typesTs),
    toFile("openapi.json", JSON.stringify(openApiSpec, null, 2)),
    ...setupFiles,
  ];

  logger.info(
    {
      appId,
      appName,
      runtimeBase,
      entityCount: entities.length,
      functionCount: functions.length,
      totalFiles: allFiles.length,
    },
    "Base44 app fetched",
  );

  return { appName, files: allFiles };
}
