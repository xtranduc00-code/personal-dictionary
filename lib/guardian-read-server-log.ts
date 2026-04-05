/** Structured logs for `/api/guardian-read` — never log secrets or full article URLs with tokens. */

const PREFIX = "[guardian-read]";

export type GuardianReadLogEnv = {
  node: string;
  netlify: boolean;
  vercel: boolean;
  /** Guardian article fetch does not use GUARDIAN_API_KEY (list API does). */
  guardianApiKeyConfigured: boolean;
};

export function guardianReadEnvSnapshot(): GuardianReadLogEnv {
  return {
    node: process.version,
    netlify: Boolean(process.env.NETLIFY),
    vercel: Boolean(process.env.VERCEL),
    guardianApiKeyConfigured: Boolean(process.env.GUARDIAN_API_KEY?.trim()),
  };
}

export function logGuardianReadRequest(meta: {
  pathPreview: string;
  host: string;
  env: GuardianReadLogEnv;
}) {
  console.info(PREFIX, "incoming", {
    host: meta.host,
    pathPreview: meta.pathPreview,
    ...meta.env,
  });
}

export function logGuardianReadUpstream(meta: {
  status: number;
  contentType: string | null;
  ok: boolean;
  bodyChars?: number;
}) {
  console.info(PREFIX, "upstream", {
    status: meta.status,
    contentType: meta.contentType,
    ok: meta.ok,
    bodyChars: meta.bodyChars,
  });
}

export function logGuardianReadFailure(meta: {
  phase: string;
  message: string;
  stack?: string;
  bodyPreview?: string;
  contentType?: string | null;
  elapsedMs?: number;
}) {
  console.error(PREFIX, "failure", {
    phase: meta.phase,
    message: meta.message,
    stack: meta.stack,
    bodyPreview: meta.bodyPreview,
    contentType: meta.contentType,
    elapsedMs: meta.elapsedMs,
  });
}

export function logGuardianReadTiming(meta: {
  totalMs: number;
  fetchMs?: number;
  bodyReadMs?: number;
  parseMs?: number;
  budgetMs: number;
  fetchTimeoutMs: number;
  htmlInChars: number;
  htmlStrippedChars?: number;
}) {
  console.info(PREFIX, "timing", meta);
}
