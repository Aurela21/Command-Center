/**
 * Higgsfield Platform API — unified client for all generation
 *
 * Base URL: https://platform.higgsfield.ai
 * Auth: Authorization: Key {HF_API_KEY}:{HF_API_SECRET}
 *
 * All generation (seed images, Kling video) goes through one async
 * submit/poll interface. Each model has a unique model_id used as the
 * submit path.
 *
 * Docs: https://docs.higgsfield.ai/how-to/introduction.md
 */

const BASE_URL = "https://platform.higgsfield.ai";

export type HFStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "nsfw";

export interface HFResponse {
  status: HFStatus;
  request_id: string;
  status_url: string;
  cancel_url: string;
  images?: Array<{ url: string }>;
  video?: { url: string };
  error?: string;
}

function authHeader(): string {
  const key = process.env.HF_API_KEY;
  const secret = process.env.HF_API_SECRET;
  if (!key || !secret) {
    throw new Error("HF_API_KEY and HF_API_SECRET must be set");
  }
  return `Key ${key}:${secret}`;
}

/**
 * Submit a generation request to a specific model.
 * Returns the full queued response including request_id.
 */
export async function submitRequest(
  modelId: string,
  params: Record<string, unknown>,
  webhookUrl?: string
): Promise<HFResponse> {
  let url = `${BASE_URL}/${modelId}`;
  if (webhookUrl) {
    url += `?hf_webhook=${encodeURIComponent(webhookUrl)}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Higgsfield ${res.status}: ${text}`);
  }

  return res.json();
}

/** Poll a request by its request_id. */
export async function pollRequest(requestId: string): Promise<HFResponse> {
  const res = await fetch(`${BASE_URL}/requests/${requestId}/status`, {
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Higgsfield poll ${res.status}: ${text}`);
  }

  return res.json();
}

/** Cancel a queued request. Only works while status is "queued". */
export async function cancelRequest(requestId: string): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/requests/${requestId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
    },
  });
  return res.status === 202;
}

/**
 * Submit and wait for completion by polling in a loop.
 * Used for seed image generation where the caller expects a synchronous result.
 * Polls every 3s, times out after maxWaitMs (default 120s).
 */
export async function submitAndWait(
  modelId: string,
  params: Record<string, unknown>,
  maxWaitMs = 120_000
): Promise<HFResponse> {
  const queued = await submitRequest(modelId, params);
  const requestId = queued.request_id;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const poll = await pollRequest(requestId);

    if (poll.status === "completed") return poll;
    if (poll.status === "failed") {
      throw new Error(poll.error ?? "Higgsfield generation failed");
    }
    if (poll.status === "nsfw") {
      throw new Error("Content failed Higgsfield moderation checks");
    }
  }

  throw new Error(
    `Higgsfield request ${requestId} timed out after ${maxWaitMs}ms`
  );
}
