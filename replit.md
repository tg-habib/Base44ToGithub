# Base44 → GitHub

A web app that lets you export your [Base44](https://app.base44.com) app's full source code to a GitHub repository in one click. The user enters their Base44 App ID + API Key, connects their GitHub account via OAuth, picks a repo (existing or new), and the app downloads all JSX pages, components, entities, and config files then pushes them as a single commit.

**Live deployment:** `https://base44-to-github--temp-1.replit.app/`

---

## How to Run (Development)

Two workflows must both be running simultaneously (check the Workflows panel):

| Workflow | Command | Port |
|---|---|---|
| `API Server` | `PORT=8080 pnpm --filter @workspace/api-server run dev` | 8080 |
| `Start application` | `PORT=22191 BASE_PATH=/ pnpm --filter @workspace/base44-to-github run dev` | 22191 |

If either is stopped, click the ▶ button next to it in the Workflows panel.

**Useful commands:**
```bash
# Regenerate API client + Zod types from the OpenAPI spec (run after changing lib/api-spec/openapi.yaml)
pnpm --filter @workspace/api-spec run codegen

# Full typecheck
pnpm run typecheck
```

The Vite dev server proxies `/api/*` to `localhost:8080` automatically (configured in `artifacts/base44-to-github/vite.config.ts`).

---

## Required Secrets (Replit Secrets panel)

| Secret key | Where to get it | Purpose |
|---|---|---|
| `GITHUB_CLIENT_ID` | GitHub → Settings → Developer settings → OAuth Apps → your app → Client ID | GitHub OAuth login |
| `GITHUB_CLIENT_SECRET` | GitHub → Settings → Developer settings → OAuth Apps → your app → Client secrets → Generate | GitHub OAuth token exchange |

**Both secrets are already configured** in this Replit project. If you fork/clone, you must add them fresh.

After adding/changing secrets, **restart the API Server workflow** to pick them up.

---

## GitHub OAuth App Setup

The OAuth App is registered at GitHub under the account that owns this project. Settings:

- **Application name**: Base44togithub  
- **Homepage URL**: `https://base44-to-github--temp-1.replit.app/`
- **Authorization callback URL**: `https://base44-to-github--temp-1.replit.app/`
- **Enable Device Flow**: checked (not used anymore, but harmless)

**Important:** The "Authorization callback URL" must exactly match the URL users access the app from. If you deploy to a new URL, update this field in the GitHub OAuth App settings. If you want the dev URL (`xjbpc09.sisko.replit.dev`) to also work, add it as a second callback URL there.

To create a new OAuth App from scratch: [github.com/settings/applications/new](https://github.com/settings/applications/new)

---

## Architecture

This is a **pnpm monorepo** with path-based artifact routing. Everything lives under `/artifacts/` or `/lib/`.

```
artifacts/
  api-server/                  ← Express 5 backend (port 8080, built with esbuild)
    src/
      routes/
        eject.ts               ← 🔑 Core: downloads from Base44, pushes to GitHub (SSE stream)
        push.ts                ← Metadata-only push (Schema & Config tab)
        auth.ts                ← GitHub OAuth endpoints (web flow + device flow + exchange)
        health.ts
        index.ts
      lib/
        github.ts              ← 🔑 GitHub REST API helper — push files, create repos, handle empty repos
        logger.ts
  base44-to-github/            ← React + Vite frontend
    src/
      pages/home.tsx           ← 🔑 All UI: three tabs, SSE stream reader, OAuth flow, forms
    vite.config.ts             ← Proxies /api/* → localhost:8080 in dev

lib/
  api-spec/
    openapi.yaml               ← Source of truth for all API contracts
  api-client-react/            ← Auto-generated React Query hooks (from openapi.yaml)
  api-zod/                     ← Auto-generated Zod validators (from openapi.yaml)
```

---

## The Core Mechanism

**The eject works by calling the Base44 REST API directly — no CLI required.**

```
GET https://app.base44.com/api/apps/{appId}/eject?api_key={apiKey}
```

This returns a **gzipped tar archive** of all source files. The server:
1. Fetches the tar.gz from Base44
2. Streams it through `gunzip` → `tar-stream` extraction
3. Skips `.git/`, `node_modules/`, `dist/`
4. Pushes all text files to GitHub via the REST API in one commit

**Key discovery:** The `BASE44_API_KEY` (the SDK runtime key from the dashboard) works as `?api_key=` on the eject endpoint. It does NOT work as a `Bearer` token header.

---

## GitHub OAuth Flow (Web Redirect)

The app uses the **standard OAuth Authorization Code flow** (NOT Device Flow):

1. User clicks **"Connect GitHub"** → frontend calls `GET /api/auth/web/start?state=...&redirect_uri=...`
2. Backend returns a GitHub authorize URL → frontend redirects user there
3. User approves on GitHub → GitHub redirects back to the app with `?code=...&state=...`
4. On mount, the frontend detects the `?code=` param → calls `POST /api/auth/exchange`
5. Backend exchanges code + client_secret for an access token → returns `{token, login, avatar_url}`
6. Frontend stores the session in `sessionStorage` as `gh_session` — persists across page refreshes
7. User sees **"Connected as @username"** — no manual polling, no code entry

**Why `client_secret` is required:** GitHub OAuth Apps (unlike GitHub Apps) require the `client_secret` in the token exchange step. This is done server-side in `auth.ts` so the secret is never exposed to the browser.

---

## Auto-Create GitHub Repo

If the user enters a repo name that doesn't exist yet, `github.ts` automatically creates it before pushing:
- Detects 404 from `GET /repos/{owner}/{repo}`
- Calls `POST /user/repos` (personal) or `POST /orgs/{org}/repos` (org)
- New repos are created as **public** by default
- Falls back to `seedEmptyRepoAndPush` for the initial commit (bypasses the "empty repo 409" bug)

---

## Empty Repo Handling (409 Bug Fix)

GitHub's Git Data API returns `409 Conflict` when you try to create a tree on an empty repo (no commits yet). The fix is in `github.ts`:

1. Try normal `pushToExistingBranch` (fast, uses tree API for bulk push)
2. If the repo is empty (`size === 0`), use `seedEmptyRepoAndPush`:
   - First creates a README via the Contents API (this initializes the repo)
   - Then uses the Git Data API for the full bulk push
3. If any 409 is thrown during `pushAsInitialCommit`, falls back to `seedEmptyRepoAndPush`

---

## Session Persistence (sessionStorage)

To survive page refreshes and mobile app-switching, the following are saved to `sessionStorage`:

| Key | Contents | Cleared when |
|---|---|---|
| `gh_session` | `{token, login, avatar_url}` | User clicks "Disconnect" |
| `gh_oauth_state` | Random UUID (CSRF check) | After OAuth callback is handled |
| `eject_step1` | `{base44AppId, base44ApiKey}` | User clicks "Eject another app" / "Start over" |

This means on refresh, users skip Step 1 (Base44 credentials) and go straight to Step 2 (GitHub), already connected.

---

## All API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/healthz` | Health check |
| `POST` | `/api/eject/stream` | SSE stream: download from Base44 + push to GitHub |
| `POST` | `/api/eject` | Same, but blocking JSON response (no streaming) |
| `POST` | `/api/preview` | Fetch Base44 metadata (entities, schema) |
| `POST` | `/api/push` | Push metadata JSON files to GitHub |
| `GET` | `/api/auth/web/start` | Returns GitHub authorize URL for web OAuth flow |
| `POST` | `/api/auth/exchange` | Exchanges OAuth code for access token |
| `POST` | `/api/auth/device/start` | (Legacy) Start device flow |
| `POST` | `/api/auth/device/poll` | (Legacy) Poll device flow for token |

---

## What Works End-to-End

Tested live with real credentials:
- Base44 API returns **105 source files** (JSX pages, components, entities, config)
- GitHub push creates a real commit with all files
- SSE terminal streams log lines in real-time to the browser
- Auto-create repo works (public repos only)
- GitHub OAuth web redirect flow connects in one click on the deployed app
- Session persists across page refreshes
- The whole process takes **5–15 seconds**

---

## Known Issues / What's Not Finished

1. **GitHub OAuth only works on the deployed URL** (`https://base44-to-github--temp-1.replit.app/`). On the dev URL, GitHub redirects to the production app (because only one callback URL is configured). To fix: add the dev URL as a second authorized callback URL in the GitHub OAuth App settings.

2. **New repos are always public.** A "private repo" toggle has not been added yet — it would need a checkbox in Step 2 and a `private: true` param passed to `createGitHubRepo()` in `github.ts`.

3. **Debug logging still present in `auth.ts`** — there is a `logger.info` call on every poll and a startup log. These are harmless but could be removed for cleanliness.

---

## What Could Be Built Next

- **Private repo toggle** — checkbox in Step 2 to create new repos as private
- **File preview step** — show which files will be committed before pushing
- **Selective push** — let users choose which files/folders to include
- **Scheduled sync** — cron job or webhook to auto-push on a schedule
- **Diff view** — show what changed since the last push
- **Multi-app support** — save and switch between multiple Base44 apps

---

## Stack

- **Runtime**: Node.js 24, TypeScript 5.9, pnpm workspaces
- **Backend**: Express 5, esbuild (bundling), pino (logging), tar-stream, zlib
- **Frontend**: React 19, Vite 7, Tailwind CSS, shadcn/ui, React Hook Form, Zod
- **API contract**: OpenAPI 3.1 → Orval codegen → React Query hooks + Zod schemas
- **No database** — stateless server, no auth sessions on the server side

---

## Gotchas

1. **After changing `lib/api-spec/openapi.yaml`**, always run `pnpm --filter @workspace/api-spec run codegen` to regenerate the client hooks and Zod types. The generated files in `lib/api-client-react/src/generated/` and `lib/api-zod/src/` must not be edited manually.

2. **The `BASE44_API_KEY`** is the SDK runtime key (for data access), NOT a CLI auth token. It works as `?api_key=` query param on the eject endpoint but NOT as `Authorization: Bearer`.

3. **Two separate forms** on the Eject tab (`eject-step1-form`, `eject-step2-form`) — this is intentional. A single form caused cross-step Zod validation to block submission.

4. **The API server rebuilds from TypeScript on every `dev` restart** (esbuild, ~400ms). Source maps are enabled so stack traces point to `.ts` files.

5. **`tar-stream` v3** is installed in `artifacts/api-server`. `@types/tar-stream` is also installed as a dev dependency.

6. **`GITHUB_CLIENT_SECRET` is required** for the OAuth token exchange step. Without it, GitHub rejects the exchange with `incorrect_client_credentials` and the app silently stays in a "pending" state. Always restart the API Server after adding/changing this secret.

---

## User Preferences

_Add any preferences here as you work with the user._
