---
name: Base44 eject API discovery
description: How to download Base44 source code directly via API — the key non-obvious technical finding for this project.
---

## Rule
Call `GET https://app.base44.com/api/apps/{appId}/eject?api_key={apiKey}` directly. This returns a gzipped tar archive of all source files. No CLI, no OAuth required.

**Why:** The `base44` CLI (v0.0.56) uses OAuth device-code flow for its authentication — it does NOT accept `BASE44_API_KEY` as a credential. But the underlying REST endpoint the CLI calls internally accepts `?api_key=` as a query parameter using the SDK runtime key from the dashboard. Discovered by reading the CLI source at `/tmp/b44inspect/lib/node_modules/base44/dist/cli/index.js` line 241843: `base44Client.get('api/apps/${projectId}/eject', { timeout: false })`.

**How to apply:**
- Use `BASE44_API_KEY` (the SDK key from Base44 dashboard → Settings → API Keys) as the `?api_key=` query parameter — NOT as `Authorization: Bearer`
- `Authorization: Bearer <api_key>` returns 401; only `?api_key=` works for this endpoint
- The response is `application/gzip` (tar.gz). Use `tar-stream` + `createGunzip` to extract in memory
- Skip `.git/`, `node_modules/`, `dist/` when walking the extracted files
