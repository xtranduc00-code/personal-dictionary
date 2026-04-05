/**
 * Defaults favor finishing before typical serverless hard limits (~10s) so the route can
 * return JSON (408/422) instead of the host dying with an HTML 500 page.
 *
 * Override: `GUARDIAN_READ_TOTAL_MS`, `GUARDIAN_READ_FETCH_TIMEOUT_MS`,
 * or `GUARDIAN_READ_SERVERLESS_SAFE=0` for long local/self-hosted runs.
 *
 * Default ~9.5s on Netlify/Vercel avoids the platform returning an HTML 500 when
 * the function hard-times out (~10s on many plans) before this route can emit JSON.
 */
export function guardianReadTotalBudgetMs(): number {
  const n = Number(process.env.GUARDIAN_READ_TOTAL_MS?.trim());
  if (Number.isFinite(n) && n >= 4000) return Math.floor(n);
  if (process.env.GUARDIAN_READ_SERVERLESS_SAFE === "0") return 40_000;
  if (process.env.NETLIFY || process.env.VERCEL) return 9500;
  return 38_000;
}

/** Time allowed for TCP + TLS + response headers + full body from the Guardian. */
export function guardianReadFetchTimeoutMs(totalBudget: number): number {
  const n = Number(process.env.GUARDIAN_READ_FETCH_TIMEOUT_MS?.trim());
  if (Number.isFinite(n) && n >= 2500) return Math.floor(n);
  const parseReserve = 3500;
  return Math.max(4000, totalBudget - parseReserve);
}
