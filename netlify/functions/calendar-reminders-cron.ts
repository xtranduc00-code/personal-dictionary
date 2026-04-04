import { schedule } from "@netlify/functions";
import type { Handler } from "@netlify/functions";

/**
 * Netlify does not run Vercel Cron (`vercel.json`). This scheduled function
 * calls the same Next route as production would on Vercel: calendar + study grid + vocab push.
 *
 * Env (Netlify UI → Site configuration → Environment variables):
 * - CRON_SECRET — must match what GET /api/cron/calendar-reminders expects (Bearer).
 * - URL — set by Netlify on deploy (canonical site URL); fallback DEPLOY_PRIME_URL / NEXT_PUBLIC_SITE_URL.
 */
const inner: Handler = async () => {
  // Prefer explicit site URL (custom domain); Netlify’s URL can be *.netlify.app on some contexts.
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.URL?.trim() ||
    process.env.DEPLOY_PRIME_URL?.trim();
  const secret = process.env.CRON_SECRET?.trim();
  if (!base || !secret) {
    console.error(
      "[calendar-reminders-cron] Missing URL or CRON_SECRET — set both in Netlify env",
    );
    return { statusCode: 500, body: "Misconfigured" };
  }
  const url = `${base.replace(/\/$/, "")}/api/cron/calendar-reminders`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await res.text();
  console.log(
    "[calendar-reminders-cron]",
    res.status,
    text.length > 1200 ? `${text.slice(0, 1200)}…` : text,
  );
  return {
    statusCode: res.ok ? 200 : 502,
    body: text.slice(0, 30_000),
  };
};

/** Every minute — same cadence as vercel.json crons for this app. */
export const handler = schedule("* * * * *", inner);
