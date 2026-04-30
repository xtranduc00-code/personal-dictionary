import {
  BROWSER_VERSIONS,
  PLATFORMS,
  PROXY_TYPES,
} from "@/lib/dolphin/constants";

export type DolphinPlatform = (typeof PLATFORMS)[number];
export type DolphinBrowserVersion = (typeof BROWSER_VERSIONS)[number];
export type ProxyType = (typeof PROXY_TYPES)[number];

export type ParsedProxy = {
  raw: string;
  type: ProxyType;
  host: string;
  port: number;
  user: string;
  pass: string;
};

export type ProxyValidation =
  | { ok: true; proxy: ParsedProxy }
  | { ok: false; reason: string };

export type ProxyParseError = {
  line: number;
  raw: string;
  reason: string;
};

export type NameParseError = {
  line: number;
  raw: string;
  reason: string;
};

export type ProfilePair = {
  name: string;
  proxy: ParsedProxy;
  notes?: string;
};

export type Validation = { ok: true } | { ok: false; reason: string };

export type WebglFingerprint = Record<string, unknown>;
export type UserAgentFingerprint = { useragent: string } & Record<string, unknown>;

export type DolphinFingerprintBundle = {
  useragent: string;
  webgl: WebglFingerprint;
};

export type DolphinWebglInfo = {
  mode: "manual";
  vendor: string;
  renderer: string;
  webgl2Maximum?: string;
};

export type DolphinWebrtc = { mode: "altered"; ipAddress: null };
export type DolphinCanvas = { mode: "real" };
export type DolphinWebgl = { mode: "real" };
export type DolphinAutoField<T> = { mode: "auto"; value: T | null };
export type DolphinManualField<T> = { mode: "manual"; value: T };

export type DolphinProxyPayload = {
  name: string;
  type: ProxyType;
  host: string;
  port: string;
  login: string;
  password: string;
};

export type DolphinCreateProfilePayload = {
  name: string;
  platform: DolphinPlatform;
  browserType: "anty";
  useragent: { mode: "manual"; value: string };
  webrtc: DolphinWebrtc;
  canvas: DolphinCanvas;
  webgl: DolphinWebgl;
  webglInfo: DolphinWebglInfo;
  timezone?: DolphinAutoField<string>;
  locale?: DolphinAutoField<string>;
  cpu?: DolphinManualField<number>;
  memory?: DolphinManualField<number>;
  doNotTrack?: boolean;
  osVersion?: string;
  proxy: DolphinProxyPayload;
  tags?: string[];
  mainWebsite?: string;
  notes?: { content: string; color: string; style: string };
};

export type DolphinCreateProfileResponse = {
  data?: { id?: number | string };
  browserProfileId?: number | string;
  id?: number | string;
} & Record<string, unknown>;

export type CreateResultSuccess = {
  ok: true;
  name: string;
  profileId: string;
  proxy: { type: ProxyType; host: string; port: number };
};

export type CreateResultFailure = {
  ok: false;
  name: string;
  proxy: { type: ProxyType; host: string; port: number } | null;
  reason: string;
};

export type CreateResult = CreateResultSuccess | CreateResultFailure;

export type LoginResultSuccess = {
  ok: true;
  name: string;
  profileId: string;
  email: string;
};

export type LoginResultFailure = {
  ok: false;
  name: string;
  profileId: string;
  reason: string;
};

export type LoginResult = LoginResultSuccess | LoginResultFailure;

export type LogEntry =
  | ({ kind: "create" } & CreateResult)
  | ({ kind: "login" } & LoginResult);

export type BulkCreateFormValues = {
  namePrefix: string;
  startIndex: number;
  platform: DolphinPlatform;
  browserVersion: DolphinBrowserVersion;
  tag: string;
  autoFingerprint: boolean;
  proxiesText: string;
  profileNamesText: string;
  notesText: string;
};

export type DolphinFetchError =
  | { kind: "network"; message: string }
  | { kind: "auth"; status: 401 | 403; message: string }
  | { kind: "rate_limit"; retryAfterMs: number; message: string }
  | { kind: "validation"; status: number; message: string }
  | { kind: "server"; status: number; message: string }
  | { kind: "aborted"; message: string };
