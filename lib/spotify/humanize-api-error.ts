import type { TranslationKey } from "@/lib/i18n";

type Translate = (key: TranslationKey) => string;

type SpotifyErrShape = {
  error?: { message?: string; status?: number; reason?: string } | string;
  message?: string;
};

function spotifyErrObject(
  o: SpotifyErrShape,
): { message?: string; status?: number; reason?: string } | undefined {
  if (typeof o.error === "object" && o.error && "message" in o.error) {
    return o.error as { message?: string; status?: number; reason?: string };
  }
  return undefined;
}

/** Pull a human message out of Spotify/Web API error bodies (JSON or plain). */
export function extractSpotifyApiMessage(raw: string): string {
  const s = raw.trim();
  if (!s.startsWith("{")) return s.slice(0, 400);
  try {
    const o = JSON.parse(s) as SpotifyErrShape;
    const errObj = spotifyErrObject(o);
    if (errObj) {
      const m = errObj.message;
      if (typeof m === "string" && m.length > 0) return m;
    }
    if (typeof o.error === "string") return o.error;
    if (typeof o.message === "string") return o.message;
  } catch {
    /* ignore */
  }
  return s.slice(0, 400);
}

/** Parsed Spotify error — avoids treating raw JSON (with "403" inside) as user-facing text. */
export function parseSpotifyError(raw: string): {
  message: string;
  httpStatus?: number;
  reason?: string;
} {
  const s = raw.trim();
  if (!s.startsWith("{")) {
    return { message: s.slice(0, 400) };
  }
  try {
    const o = JSON.parse(s) as SpotifyErrShape;
    const errObj = spotifyErrObject(o);
    if (errObj) {
      const m = errObj.message;
      const st = errObj.status;
      const r =
        typeof errObj.reason === "string" && errObj.reason.length > 0
          ? errObj.reason
          : undefined;
      if (typeof m === "string" && m.length > 0) {
        return {
          message: m,
          httpStatus: typeof st === "number" ? st : undefined,
          reason: r,
        };
      }
      if (typeof st === "number") {
        return { message: "", httpStatus: st, reason: r };
      }
    }
    if (typeof o.error === "string" && o.error.length > 0) {
      return { message: o.error };
    }
    if (typeof o.message === "string" && o.message.length > 0) {
      return { message: o.message };
    }
  } catch {
    /* fall through */
  }
  return { message: s.slice(0, 400) };
}

/** True when Spotify text clearly means catalog / geo / account restriction (not generic HTTP Forbidden). */
function isExplicitRestriction(lower: string): boolean {
  return (
    /restriction|not available in your market|not playable in your country|region locked|playback_restricted|content unavailable|victim of account/i.test(
      lower,
    )
  );
}

/** Playlist / search / non-playback Web API errors. */
export function humanizeSpotifyApiErrorText(raw: string, t: Translate): string {
  if (!raw.trim()) return t("spotifyErrGenericRequest");

  const { message: msg, httpStatus, reason } = parseSpotifyError(raw);
  const lower = msg.toLowerCase();
  const reasonLower = (reason ?? "").toLowerCase();
  const combined = `${lower} ${reasonLower}`.trim();

  if (/invalid limit/i.test(msg)) return t("spotifyErrInvalidLimit");
  if (/device not found/i.test(lower)) return t("spotifyErrDeviceNotFound");
  if (/premium|subscription|not available for your country/i.test(msg)) {
    return t("spotifyPlayerAccountError");
  }
  if (/rate limit|429|too many requests/i.test(lower)) {
    return t("spotifyErrRateLimited");
  }

  if (isExplicitRestriction(lower) || isExplicitRestriction(reasonLower)) {
    return t("spotifyErrPlaybackRestricted");
  }

  if (/insufficient client scope/i.test(combined)) {
    return t("spotifyErrPlaylistScopeReconnect");
  }

  /**
   * Spotify often returns 403 + { message: "Forbidden" }. Do not surface that
   * verbatim — it must be handled before the generic "short message passthrough"
   * branch below (same idea as humanizeSpotifyPlaybackApiError).
   */
  if (httpStatus === 403) {
    if (msg.length === 0 || lower === "forbidden" || lower === "access denied") {
      return t("spotifyErrPlaylistTracksRefused");
    }
    if (
      msg.length > 0 &&
      msg.length < 220 &&
      !msg.includes("{") &&
      !msg.includes("}")
    ) {
      return msg;
    }
    return t("spotifyErrPlaylistTracksRefused");
  }

  if (lower === "forbidden" || lower === "access denied") {
    return t("spotifyErrPlaylistTracksRefused");
  }

  if (
    msg.length > 0 &&
    msg.length < 220 &&
    !msg.includes("{") &&
    !msg.includes("}")
  ) {
    return msg;
  }

  return t("spotifyErrGenericRequest");
}

/** Playback fetch failed — use HTTP status first (401 ≠ 403). */
export function humanizeSpotifyPlaybackHttpError(
  status: number,
  raw: string,
  t: Translate,
): string {
  if (status === 401) return t("spotifyPlaybackAuthRequired");
  return humanizeSpotifyPlaybackApiError(raw, t);
}

/**
 * PUT /me/player/play and related playback commands.
 * Spotify often returns 403 + message "Forbidden" for device/context issues — NOT account/region.
 */
export function humanizeSpotifyPlaybackApiError(raw: string, t: Translate): string {
  if (!raw.trim()) return t("spotifyErrGenericRequest");

  const { message: msg, httpStatus } = parseSpotifyError(raw);
  const lower = msg.toLowerCase();

  if (/invalid limit/i.test(msg)) return t("spotifyErrInvalidLimit");

  if (
    /device not found|no active device|device id not found|not active|player command failed:\s*no active|the requested resource could not be found/i.test(
      lower,
    )
  ) {
    return t("spotifyErrDeviceNotFound");
  }

  if (/premium|subscription|not available for your country|only premium/i.test(lower)) {
    return t("spotifyPlayerAccountError");
  }

  if (/rate limit|429|too many requests/i.test(lower)) {
    return t("spotifyErrRateLimited");
  }

  if (isExplicitRestriction(lower)) {
    return t("spotifyErrPlaybackRestricted");
  }

  if (httpStatus === 404) {
    return t("spotifyErrDeviceNotFound");
  }

  /**
   * Generic 403 from play endpoint — usually device inactive, scope edge, or transient refusal.
   * Do NOT label as "account or region" unless isExplicitRestriction matched.
   */
  if (httpStatus === 403) {
    if (msg.length > 0 && msg.length < 180 && !msg.includes("{")) {
      if (lower === "forbidden" || lower === "access denied") {
        return t("spotifyErrPlaybackForbiddenGeneric");
      }
    }
    return msg.length > 0 && msg.length < 220 && !msg.includes("{")
      ? msg
      : t("spotifyErrPlaybackForbiddenGeneric");
  }

  if (
    msg.length > 0 &&
    msg.length < 220 &&
    !msg.includes("{") &&
    !msg.includes("}")
  ) {
    return msg;
  }

  return t("spotifyErrGenericRequest");
}
