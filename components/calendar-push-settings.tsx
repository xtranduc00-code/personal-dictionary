"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, Loader2, Send } from "lucide-react";
import { toast } from "react-toastify";
import { authFetch } from "@/lib/auth-context";
import { useI18n } from "@/components/i18n-provider";

function applicationServerKeyFromVapidBase64(
  base64String: string,
): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buf = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < rawData.length; ++i) {
    view[i] = rawData.charCodeAt(i);
  }
  return buf;
}

function isNumericIpHostname(hostname: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
}

export function CalendarPushSettings() {
  const { t } = useI18n();
  const [serverConfigured, setServerConfigured] = useState<boolean | null>(
    null,
  );
  const [subscriptionCount, setSubscriptionCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const isDev = process.env.NODE_ENV === "development";
  const [browserSubscribed, setBrowserSubscribed] = useState(false);
  const enableInFlight = useRef(false);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await authFetch("/api/push/status");
      if (!res.ok) return;
      const data = (await res.json()) as {
        configured?: boolean;
        subscriptionCount?: number;
      };
      setServerConfigured(data.configured ?? false);
      setSubscriptionCount(data.subscriptionCount ?? 0);
    } catch {
      setServerConfigured(false);
    }
  }, []);

  const syncBrowserSubscription = useCallback(async () => {
    if (!("serviceWorker" in navigator)) {
      setBrowserSubscribed(false);
      return;
    }
    try {
      await navigator.serviceWorker.ready;
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          setBrowserSubscribed(true);
          return;
        }
      }
      setBrowserSubscribed(false);
    } catch {
      setBrowserSubscribed(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    void syncBrowserSubscription();
  }, [syncBrowserSubscription, subscriptionCount]);

  // Dev: auto-poll the reminder sweep every 15s so notifications fire without manual steps.
  useEffect(() => {
    if (!isDev) return;
    const id = setInterval(() => {
      fetch("/api/push/dev-cron", { method: "POST" }).catch(() => {});
    }, 15_000);
    return () => clearInterval(id);
  }, [isDev]);

  const registerSw = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return null;
    return navigator.serviceWorker.register("/sw.js", { scope: "/" });
  }, []);

  const enablePush = async () => {
    if (enableInFlight.current) return;
    enableInFlight.current = true;
    setBusy(true);
    try {
      if (!("Notification" in window)) return;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
      const vapidRes = await fetch("/api/push/vapid-public-key");
      const vapidJson = (await vapidRes.json()) as {
        configured?: boolean;
        publicKey?: string | null;
      };
      if (!vapidJson.configured || !vapidJson.publicKey) return;
      const reg = await registerSw();
      if (!reg) return;
      await reg.update();
      const existingSub = await reg.pushManager.getSubscription();
      if (existingSub) {
        const oldEndpoint = existingSub.endpoint;
        await existingSub.unsubscribe().catch(() => {});
        await authFetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: oldEndpoint }),
        }).catch(() => {});
      }
      let sub: PushSubscription;
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKeyFromVapidBase64(
            vapidJson.publicKey,
          ),
        });
      } catch (err) {
        console.error("pushManager.subscribe error:", err);
        const host =
          typeof window !== "undefined" ? window.location.hostname : "";
        toast.warning(
          isNumericIpHostname(host)
            ? t("calendarPushUnavailableLoopback")
            : t("calendarPushUnavailableOther"),
          {
            containerId: "cal",
            autoClose: 8000,
            toastId: "push-unavailable",
          },
        );
        return;
      }
      const json = sub.toJSON();
      const save = await authFetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: json }),
      });
      if (!save.ok) {
        await sub.unsubscribe().catch(() => {});
        return;
      }
      setBrowserSubscribed(true);
      await refreshStatus();
      await syncBrowserSubscription();
    } finally {
      setBusy(false);
      enableInFlight.current = false;
    }
  };

  const disablePush = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      const endpoint = sub?.endpoint;
      if (sub) await sub.unsubscribe().catch(() => {});
      await authFetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(endpoint ? { endpoint } : {}),
      });
      await refreshStatus();
      await syncBrowserSubscription();
    } finally {
      setBusy(false);
    }
  };

  const testPush = async () => {
    setTestBusy(true);
    try {
      const res = await authFetch("/api/push/test", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        sent?: number;
        failed?: number;
        error?: string;
        lastStatusCode?: number;
        lastDetail?: string;
      };
      if (res.status === 400 && data.error === "No subscription") {
        toast.info(t("calendarPushTestNoSub"), { containerId: "cal" });
        return;
      }
      if (!res.ok) {
        toast.error(t("calendarPushTestFailed"), { containerId: "cal" });
        return;
      }
      const sent = data.sent ?? 0;
      const failed = data.failed ?? 0;
      if (failed > 0) {
        const base = t("calendarPushTestPartial")
          .replace("{sent}", String(sent))
          .replace("{failed}", String(failed));
        const bits = [base];
        if (data.lastStatusCode != null) {
          bits.push(`HTTP ${data.lastStatusCode}`);
        }
        if (data.lastDetail) {
          bits.push(data.lastDetail);
        }
        if (
          /do not correspond to the credentials/i.test(data.lastDetail ?? "")
        ) {
          bits.push(t("calendarPushTestStaleSub"));
        } else if (/P-256|curve/i.test(data.lastDetail ?? "")) {
          bits.push(t("calendarPushTestHintP256"));
        } else if (data.lastStatusCode === 403 || data.lastStatusCode === 401) {
          bits.push(t("calendarPushTestHint403"));
        }
        toast.warning(bits.join(" — "), {
          containerId: "cal",
          autoClose: 12000,
          toastId: "push-test-result",
        });
      } else {
        toast.success(t("calendarPushTestOk").replace("{n}", String(sent)), {
          containerId: "cal",
        });
      }
    } catch {
      toast.error(t("calendarPushTestFailed"), { containerId: "cal" });
    } finally {
      setTestBusy(false);
      void refreshStatus().then(() => syncBrowserSubscription());
    }
  };

  if (serverConfigured !== true) return null;

  const active = subscriptionCount > 0 && browserSubscribed;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
          <Bell className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {t("calendarPushTitle")}
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {active ? (
              <>
                <button
                  type="button"
                  disabled={busy || testBusy}
                  onClick={() => void testPush()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  {testBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {t("calendarPushTest")}
                </button>
                <button
                  type="button"
                  disabled={busy || testBusy}
                  onClick={() => void disablePush()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <BellOff className="h-3.5 w-3.5" />
                  )}
                  {t("calendarPushDisable")}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void enablePush()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Bell className="h-3.5 w-3.5" />
                )}
                {t("calendarPushEnable")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
