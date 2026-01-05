"use client";

import { CallKenPage } from "@/call-ken/routes/index";
import { useEffect } from "react";
import {
  isAudioSupported,
  preloadAudio,
  sounds,
} from "@/call-ken/lib/audio";

export default function RealTimeCallPage() {
  useEffect(() => {
    if (isAudioSupported()) {
      preloadAudio(sounds.dialing);
      preloadAudio(sounds.connected);
    }
  }, []);

  const getApiKey = async () => {
    const res = await fetch("/api/realtime-client-secret");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to get session");
    return { apiKey: data.apiKey };
  };

  return (
    <div
      className="-mx-4 min-h-full w-[calc(100%+2rem)] overflow-y-auto bg-zinc-50 pt-2 md:-mx-8 md:w-[calc(100%+4rem)] md:pt-4 dark:bg-zinc-950"
      style={{ minHeight: "calc(100vh - 3rem)", fontFamily: "var(--font-geist-sans), sans-serif" }}
    >
      <CallKenPage getApiKey={getApiKey} />
    </div>
  );
}
