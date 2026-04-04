/**
 * Read fetch Response body as JSON without throwing when the server returns HTML
 * (e.g. Netlify error pages) so the UI can show a useful message.
 */
export async function parseResponseJson<T>(
  res: Response,
): Promise<
  | { ok: true; data: T }
  | { ok: false; message: string }
> {
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    const preview = text.slice(0, 200).replace(/\s+/g, " ").trim();
    return {
      ok: false,
      message: preview
        ? `Invalid response (${res.status}): ${preview}`
        : `Invalid response (HTTP ${res.status})`,
    };
  }
  if (!res.ok) {
    const err =
      data &&
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    return { ok: false, message: err };
  }
  return { ok: true, data: data as T };
}
