"use client";

import {
  BULK_CREATE_STAGGER_MAX_MS,
  BULK_CREATE_STAGGER_MIN_MS,
  DOLPHIN_API_PATH,
  RETRY_BACKOFF_MS,
  RETRY_MAX_ATTEMPTS,
} from "@/lib/dolphin/constants";
import {
  isAbortError,
  jitter,
  sleep,
} from "@/lib/dolphin/concurrency";
import type {
  DolphinBrowserVersion,
  DolphinCreateProfilePayload,
  DolphinCreateProfileResponse,
  DolphinFetchError,
  DolphinFingerprintBundle,
  DolphinPlatform,
  DolphinWebglInfo,
  WebglFingerprint,
} from "@/lib/dolphin/types";

const PROXY_BASE = "/api/dolphin/proxy";

export type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: DolphinFetchError };

const isDev = (): boolean => process.env.NODE_ENV !== "production";

function devLog(label: string, payload: unknown): void {
  if (!isDev()) return;
  console.log(`[dolphin] ${label}`, payload);
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const json = (await res.json()) as Record<string, unknown>;
      const msg = json.message ?? json.error ?? json.detail;
      if (typeof msg === "string" && msg.length > 0) return msg;
      return JSON.stringify(json);
    }
    const text = await res.text();
    return text || res.statusText || `HTTP ${res.status}`;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

async function fetchProxy<T>(
  path: string,
  init: RequestInit,
  signal: AbortSignal,
  redactedRequestSummary: unknown,
): Promise<FetchResult<T>> {
  const url = `${PROXY_BASE}/${path}`;
  let networkErr: DolphinFetchError | null = null;

  for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
    if (signal.aborted) {
      return {
        ok: false,
        error: { kind: "aborted", message: "Request aborted" },
      };
    }

    try {
      devLog(
        `→ ${init.method ?? "GET"} ${url} (attempt ${attempt + 1}/${RETRY_MAX_ATTEMPTS})`,
        redactedRequestSummary,
      );
      const res = await fetch(url, { ...init, signal });

      if (res.status === 401 || res.status === 403) {
        const message = await readErrorMessage(res);
        devLog(`← ${res.status} auth ${url}`, { message });
        return {
          ok: false,
          error: {
            kind: "auth",
            status: res.status as 401 | 403,
            message,
          },
        };
      }

      if (res.status === 429) {
        const retryAfterHeader = res.headers.get("retry-after");
        const retryAfterMs =
          retryAfterHeader && Number.isFinite(Number(retryAfterHeader))
            ? Number(retryAfterHeader) * 1_000
            : 30_000;
        const message = await readErrorMessage(res);
        devLog(`← 429 rate-limit ${url}`, { retryAfterMs, message });
        return {
          ok: false,
          error: { kind: "rate_limit", retryAfterMs, message },
        };
      }

      if (res.status >= 400 && res.status < 500) {
        const message = await readErrorMessage(res);
        devLog(`← ${res.status} validation ${url}`, { message });
        return {
          ok: false,
          error: { kind: "validation", status: res.status, message },
        };
      }

      if (res.status >= 500) {
        const message = await readErrorMessage(res);
        const error: DolphinFetchError = {
          kind: "server",
          status: res.status,
          message,
        };
        devLog(`← ${res.status} server ${url}`, { message });
        if (attempt < RETRY_MAX_ATTEMPTS - 1) {
          try {
            await sleep(RETRY_BACKOFF_MS[attempt], signal);
          } catch {
            return {
              ok: false,
              error: { kind: "aborted", message: "Request aborted" },
            };
          }
          continue;
        }
        return { ok: false, error };
      }

      const data = (await res.json()) as T;
      devLog(`← ${res.status} ok ${url}`, data);
      return { ok: true, data };
    } catch (err) {
      if (isAbortError(err)) {
        return {
          ok: false,
          error: { kind: "aborted", message: "Request aborted" },
        };
      }
      const message = err instanceof Error ? err.message : "Network error";
      networkErr = { kind: "network", message };
      devLog(`✗ network ${url}`, { message, attempt: attempt + 1 });
      if (attempt < RETRY_MAX_ATTEMPTS - 1) {
        try {
          await sleep(RETRY_BACKOFF_MS[attempt], signal);
        } catch {
          return {
            ok: false,
            error: { kind: "aborted", message: "Request aborted" },
          };
        }
        continue;
      }
    }
  }

  return {
    ok: false,
    error: networkErr ?? { kind: "network", message: "All retries failed" },
  };
}

function unwrapData(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const obj = value as Record<string, unknown>;
  if ("data" in obj) return obj.data;
  return value;
}

function extractUseragent(response: unknown): string | null {
  if (typeof response === "string" && response.length > 0) return response;
  const unwrapped = unwrapData(response);
  if (typeof unwrapped === "string" && unwrapped.length > 0) return unwrapped;
  if (typeof unwrapped === "object" && unwrapped !== null) {
    const obj = unwrapped as Record<string, unknown>;
    if (typeof obj.useragent === "string") return obj.useragent;
    if (typeof obj.ua === "string") return obj.ua;
    if (typeof obj.user_agent === "string") return obj.user_agent;
    if (typeof obj.userAgent === "string") return obj.userAgent;
    if (typeof obj.value === "string") return obj.value;
  }
  return null;
}

function extractWebgl(response: unknown): WebglFingerprint | null {
  if (typeof response !== "object" || response === null) return null;
  const unwrapped = unwrapData(response);
  if (typeof unwrapped !== "object" || unwrapped === null) return null;
  const obj = unwrapped as Record<string, unknown>;
  if (typeof obj.webgl === "object" && obj.webgl !== null) {
    return obj.webgl as WebglFingerprint;
  }
  return obj as WebglFingerprint;
}

function extractWebglInfo(response: unknown): DolphinWebglInfo | null {
  const raw = extractWebgl(response);
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const vendor =
    (typeof obj.webgl_unmasked_vendor === "string" && obj.webgl_unmasked_vendor) ||
    (typeof obj.webglUnmaskedVendor === "string" && obj.webglUnmaskedVendor) ||
    "";
  const renderer =
    (typeof obj.webgl_unmasked_renderer === "string" && obj.webgl_unmasked_renderer) ||
    (typeof obj.webglUnmaskedRenderer === "string" && obj.webglUnmaskedRenderer) ||
    "";

  const webgl2Maximum =
    (typeof obj.webgl2Maximum === "string" && obj.webgl2Maximum) ||
    (typeof obj.webgl2_maximum === "string" && obj.webgl2_maximum) ||
    undefined;

  if (!vendor || !renderer) return null;
  return { mode: "manual", vendor, renderer, webgl2Maximum };
}

function extractProfileId(response: unknown): string | null {
  if (typeof response !== "object" || response === null) return null;
  const obj = response as Record<string, unknown>;

  if (typeof obj.data === "object" && obj.data !== null) {
    const data = obj.data as Record<string, unknown>;
    if (typeof data.id === "string" || typeof data.id === "number") {
      return String(data.id);
    }
    if (
      typeof data.browserProfileId === "string" ||
      typeof data.browserProfileId === "number"
    ) {
      return String(data.browserProfileId);
    }
  }
  if (typeof obj.id === "string" || typeof obj.id === "number") {
    return String(obj.id);
  }
  if (
    typeof obj.browserProfileId === "string" ||
    typeof obj.browserProfileId === "number"
  ) {
    return String(obj.browserProfileId);
  }
  return null;
}

function redactProfilePayload(payload: DolphinCreateProfilePayload): unknown {
  return {
    ...payload,
    proxy: {
      type: payload.proxy.type,
      host: payload.proxy.host,
      port: payload.proxy.port,
      login: payload.proxy.login ? "***" : undefined,
      password: payload.proxy.password ? "***" : undefined,
    },
  };
}

/**
 * Browser-side wrapper around `/api/dolphin/proxy/[...path]` (which forwards
 * to Dolphin Anty with the Authorization header injected from the cookie).
 *
 * One instance per bulk run — share the AbortSignal so `cancelRun()` can
 * abort all in-flight requests at once.
 */
export class DolphinClient {
  constructor(private readonly signal: AbortSignal) {}

  /** GET /fingerprints/useragent — random Anty UA for the platform/version. */
  async fetchUseragent(
    platform: DolphinPlatform,
    version: DolphinBrowserVersion,
  ): Promise<FetchResult<{ useragent: string }>> {
    const qs = new URLSearchParams({
      browser_type: "anty",
      browser_version: version,
      platform,
    });
    const result = await fetchProxy<unknown>(
      `${DOLPHIN_API_PATH.useragent}?${qs.toString()}`,
      { method: "GET" },
      this.signal,
      { type: "useragent", platform, version },
    );
    if (!result.ok) return result;
    const ua = extractUseragent(result.data);
    if (!ua) {
      devLog(
        "⚠ useragent response shape unexpected — update extractUseragent",
        result.data,
      );
      return {
        ok: false,
        error: {
          kind: "server",
          status: 200,
          message: "Useragent response shape unexpected",
        },
      };
    }
    return { ok: true, data: { useragent: ua } };
  }

  /** GET /fingerprints/webgl — random Anty WebGL fingerprint for the platform. */
  async fetchWebgl(
    platform: DolphinPlatform,
  ): Promise<FetchResult<WebglFingerprint>> {
    const qs = new URLSearchParams({ browser_type: "anty", platform });
    const result = await fetchProxy<unknown>(
      `${DOLPHIN_API_PATH.webgl}?${qs.toString()}`,
      { method: "GET" },
      this.signal,
      { type: "webgl", platform },
    );
    if (!result.ok) return result;
    const webgl = extractWebgl(result.data);
    if (!webgl) {
      devLog(
        "⚠ webgl response shape unexpected — update extractWebgl",
        result.data,
      );
      return {
        ok: false,
        error: {
          kind: "server",
          status: 200,
          message: "Webgl response shape unexpected",
        },
      };
    }
    return { ok: true, data: webgl };
  }

  /** Convenience: useragent + webgl, sequential (Dolphin doesn't batch). */
  async generateFingerprint(
    platform: DolphinPlatform,
    version: DolphinBrowserVersion,
  ): Promise<FetchResult<DolphinFingerprintBundle>> {
    const ua = await this.fetchUseragent(platform, version);
    if (!ua.ok) return ua;
    const webgl = await this.fetchWebgl(platform);
    if (!webgl.ok) return webgl;
    return {
      ok: true,
      data: { useragent: ua.data.useragent, webgl: webgl.data },
    };
  }

  /** Convert `/fingerprints/webgl` response into `webglInfo` payload. */
  async generateWebglInfo(
    platform: DolphinPlatform,
  ): Promise<FetchResult<DolphinWebglInfo>> {
    const webgl = await this.fetchWebgl(platform);
    if (!webgl.ok) return webgl as FetchResult<DolphinWebglInfo>;
    const info = extractWebglInfo(webgl.data);
    if (!info) {
      devLog("⚠ webglInfo response shape unexpected — update extractWebglInfo", webgl.data);
      return {
        ok: false,
        error: { kind: "server", status: 200, message: "WebGL info response shape unexpected" },
      };
    }
    return { ok: true, data: info };
  }

  /** POST /browser_profiles — returns profile id on success. */
  async createProfile(
    payload: DolphinCreateProfilePayload,
  ): Promise<FetchResult<{ profileId: string }>> {
    const result = await fetchProxy<DolphinCreateProfileResponse>(
      DOLPHIN_API_PATH.browserProfiles,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      this.signal,
      redactProfilePayload(payload),
    );
    if (!result.ok) return result;
    const id = extractProfileId(result.data);
    if (!id) {
      devLog(
        "⚠ profile id not found in response (schema mismatch — update extractProfileId)",
        result.data,
      );
      return {
        ok: false,
        error: {
          kind: "server",
          status: 200,
          message: "Profile created but response is missing an id field",
        },
      };
    }
    return { ok: true, data: { profileId: id } };
  }
}

export function staggerJitterMs(): number {
  return jitter(BULK_CREATE_STAGGER_MIN_MS, BULK_CREATE_STAGGER_MAX_MS);
}

export function describeFetchError(err: DolphinFetchError): string {
  switch (err.kind) {
    case "auth":
      return `Authentication failed (${err.status}): ${err.message}`;
    case "rate_limit":
      return `Rate-limited; retry after ${Math.round(err.retryAfterMs / 1000)}s — ${err.message}`;
    case "validation":
      return `Request rejected (${err.status}): ${err.message}`;
    case "server":
      return `Dolphin server error (${err.status}): ${err.message}`;
    case "network":
      return `Network error: ${err.message}`;
    case "aborted":
      return "Cancelled";
  }
}
