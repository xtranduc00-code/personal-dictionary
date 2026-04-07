"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { subscribeMicLevel } from "@/lib/meets-mic-level-analyser";
import { MicLevelBars } from "@/components/livekit/MicLevelBars";

type Props = {
  onReady: () => void;
};

type Phase = "intro" | "live" | "error";

function micErrorKey(err: unknown): "denied" | "notfound" | "generic" {
  if (err && typeof err === "object" && "name" in err) {
    const n = String((err as DOMException).name);
    if (n === "NotAllowedError" || n === "SecurityError") {
      return "denied";
    }
    if (n === "NotFoundError" || n === "DevicesNotFoundError") {
      return "notfound";
    }
  }
  return "generic";
}

export const MeetsMicPrecheck = memo(function MeetsMicPrecheck({ onReady }: Props) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("intro");
  const [level, setLevel] = useState(0);
  const [errorKey, setErrorKey] = useState<"denied" | "notfound" | "generic" | null>(
    null,
  );
  const streamRef = useRef<MediaStream | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const cleanupStream = useCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => () => cleanupStream(), [cleanupStream]);

  const requestMic = useCallback(async () => {
    setErrorKey(null);
    cleanupStream();
    setPhase("intro");
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorKey("generic");
      setPhase("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      streamRef.current = stream;
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        setErrorKey("notfound");
        setPhase("error");
        cleanupStream();
        return;
      }
      unsubRef.current = subscribeMicLevel(audioTrack, (v) => setLevel(v));
      setPhase("live");
    }
    catch (e) {
      setErrorKey(micErrorKey(e));
      setPhase("error");
      cleanupStream();
    }
  }, [cleanupStream]);

  const enterRoom = useCallback(() => {
    cleanupStream();
    onReady();
  }, [cleanupStream, onReady]);

  const errorMessage =
    errorKey === "denied"
      ? t("meetsMicErrorDenied")
      : errorKey === "notfound"
        ? t("meetsMicErrorNotFound")
        : errorKey === "generic"
          ? t("meetsMicErrorGeneric")
          : null;

  return (
    <div className="flex min-h-[min(60vh,420px)] flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
        <Mic className="h-7 w-7" strokeWidth={2} aria-hidden />
      </div>
      <div className="max-w-md space-y-2">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {t("meetsMicPrecheckTitle")}
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t("meetsMicPrecheckHint")}
        </p>
      </div>

      {phase === "error" && errorMessage ? (
        <p className="max-w-md rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-100">
          {errorMessage}
        </p>
      ) : null}

      {phase === "live" ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {t("meetsMicPrecheckSpeak")}
          </p>
          <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-6 py-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80">
            <MicLevelBars
              level={level}
              className="text-emerald-600 dark:text-emerald-400"
              barClassName="bg-emerald-500 dark:bg-emerald-400"
            />
          </div>
          <button
            type="button"
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            onClick={enterRoom}
          >
            {t("meetsMicPrecheckEnterRoom")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            onClick={() => void requestMic()}
          >
            {t("meetsMicPrecheckAllow")}
          </button>
          <button
            type="button"
            className="text-xs text-[#9CA3AF] underline-offset-2 hover:text-[#6B7280] hover:underline dark:text-zinc-500 dark:hover:text-zinc-400"
            onClick={enterRoom}
          >
            {t("meetsMicPrecheckSkip")}
          </button>
        </div>
      )}
    </div>
  );
});
