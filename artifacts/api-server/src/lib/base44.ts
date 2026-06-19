import { logger } from "./logger";
import { createUnzip } from "zlib";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

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

async function base44Request(
  method: string,
  path: string,
  appId: string,
  apiKey: string,
): Promise<Response> {
  const baseUrl = "https://api.base44.com/v1";
  const url = `${baseUrl}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      "x-api-id": appId,
      "x-api-key": apiKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  return res;
}

async function parseJsonFiles(data: unknown): Promise<Base44File[]> {
  if (!data || typeof data !== "object") return [];

  if (Array.isArray(data)) {
    return data.map((f: { path?: string; content?: string; size?: number; type?: string }) => ({
      path: f.path ?? "unknown",
      content: f.content ?? "",
      size: f.size ?? (f.content ? Buffer.byteLength(f.content, "utf8") : 0),
      type: f.type ?? detectType(f.path ?? ""),
    }));
  }

  const obj = data as Record<string, unknown>;

  if (obj.files && Array.isArray(obj.files)) {
    return parseJsonFiles(obj.files);
  }

  return Object.entries(obj).map(([filePath, content]) => ({
    path: filePath,
    content: typeof content === "string" ? content : JSON.stringify(content, null, 2),
    size: typeof content === "string" ? Buffer.byteLength(content, "utf8") : 0,
    type: detectType(filePath),
  }));
}

async function extractZip(buffer: Buffer): Promise<Base44File[]> {
  const files: Base44File[] = [];

  const AdmZip = await import("adm-zip" as string).catch(() => null);
  if (!AdmZip) {
    throw new Error(
      "ZIP extraction not available. The Base44 API returned a ZIP file but adm-zip is not installed.",
    );
  }

  const zip = new AdmZip.default(buffer);
  const entries = zip.getEntries();

  for (const entry of entries) {
    if (!entry.isDirectory) {
      const content = entry.getData().toString("utf8");
      files.push({
        path: entry.entryName,
        content,
        size: entry.header.size,
        type: detectType(entry.entryName),
      });
    }
  }

  return files;
}

function detectType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const typeMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript-react",
    js: "javascript",
    jsx: "javascript-react",
    json: "json",
    css: "css",
    html: "html",
    md: "markdown",
    yaml: "yaml",
    yml: "yaml",
    env: "env",
    toml: "toml",
    sh: "shell",
    py: "python",
  };
  return typeMap[ext] ?? "text";
}

export async function fetchBase44App(
  appId: string,
  apiKey: string,
): Promise<Base44AppInfo> {
  let res: Response;

  const exportPaths = [
    `/apps/${appId}/export`,
    `/apps/${appId}/code`,
    `/apps/${appId}/download`,
    `/export/${appId}`,
  ];

  let lastError: string = "";

  for (const path of exportPaths) {
    try {
      res = await base44Request("GET", path, appId, apiKey);

      if (res.status === 401 || res.status === 403) {
        throw new Error("Invalid Base44 API credentials. Please check your App ID and API Key.");
      }

      if (res.ok) {
        const contentType = res.headers.get("content-type") ?? "";

        if (contentType.includes("application/zip") || contentType.includes("application/octet-stream")) {
          logger.info({ path }, "Base44 returned a ZIP file, extracting");
          const buffer = Buffer.from(await res.arrayBuffer());
          const files = await extractZip(buffer);
          return { appName: appId, files };
        }

        const json = await res.json() as unknown;
        const appName =
          (json && typeof json === "object" && !Array.isArray(json)
            ? ((json as Record<string, unknown>).name ??
              (json as Record<string, unknown>).appName ??
              (json as Record<string, unknown>).app_name ??
              appId)
            : appId) as string;

        const files = await parseJsonFiles(json);
        return { appName: String(appName), files };
      }

      const text = await res.text();
      lastError = `${res.status}: ${text.slice(0, 200)}`;
    } catch (err) {
      if (err instanceof Error && err.message.includes("credentials")) {
        throw err;
      }
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(
    `Could not fetch app from Base44 API. Tried paths: ${exportPaths.join(", ")}. Last error: ${lastError}. ` +
    `Please verify your App ID and API Key are correct.`,
  );
}
