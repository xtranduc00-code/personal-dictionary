import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/get-auth-user";
import { supabaseForUserData } from "@/lib/supabase-server";

const ROW_ID = "global";
const MAX_JSON_CHARS = 520_000;
const MAX_ACCOUNTS = 20;
const MAX_ACCOUNT_NAME_LEN = 80;
const MAX_DATE_KEYS = 500;
const MAX_PRESETS = 12;
const MAX_PRESET_NAME_LEN = 40;

const DEFAULT_ACCOUNTS = [
  "Hồng 1",
  "Hồng 2",
  "Hồng 3",
  "Minh 1",
  "Minh 2",
];

const DEFAULT_PRESETS: Preset[] = [
  { name: "Duy", color: "#1e293b" },
  { name: "Quang", color: "#0f766e" },
  { name: "Thư", color: "#6d28d9" },
];

type Preset = { name: string; color: string };

type Row = {
  id: string;
  accounts: unknown;
  by_date: unknown;
  presets: unknown;
  time_display: string;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function sanitizeAccounts(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") return null;
    const s = x.trim().slice(0, MAX_ACCOUNT_NAME_LEN) || "—";
    out.push(s);
    if (out.length > MAX_ACCOUNTS) return null;
  }
  return out.length > 0 ? out : null;
}

function sanitizeByDate(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length > MAX_DATE_KEYS) return null;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    const day = raw[k];
    if (!isPlainObject(day)) return null;
    out[k] = day;
  }
  return out;
}

function sanitizePresets(raw: unknown): Preset[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_PRESETS) return null;
  const out: Preset[] = [];
  const seenNames = new Set<string>();
  for (const item of raw) {
    if (!isPlainObject(item)) return null;
    const rawName = typeof item.name === "string" ? item.name.trim() : "";
    if (!rawName) continue;
    const name = rawName.slice(0, MAX_PRESET_NAME_LEN);
    if (seenNames.has(name)) continue;
    const rawColor = typeof item.color === "string" ? item.color.trim() : "";
    const color = /^#[0-9a-f]{6}$/i.test(rawColor) ? rawColor : "#475569";
    seenNames.add(name);
    out.push({ name, color });
  }
  return out;
}

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { data, error } = await supabaseForUserData()
      .from("study_schedule_shared")
      .select("id,accounts,by_date,presets,time_display")
      .eq("id", ROW_ID)
      .maybeSingle();
    if (error) throw error;
    const row = data as Row | null;
    const accounts = sanitizeAccounts(row?.accounts) ?? [...DEFAULT_ACCOUNTS];
    const byDate = sanitizeByDate(row?.by_date) ?? {};
    const sanitizedPresets = sanitizePresets(row?.presets);
    const presets =
      sanitizedPresets && sanitizedPresets.length > 0
        ? sanitizedPresets
        : [...DEFAULT_PRESETS];
    const rawTd = row?.time_display;
    const timeDisplay =
      rawTd === "local" || rawTd === "cz" ? "local" : "vn";
    return NextResponse.json({ accounts, byDate, presets, timeDisplay });
  } catch (e) {
    console.error("study-schedule GET", e);
    return NextResponse.json(
      { error: "Failed to load study schedule" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const user = await getAuthUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rawBody = await req.text();
    if (rawBody.length > MAX_JSON_CHARS) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    const body = JSON.parse(rawBody) as unknown;
    if (!isPlainObject(body)) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const accounts = sanitizeAccounts(body.accounts);
    const byDate = sanitizeByDate(body.byDate);
    if (!accounts || !byDate) {
      return NextResponse.json({ error: "Invalid accounts or byDate" }, { status: 400 });
    }
    /** Presets are optional in the payload — keep DB unchanged when omitted (undefined). */
    const presets =
      body.presets === undefined ? undefined : sanitizePresets(body.presets);
    if (body.presets !== undefined && presets === null) {
      return NextResponse.json({ error: "Invalid presets" }, { status: 400 });
    }
    /** Client uses "local"; DB CHECK only allows vn|cz — persist as cz (same meaning: local wall clock). */
    const timeDisplayDb =
      body.timeDisplay === "local" || body.timeDisplay === "cz"
        ? "cz"
        : "vn";

    const upsertRow: Record<string, unknown> = {
      id: ROW_ID,
      accounts,
      by_date: byDate,
      time_display: timeDisplayDb,
      updated_at: new Date().toISOString(),
    };
    if (presets !== undefined) upsertRow.presets = presets;

    const { error } = await supabaseForUserData()
      .from("study_schedule_shared")
      .upsert(upsertRow, { onConflict: "id" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    console.error("study-schedule PUT", e);
    return NextResponse.json(
      { error: "Failed to save study schedule" },
      { status: 500 },
    );
  }
}
