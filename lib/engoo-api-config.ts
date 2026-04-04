/** Engoo public API — organization context (Daily News). */
export const ENGOO_DEFAULT_ORG =
  process.env.ENGOO_CONTEXT_ORGANIZATION ??
  "5d2656f1-9162-461d-88c7-b2505623d8cb";

/** Default lesson_headers category (Daily News on Engoo). */
export const ENGOO_DEFAULT_CATEGORY_ID =
  process.env.ENGOO_LESSON_CATEGORY_ID ??
  "0225ae09-5d63-41c2-bd75-693985d07d78";

export const ENGOO_DEFAULT_CATEGORY_LABEL =
  process.env.ENGOO_LESSON_CATEGORY_LABEL ?? "Daily News";

export const ENGOO_API_BASE = "https://api.engoo.com/api";
