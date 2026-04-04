"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import type { EngooArticlePayload } from "@/lib/engoo-types";

const CallKenPage = dynamic(
  () =>
    import("@/features/call-ken/routes/index").then((m) => m.CallKenPage),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-zinc-500 dark:text-zinc-400">
        Loading tutor…
      </div>
    ),
  },
);

export function EngooReadingTutorPanel({
  open,
  onClose,
  masterId,
  payload,
}: {
  open: boolean;
  onClose: () => void;
  masterId: string;
  payload: EngooArticlePayload | null;
}) {
  const getApiKey = useMemo(
    () => async () => {
      const res = await fetch("/api/realtime-client-secret");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to get session");
      return { apiKey: data.apiKey };
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    void import("@/features/call-ken/lib/audio").then((audio) => {
      if (audio.isAudioSupported()) {
        audio.preloadAudio(audio.sounds.dialing);
        audio.preloadAudio(audio.sounds.connected);
      }
    });
  }, [open]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close tutor"
        className="fixed inset-0 z-[84] bg-black/30 md:hidden"
        onClick={onClose}
      />
      <aside
        className="fixed bottom-0 right-0 z-[90] flex max-h-[58vh] w-full flex-col overflow-hidden rounded-t-2xl border border-zinc-200 border-b-0 bg-zinc-50 shadow-[0_-12px_40px_rgba(15,23,42,0.15)] dark:border-zinc-700 dark:bg-zinc-950 md:top-0 md:max-h-none md:h-full md:w-[440px] md:rounded-none md:rounded-l-2xl md:border-b md:border-l md:border-t md:shadow-2xl"
        aria-label="AI reading tutor"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900 md:px-4">
          <span className="min-w-0 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {payload?.title ? (
              <span className="line-clamp-1" title={payload.title}>
                Tutor · {payload.title}
              </span>
            ) : (
              "Reading tutor"
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-2 shrink-0 rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Close tutor panel"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <CallKenPage
            getApiKey={getApiKey}
            initialEngooMasterId={masterId}
            engooPayloadOverride={payload}
            layout="embedded"
          />
        </div>
      </aside>
    </>
  );
}
