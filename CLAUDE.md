@AGENTS.md

# Command Center Higgs

Video production pipeline: reference video in, AI-generated branded video out.
Upload a reference video -> scene detection (Claude) -> seed image generation (via Higgsfield) -> video generation (Kling via Higgsfield) -> quality scoring (Claude Vision).

## Stack

- **Framework**: Next.js (App Router, Server Components + Client Components)
- **Database**: PostgreSQL (Railway) via Drizzle ORM
- **Storage**: Cloudflare R2 (S3-compatible) for all media (frames, seed images, videos)
- **State**: Zustand (client), React Query (data fetching)
- **UI**: shadcn + Tailwind CSS
- **Video processing**: fluent-ffmpeg (frame extraction, probing)

## Higgsfield Platform API — Single Generation Layer

All image and video generation goes through **Higgsfield's Platform API** at `platform.higgsfield.ai`. There is no direct Kling API access and no direct Gemini API access. Higgsfield wraps both models behind one credential pair and one async submit/poll interface.

Docs: https://docs.higgsfield.ai/llms.txt

### Credentials

One credential pair for everything:

```
HF_API_KEY=...
HF_API_SECRET=...
```

These replace the old `KLING_ACCESS_KEY`, `KLING_SECRET_KEY`, `NANO_BANANA_API_KEY`, and `GOOGLE_AI_API_KEY` env vars. Do NOT reference those old variables anywhere in the codebase.

### Auth

All requests use the `Authorization` header:

```
Authorization: Key {HF_API_KEY}:{HF_API_SECRET}
```

No JWTs, no HMAC signatures, no Google API keys.

### SDK Client (`src/lib/higgsfield.ts`)

Single client module for all Higgsfield interactions:

```ts
const BASE_URL = "https://platform.higgsfield.ai";

function authHeader(): string {
  return `Key ${process.env.HF_API_KEY}:${process.env.HF_API_SECRET}`;
}

// Submit — POST /{model_id}
const res = await fetch(`${BASE_URL}/${modelId}`, {
  method: "POST",
  headers: { Authorization: authHeader(), "Content-Type": "application/json" },
  body: JSON.stringify(params),
});
// Returns: { status: "queued", request_id, status_url, cancel_url }

// Poll — GET /requests/{request_id}/status
const poll = await fetch(`${BASE_URL}/requests/${requestId}/status`, {
  headers: { Authorization: authHeader() },
});
// Returns: { status, request_id, images?, video?, error? }
```

### Models

| Purpose | Model ID | Submit Path |
|---------|----------|-------------|
| Seed image generation | `higgsfield-ai/soul/standard` | `POST /higgsfield-ai/soul/standard` |
| Video generation (Kling) | `kling-video/v3.0/pro/image-to-video` | `POST /kling-video/v3.0/pro/image-to-video` |

### Unified Submit / Poll Pattern

Both seed image generation and video generation use the same lifecycle:

1. **Submit** — `POST /{model_id}` with params -> returns `{ status: "queued", request_id }`
2. **Poll** — `GET /requests/{request_id}/status` -> returns `{ status, images?, video? }`
3. **Webhook** (optional) — append `?hf_webhook=<url>` to submit URL

Request statuses: `queued` | `in_progress` | `completed` | `failed` | `nsfw`

#### Seed Image Generation

```ts
// Submit
const res = await fetch("https://platform.higgsfield.ai/higgsfield-ai/soul/standard", {
  method: "POST",
  headers: { Authorization: "Key {key}:{secret}", "Content-Type": "application/json" },
  body: JSON.stringify({
    image_url: "...",          // R2 public URL of reference frame
    prompt: "...",              // enriched prompt with product context
    reference_images: ["..."], // optional product reference image URLs
  }),
});
// { status: "queued", request_id: "uuid" }

// Poll
// GET /requests/{request_id}/status
// On completed: response.images[0].url
```

#### Video Generation (Kling)

```ts
// Submit
const res = await fetch("https://platform.higgsfield.ai/kling-video/v3.0/pro/image-to-video", {
  method: "POST",
  headers: { Authorization: "Key {key}:{secret}", "Content-Type": "application/json" },
  body: JSON.stringify({
    image_url: "...",          // approved seed image URL
    prompt: "...",              // scene prompt
    duration: 5,               // seconds (5 or 10)
  }),
});
// { status: "queued", request_id: "uuid" }

// Poll
// GET /requests/{request_id}/status
// On completed: response.video.url
```

### Webhook Support

Higgsfield supports webhooks as an alternative to polling. Append `?hf_webhook=<url>` to the submit URL:

```
POST /higgsfield-ai/soul/standard?hf_webhook=https://your-app.com/api/webhooks/higgsfield
```

Higgsfield POSTs the same response format on status changes:
- `completed`: includes `images` or `video` fields
- `failed`: includes `error` message
- `nsfw`: content failed moderation

Webhooks retry for up to 2 hours. Must return 2xx within 10 seconds. Use `request_id` for idempotency.

The current architecture uses cron polling (every 15s via `src/lib/cron.ts`). Webhooks and polling can coexist — webhooks handle the fast path, polling catches anything webhooks miss.

### What This Replaces

| Old | New (Higgsfield) |
|-----|------------------|
| `src/lib/kling.ts` (direct `api.klingai.com`) | `src/lib/kling.ts` -> `higgsfield.ts` -> `kling-video/v3.0/pro/image-to-video` |
| `src/lib/nano-banana.ts` (direct Gemini) | `src/lib/nano-banana.ts` -> `higgsfield.ts` -> `higgsfield-ai/soul/standard` |
| `KLING_ACCESS_KEY` / `KLING_SECRET_KEY` | `HF_API_KEY` / `HF_API_SECRET` |
| `GOOGLE_AI_API_KEY` | `HF_API_KEY` / `HF_API_SECRET` |
| JWT auth to `api.klingai.com` | `Authorization: Key` to `platform.higgsfield.ai` |
| Synchronous Gemini call | Async Higgsfield job (submit/poll) |
| Two polling paths in `cron.ts` | One poll endpoint: `GET /requests/{id}/status` |

### Important: Seed Generation Is Now Async Under the Hood

The old Gemini integration was synchronous (~10-30s blocking call). Through Higgsfield, seed image generation is async (submit/poll). The `generateSeedImage()` function in `nano-banana.ts` hides this by polling internally, so the `generate-seed` route still behaves synchronously from the caller's perspective.

## Pipeline Architecture (Unchanged)

### Step 1: Upload Reference Video
- Client uploads via presigned R2 PUT URL
- `POST /api/projects/[id]/process-video` probes metadata (duration, fps, frame count)

### Step 2: Scene Detection (Claude)
- Extract frames (1/sec, max 20 frames, up to 2s apart)
- Upload frames to R2
- Claude Sonnet detects scene boundaries
- Creates scene records (startFrame, endFrame, description, scenePrompt)

### Step 3A: Seed Image Generation (via Higgsfield)
- User enters prompt, approves reference frame
- `POST /api/projects/[id]/generate-seed` -> submits to Higgsfield (`higgsfield-ai/soul/standard`)
- Resolves @tags to product profile images from DB
- On completion: uploads result to R2, creates `asset_version` (assetType="seed_image")
- User reviews and approves

### Step 3B: Kling Prompt Refinement
- User edits/reviews Kling prompt
- `POST /api/projects/[id]/refine-prompt` for Claude-powered expansion
- User approves prompt

### Step 3C: Video Generation (Kling via Higgsfield)
- `POST /api/jobs` -> submits to Higgsfield (`kling-video/v3.0/pro/image-to-video`)
- On completion: downloads video, uploads to R2, creates `asset_version` (assetType="kling_output")
- Quality scoring via Claude Vision

### Real-time Updates
- `src/lib/event-bus.ts` — singleton EventEmitter, emits typed SSE events
- Event types: `job:progress`, `job:completed`, `job:failed`, `job:retrying`, `project:stage_change`
- Client listens via SSE for live progress

### Job System
- `src/lib/job-queue.ts` — create, submit, update, complete, fail, retry jobs via Drizzle
- `src/lib/cron.ts` — polls active jobs every 15s, routes to Higgsfield poll by job type
- `jobs` table: jobType, externalJobId (Higgsfield request_id), status, progressPct, resultAssetVersionId
- Stalled job detection: no update for 10 min -> retry or fail

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/higgsfield.ts` | Higgsfield Platform API client (auth, submit, poll) |
| `src/lib/kling.ts` | Kling video generation (wraps higgsfield.ts) |
| `src/lib/nano-banana.ts` | Seed image generation (wraps higgsfield.ts) |
| `src/lib/job-queue.ts` | Job CRUD + status transitions + SSE emission |
| `src/lib/cron.ts` | 15s poller for active jobs |
| `src/lib/event-bus.ts` | SSE event bus (singleton EventEmitter) |
| `src/lib/r2.ts` | Cloudflare R2 upload/download/presign |
| `src/app/api/jobs/route.ts` | `POST /api/jobs` — create + submit Kling generation jobs |
| `src/app/api/projects/[id]/generate-seed/route.ts` | Seed image generation endpoint |
| `src/db/schema.ts` | Drizzle schema (jobs, scenes, assetVersions, etc.) |

## Environment Variables

```bash
# Higgsfield Platform API (single credential for all generation)
HF_API_KEY=
HF_API_SECRET=

# Database (Railway PostgreSQL)
DATABASE_URL=

# Auth
APP_PASSWORD=       # bcrypt hash
SESSION_SECRET=     # 32-byte hex

# Anthropic (scene detection, prompt refinement, quality scoring)
ANTHROPIC_API_KEY=

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY=
R2_SECRET_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
```

## Rules

- All generation requests go through `src/lib/higgsfield.ts`. Never call Kling or Gemini APIs directly.
- One auth pattern: `Authorization: Key {HF_API_KEY}:{HF_API_SECRET}`. No JWTs, no Google API keys.
- Both seed images and videos are async jobs. Use the same submit/poll lifecycle for both.
- Store the Higgsfield `request_id` as `externalJobId` in the `jobs` table.
- Always download generation results to R2 before serving to the client. Never serve Higgsfield URLs directly.
- Product @tag resolution, prompt enrichment, Claude analysis, R2 storage, SSE events, and the job-queue state machine are all unchanged.
