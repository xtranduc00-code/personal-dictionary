"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DolphinContext,
  type DolphinState,
} from "@/lib/dolphin/context";
import {
  DolphinClient,
  describeFetchError,
  staggerJitterMs,
} from "@/lib/dolphin/client";
import {
  createLimiter,
  sleep,
} from "@/lib/dolphin/concurrency";
import { BULK_CREATE_CONCURRENCY } from "@/lib/dolphin/constants";
import type {
  BulkCreateFormValues,
  CreateResult,
  DolphinCreateProfilePayload,
  LoginResult,
  ProfilePair,
} from "@/lib/dolphin/types";

const INITIAL_STATE: DolphinState = {
  status: "idle",
  results: [],
  totalCount: 0,
  pauseRemainingMs: 0,
  pauseReason: null,
  errorMessage: null,
};

const PAUSE_TICK_MS = 250;
const MAX_PAUSE_RETRIES_PER_TASK = 3;

type RunRefs = {
  ac: AbortController;
  cancelledByUser: boolean;
  authStopped: boolean;
  pausePromise: Promise<void> | null;
};

export function DolphinProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DolphinState>(INITIAL_STATE);
  const runRef = useRef<RunRefs | null>(null);

  const cancelRun = useCallback(() => {
    const refs = runRef.current;
    if (!refs) return;
    refs.cancelledByUser = true;
    refs.ac.abort();
    setState((s) =>
      s.status === "running" || s.status === "paused"
        ? {
            ...s,
            status: "cancelled",
            pauseRemainingMs: 0,
            pauseReason: null,
          }
        : s,
    );
  }, []);

  const resetResults = useCallback(() => {
    if (
      runRef.current &&
      (state.status === "running" || state.status === "paused")
    ) {
      return;
    }
    setState(INITIAL_STATE);
  }, [state.status]);

  const runBulkCreate = useCallback(
    async (pairs: ProfilePair[], form: BulkCreateFormValues) => {
      if (pairs.length === 0) return;
      if (runRef.current) return;

      const ac = new AbortController();
      const refs: RunRefs = {
        ac,
        cancelledByUser: false,
        authStopped: false,
        pausePromise: null,
      };
      runRef.current = refs;

      const signal = ac.signal;
      const client = new DolphinClient(signal);
      const limit = createLimiter(BULK_CREATE_CONCURRENCY);

      setState({
        ...INITIAL_STATE,
        status: "running",
        totalCount: pairs.length,
      });

      const tag = form.tag.trim();
      const tags = tag.length > 0 ? [tag] : undefined;

      const triggerPause = (
        reason: string,
        durationMs: number,
      ): Promise<void> => {
        if (refs.pausePromise) return refs.pausePromise;
        const promise = new Promise<void>((resolve) => {
          const start = Date.now();
          let interval: ReturnType<typeof setInterval> | null = null;
          let timer: ReturnType<typeof setTimeout> | null = null;

          const finish = () => {
            if (interval) clearInterval(interval);
            if (timer) clearTimeout(timer);
            signal.removeEventListener("abort", onAbort);
            resolve();
          };

          const onAbort = () => finish();

          interval = setInterval(() => {
            const remaining = Math.max(0, durationMs - (Date.now() - start));
            setState((s) =>
              s.status === "paused"
                ? { ...s, pauseRemainingMs: remaining }
                : s,
            );
          }, PAUSE_TICK_MS);

          timer = setTimeout(() => {
            finish();
            setState((s) =>
              s.status === "paused"
                ? {
                    ...s,
                    status: "running",
                    pauseRemainingMs: 0,
                    pauseReason: null,
                  }
                : s,
            );
          }, durationMs);

          signal.addEventListener("abort", onAbort, { once: true });
        });

        refs.pausePromise = promise;
        promise.finally(() => {
          if (refs.pausePromise === promise) refs.pausePromise = null;
        });

        setState((s) => ({
          ...s,
          status: "paused",
          pauseRemainingMs: durationMs,
          pauseReason: reason,
        }));
        return promise;
      };

      const buildPayload = (
        pair: ProfilePair,
        useragent: string,
        webglInfo: DolphinCreateProfilePayload["webglInfo"],
      ): DolphinCreateProfilePayload => {
        const osVersion =
          form.platform === "windows"
            ? "10"
            : undefined;
        const payload: DolphinCreateProfilePayload = {
          name: pair.name,
          platform: form.platform,
          browserType: "anty",
          useragent: { mode: "manual", value: useragent },
          mainWebsite: "",
          webrtc: { mode: "altered", ipAddress: null },
          canvas: { mode: "real" },
          webgl: { mode: "real" },
          webglInfo,
          timezone: { mode: "auto", value: null },
          locale: { mode: "auto", value: null },
          cpu: { mode: "manual", value: 8 },
          memory: { mode: "manual", value: 8 },
          doNotTrack: false,
          ...(osVersion ? { osVersion } : {}),
          proxy: {
            name: `${pair.proxy.type}://${pair.proxy.host}:${pair.proxy.port}`,
            type: pair.proxy.type,
            host: pair.proxy.host,
            port: String(pair.proxy.port),
            login: pair.proxy.user,
            password: pair.proxy.pass,
          },
        };
        if (tags) payload.tags = tags;
        if (pair.notes) {
          const content = pair.notes
            .split("|")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
            .join("<br>");
          payload.notes = {
            content,
            color: "blue",
            style: "text",
          };
        }
        return payload;
      };

      const stopReason = (): string =>
        refs.cancelledByUser
          ? "Cancelled"
          : refs.authStopped
            ? "Stopped (auth failure)"
            : "Cancelled";

      const processOne = async (pair: ProfilePair): Promise<CreateResult> => {
        const proxySummary = {
          type: pair.proxy.type,
          host: pair.proxy.host,
          port: pair.proxy.port,
        };

        let pauseRetries = 0;

        while (true) {
          if (signal.aborted) {
            return {
              ok: false,
              name: pair.name,
              proxy: proxySummary,
              reason: stopReason(),
            };
          }

          if (refs.pausePromise) {
            await refs.pausePromise;
          }
          await sleep(staggerJitterMs(), signal).catch(() => {});

          if (signal.aborted) {
            return {
              ok: false,
              name: pair.name,
              proxy: proxySummary,
              reason: stopReason(),
            };
          }

          let useragent = "";
          let webglInfo: DolphinCreateProfilePayload["webglInfo"] = {
            mode: "manual",
            vendor: "Google Inc.",
            renderer: "ANGLE",
          };

          if (form.autoFingerprint) {
            const fp = await client.generateFingerprint(
              form.platform,
              form.browserVersion,
            );
            if (!fp.ok) {
              if (fp.error.kind === "auth") {
                refs.authStopped = true;
                ac.abort();
                return {
                  ok: false,
                  name: pair.name,
                  proxy: proxySummary,
                  reason: describeFetchError(fp.error),
                };
              }
              if (
                fp.error.kind === "rate_limit" &&
                pauseRetries < MAX_PAUSE_RETRIES_PER_TASK
              ) {
                pauseRetries++;
                await triggerPause(fp.error.message, fp.error.retryAfterMs);
                continue;
              }
              if (fp.error.kind === "aborted") {
                return {
                  ok: false,
                  name: pair.name,
                  proxy: proxySummary,
                  reason: stopReason(),
                };
              }
              return {
                ok: false,
                name: pair.name,
                proxy: proxySummary,
                reason: describeFetchError(fp.error),
              };
            }
            useragent = fp.data.useragent;
            const wi = await client.generateWebglInfo(form.platform);
            if (!wi.ok) {
              if (wi.error.kind === "auth") {
                refs.authStopped = true;
                ac.abort();
                return {
                  ok: false,
                  name: pair.name,
                  proxy: proxySummary,
                  reason: describeFetchError(wi.error),
                };
              }
              if (
                wi.error.kind === "rate_limit" &&
                pauseRetries < MAX_PAUSE_RETRIES_PER_TASK
              ) {
                pauseRetries++;
                await triggerPause(wi.error.message, wi.error.retryAfterMs);
                continue;
              }
              if (wi.error.kind === "aborted") {
                return {
                  ok: false,
                  name: pair.name,
                  proxy: proxySummary,
                  reason: stopReason(),
                };
              }
              return {
                ok: false,
                name: pair.name,
                proxy: proxySummary,
                reason: describeFetchError(wi.error),
              };
            }
            webglInfo = wi.data;
          }

          const payload = buildPayload(pair, useragent, webglInfo);
          const created = await client.createProfile(payload);
          if (!created.ok) {
            if (created.error.kind === "auth") {
              refs.authStopped = true;
              ac.abort();
              return {
                ok: false,
                name: pair.name,
                proxy: proxySummary,
                reason: describeFetchError(created.error),
              };
            }
            if (
              created.error.kind === "rate_limit" &&
              pauseRetries < MAX_PAUSE_RETRIES_PER_TASK
            ) {
              pauseRetries++;
              await triggerPause(
                created.error.message,
                created.error.retryAfterMs,
              );
              continue;
            }
            if (created.error.kind === "aborted") {
              return {
                ok: false,
                name: pair.name,
                proxy: proxySummary,
                reason: stopReason(),
              };
            }
            return {
              ok: false,
              name: pair.name,
              proxy: proxySummary,
              reason: describeFetchError(created.error),
            };
          }

          return {
            ok: true,
            name: pair.name,
            profileId: created.data.profileId,
            proxy: proxySummary,
          };
        }
      };

      const parseLoginCreds = (
        notes: string | undefined,
      ): { email: string; password: string; totp: string } | null => {
        if (!notes) return null;
        const parts = notes
          .split("|")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (parts.length < 4) return null;
        if (!parts[0] || !parts[1] || !parts[3]) return null;
        return { email: parts[0], password: parts[1], totp: parts[3] };
      };

      const tryLogin = async (
        pair: ProfilePair,
        profileId: string,
      ): Promise<LoginResult | null> => {
        const creds = parseLoginCreds(pair.notes);
        if (!creds) return null;
        try {
          const res = await fetch("/api/dolphin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profileId, ...creds }),
            signal,
          });
          const data = (await res.json()) as
            | { ok: true; profileId: string; email: string }
            | { ok: false; profileId: string; reason: string };
          if (data.ok) {
            return {
              ok: true,
              name: pair.name,
              profileId,
              email: data.email,
            };
          }
          return {
            ok: false,
            name: pair.name,
            profileId,
            reason: data.reason,
          };
        } catch (err) {
          if (signal.aborted) return null;
          return {
            ok: false,
            name: pair.name,
            profileId,
            reason: err instanceof Error ? err.message : "Network error",
          };
        }
      };

      const tasks = pairs.map((pair) =>
        limit(async () => {
          const createResult = await processOne(pair);
          setState((s) => ({
            ...s,
            results: [...s.results, { kind: "create", ...createResult }],
          }));
          if (createResult.ok && !signal.aborted) {
            const loginResult = await tryLogin(pair, createResult.profileId);
            if (loginResult) {
              setState((s) => ({
                ...s,
                results: [...s.results, { kind: "login", ...loginResult }],
              }));
            }
          }
          return createResult;
        }),
      );

      try {
        await Promise.all(tasks);
      } catch (err) {
        setState((s) => ({
          ...s,
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        }));
      } finally {
        runRef.current = null;
        if (refs.cancelledByUser) {
          setState((s) => ({
            ...s,
            status: "cancelled",
            pauseRemainingMs: 0,
            pauseReason: null,
          }));
        } else if (refs.authStopped) {
          setState((s) => ({
            ...s,
            status: "failed",
            pauseRemainingMs: 0,
            pauseReason: null,
            errorMessage:
              s.errorMessage ?? "Authentication failed — bulk run stopped.",
          }));
        } else {
          setState((s) => ({
            ...s,
            status: "done",
            pauseRemainingMs: 0,
            pauseReason: null,
          }));
        }
      }
    },
    [],
  );

  useEffect(() => {
    return () => {
      const refs = runRef.current;
      if (refs) {
        refs.cancelledByUser = true;
        refs.ac.abort();
        runRef.current = null;
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      state,
      runBulkCreate,
      cancelRun,
      resetResults,
    }),
    [state, runBulkCreate, cancelRun, resetResults],
  );

  return (
    <DolphinContext.Provider value={value}>{children}</DolphinContext.Provider>
  );
}
