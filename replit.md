# Base44 → GitHub

A web app that lets you export your [Base44](https://app.base44.com) app's full source code to a GitHub repository in one click. Enter your Base44 App ID + API Key and a GitHub Personal Access Token, and the app downloads all your JSX pages, components, entities, and config, then pushes them as a single commit.

---

## How to Run

Two workflows must both be running (check the Workflows panel):

| Workflow | Command | Port |
|---|---|---|
| `artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` | 8080 |
| `artifacts/base44-to-github: web` | `pnpm --filter @workspace/base44-to-github run dev` | auto |

If either is stopped, click the ▶ button next to it in the Workflows panel.

**Useful commands:**
```bash
# Regenerate API client + Zod types from the OpenAPI spec (run after changing lib/api-spec/openapi.yaml)
pnpm --filter @workspace/api-spec run codegen

# Full typecheck
pnpm run typecheck
```

---

## Architecture

This is a **pnpm monorepo** with path-based artifact routing. Everything lives under `/artifacts/` or `/lib/`.

```
artifacts/
  api-server/          ← Express 5 backend (port 8080, built with esbuild)
    src/
      routes/
        eject.ts       ← 🔑 Core logic: downloads from Base44 API, pushes to GitHub
        push.ts        ← Metadata-only push (Schema & Config tab)
        health.ts
        index.ts
      lib/
        github.ts      ← GitHub REST API helper (creates/updates files in one commit)
        logger.ts
  base44-to-github/    ← React + Vite frontend
    src/
      pages/home.tsx   ← 🔑 All UI: three tabs, SSE stream reader, forms

lib/
  api-spec/
    openapi.yaml       ← Source of truth for all API contracts
  api-client-react/    ← Auto-generated React Query hooks (from openapi.yaml)
  api-zod/             ← Auto-generated Zod validators (from openapi.yaml)
```

---

## The Core Mechanism (Most Important Thing)

**The eject works by calling the Base44 REST API directly — no CLI required.**

```
GET https://app.base44.com/api/apps/{appId}/eject?api_key={apiKey}
```

This returns a **gzipped tar archive** of all source files. The server:
1. Fetches the tar.gz from Base44
2. Streams it through `gunzip` → `tar-stream` extraction
3. Skips `.git/`, `node_modules/`, `dist/`
4. Pushes all text files to GitHub via the REST API in one commit

This was discovered by reverse-engineering the `base44` CLI source (v0.0.56). The CLI calls this exact endpoint internally — it just wraps it in an OAuth device-code flow that isn't needed when you already have the API key.

**Key discovery:** The `BASE44_API_KEY` (the SDK runtime key from the dashboard) works as `?api_key=` on the eject endpoint. It does NOT work as a Bearer token header.

---

## The Three Tabs

### 1. Eject Full Code (primary)
- **Step 1**: Base44 App ID + API Key
- **Step 2**: GitHub PAT, owner, repo, branch, commit message
- Hits `POST /api/eject/stream` (Server-Sent Events endpoint)
- The frontend reads the SSE stream and renders live log lines in a terminal panel
- On success, shows a "View commit on GitHub" button

### 2. Manual Methods
- Static instructions for Chrome extension, running CLI locally, copy-paste

### 3. Schema & Config
- Fetches metadata via `POST /preview` (Base44 SDK call)
- Pushes as JSON to GitHub via `POST /push`

---

## Stack

- **Runtime**: Node.js 24, TypeScript 5.9, pnpm workspaces
- **Backend**: Express 5, esbuild (for bundling), pino (logging), tar-stream, zlib
- **Frontend**: React 19, Vite, Tailwind CSS, shadcn/ui, React Hook Form, Zod
- **API contract**: OpenAPI 3.1 → Orval codegen → React Query hooks + Zod schemas
- **No database** — stateless server, no auth, no sessions

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/healthz` | Health check |
| `POST` | `/api/eject/stream` | SSE stream: download from Base44 + push to GitHub |
| `POST` | `/api/eject` | Same, but blocking JSON response (no streaming) |
| `POST` | `/api/preview` | Fetch Base44 metadata (entities, schema) |
| `POST` | `/api/push` | Push metadata JSON files to GitHub |

All request/response schemas are defined in `lib/api-spec/openapi.yaml` and validated with Zod.

---

## What Works End-to-End

Tested live with real credentials:
- Base44 API returns **105 source files** (JSX pages, components, entities, config)
- GitHub push creates a real commit with all files
- SSE terminal streams log lines in real-time to the browser
- The whole process takes **5–15 seconds**

---

## What Could Be Built Next

- **File preview step** — show which files will be committed before pushing
- **Selective push** — let users choose which files/folders to include
- **Scheduled sync** — cron job to auto-push on a schedule
- **Re-authenticate / account switcher** — for multi-account use
- **Diff view** — show what changed since the last push
- **GitHub repo creation** — create the repo if it doesn't exist yet

---

## Gotchas

1. **After changing `lib/api-spec/openapi.yaml`**, always run `pnpm --filter @workspace/api-spec run codegen` to regenerate the client hooks and Zod types. The generated files in `lib/api-client-react/src/generated/` and `lib/api-zod/src/` must not be edited manually.

2. **The `BASE44_API_KEY`** is the SDK runtime key (for data access), NOT a CLI auth token. It works as `?api_key=` query param on the eject endpoint but NOT as `Authorization: Bearer`.

3. **Two separate forms** on the Eject tab (`eject-step1-form`, `eject-step2-form`) — this is intentional. A single form caused cross-step Zod validation to block submission.

4. **The API server rebuilds from TypeScript on every `dev` restart** (esbuild, ~400ms). Source maps are enabled so stack traces point to `.ts` files.

5. **`tar-stream` v3** is installed in `artifacts/api-server`. `@types/tar-stream` is also installed as a dev dependency.

---

## User Preferences

_Add any preferences here as you work with the user._
