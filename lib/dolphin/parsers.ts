import {
  NAME_PREFIX_MAX_LEN,
  NAME_PREFIX_REGEX,
  PROXY_REGEX,
  TAG_MAX_LEN,
} from "@/lib/dolphin/constants";
import type {
  NameParseError,
  ParsedProxy,
  ProxyParseError,
  ProxyValidation,
  Validation,
} from "@/lib/dolphin/types";

export function parseProxyString(raw: string): ParsedProxy | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = PROXY_REGEX.exec(trimmed);
  if (!match) return null;
  const [, host, portStr, user, pass] = match;
  const port = Number(portStr);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;
  if (!user || !pass) return null;
  return {
    raw: trimmed,
    type: "http",
    host,
    port,
    user,
    pass,
  };
}

export function validateProxyString(raw: string): ProxyValidation {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty line" };
  const proxy = parseProxyString(trimmed);
  if (!proxy) {
    return {
      ok: false,
      reason: "Invalid format. Expected http://host:port:user:pass",
    };
  }
  return { ok: true, proxy };
}

export function parseProxyList(text: string): {
  parsed: ParsedProxy[];
  errors: ProxyParseError[];
} {
  const lines = text.split(/\r?\n/);
  const parsed: ParsedProxy[] = [];
  const errors: ProxyParseError[] = [];
  const seen = new Set<string>();

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const result = validateProxyString(trimmed);
    if (!result.ok) {
      errors.push({ line: i + 1, raw: trimmed, reason: result.reason });
      return;
    }
    const dedupKey = `${result.proxy.type}://${result.proxy.user}:${result.proxy.pass}@${result.proxy.host}:${result.proxy.port}`;
    if (seen.has(dedupKey)) {
      errors.push({
        line: i + 1,
        raw: trimmed,
        reason: "Duplicate of an earlier proxy (same type, credentials, host, port)",
      });
      return;
    }
    seen.add(dedupKey);
    parsed.push(result.proxy);
  });

  return { parsed, errors };
}

export function validateNamePrefix(prefix: string): Validation {
  if (prefix.length === 0) {
    return { ok: false, reason: "Name prefix cannot be empty" };
  }
  if (prefix.length > NAME_PREFIX_MAX_LEN) {
    return {
      ok: false,
      reason: `Name prefix must be ≤ ${NAME_PREFIX_MAX_LEN} characters`,
    };
  }
  if (!NAME_PREFIX_REGEX.test(prefix)) {
    return {
      ok: false,
      reason: "Only letters, digits, underscore (_) and hyphen (-) are allowed",
    };
  }
  return { ok: true };
}

export function validateStartIndex(value: number): Validation {
  if (!Number.isInteger(value)) {
    return { ok: false, reason: "Start index must be an integer" };
  }
  if (value < 0) {
    return { ok: false, reason: "Start index must be ≥ 0" };
  }
  return { ok: true };
}

export function validateTag(tag: string): Validation {
  const trimmed = tag.trim();
  if (trimmed.length === 0) return { ok: true };
  if (trimmed.length > TAG_MAX_LEN) {
    return {
      ok: false,
      reason: `Tag must be ≤ ${TAG_MAX_LEN} characters`,
    };
  }
  return { ok: true };
}

export function buildProfileName(prefix: string, index: number): string {
  return `${prefix}${index}`;
}

export function parseNotesList(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const parsed: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    parsed.push(trimmed);
  }
  return parsed;
}

export function parseProfileNamesList(text: string): {
  parsed: string[];
  errors: NameParseError[];
} {
  const lines = text.split(/\r?\n/);
  const parsed: string[] = [];
  const errors: NameParseError[] = [];
  const seen = new Set<string>();

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (seen.has(trimmed)) {
      errors.push({
        line: i + 1,
        raw: trimmed,
        reason: "Duplicate name.",
      });
      return;
    }
    seen.add(trimmed);
    parsed.push(trimmed);
  });

  return { parsed, errors };
}
