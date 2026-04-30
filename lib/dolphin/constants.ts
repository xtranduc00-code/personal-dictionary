export const DOLPHIN_API_TOKEN_ENV = "DOLPHIN_API_TOKEN";

export const DOLPHIN_API_BASE = "https://dolphin-anty-api.com";

export const DOLPHIN_API_PATH = {
  webgl: "fingerprints/webgl",
  useragent: "fingerprints/useragent",
  browserProfiles: "browser_profiles",
} as const;

export const PLATFORMS = ["windows", "macos", "linux"] as const;
export const BROWSER_VERSIONS = ["140", "139", "138"] as const;
export const PROXY_TYPES = ["http"] as const;

export const DEFAULT_NAME_PREFIX = "acc_";
export const DEFAULT_START_INDEX = 1;
export const DEFAULT_PLATFORM = "macos";
export const DEFAULT_BROWSER_VERSION = "140";

export const BULK_CREATE_CONCURRENCY = 5;
export const BULK_CREATE_STAGGER_MIN_MS = 200;
export const BULK_CREATE_STAGGER_MAX_MS = 500;

export const RETRY_MAX_ATTEMPTS = 3;
export const RETRY_BACKOFF_MS = [1_000, 2_000, 4_000] as const;
export const RATE_LIMIT_PAUSE_MS = 30_000;

export const PROXY_REGEX =
  /^(?:https?:\/\/)?([0-9.]+):(\d+):([^:]+):([^:]+)$/;

export const NAME_PREFIX_REGEX = /^[A-Za-z0-9_-]+$/;
export const NAME_PREFIX_MAX_LEN = 32;

export const TAG_MAX_LEN = 64;
