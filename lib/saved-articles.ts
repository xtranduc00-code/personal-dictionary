/** Matches `crypto.randomUUID()` ids used for pasted / fetched non-Engoo articles. */
const SAVED_ARTICLE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSavedArticleId(segment: string): boolean {
  return SAVED_ARTICLE_ID_RE.test(segment);
}

export const SAVED_ARTICLES_STORAGE_KEY = "ken-saved-reading-articles";
export const MAX_SAVED_ARTICLES = 50;
/** Max characters of article body sent into realtime instructions (model context). */
export const MAX_ARTICLE_INSTRUCTION_CHARS = 12_000;

export type SavedArticle = {
  id: string;
  title: string;
  content: string;
  sourceUrl: string | null;
  sourceLabel: string;
  savedAt: string;
  difficulty?: string | null;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function parseSavedArticle(x: unknown): SavedArticle | null {
  if (!isRecord(x)) return null;
  const id = typeof x.id === "string" ? x.id : null;
  const title = typeof x.title === "string" ? x.title : null;
  const content = typeof x.content === "string" ? x.content : null;
  const sourceLabel = typeof x.sourceLabel === "string" ? x.sourceLabel : null;
  const savedAt = typeof x.savedAt === "string" ? x.savedAt : null;
  if (!id || !title || !content || !sourceLabel || !savedAt) return null;
  const sourceUrl =
    x.sourceUrl === null || typeof x.sourceUrl === "string"
      ? x.sourceUrl
      : null;
  const difficulty =
    x.difficulty === null ||
    x.difficulty === undefined ||
    typeof x.difficulty === "string"
      ? (x.difficulty as string | null | undefined) ?? null
      : null;
  return {
    id,
    title,
    content,
    sourceUrl,
    sourceLabel,
    savedAt,
    difficulty,
  };
}

export function listSavedArticles(): SavedArticle[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_ARTICLES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseSavedArticle)
      .filter((a): a is SavedArticle => Boolean(a));
  } catch {
    return [];
  }
}

export function getSavedArticle(id: string): SavedArticle | null {
  return listSavedArticles().find((a) => a.id === id) ?? null;
}

export function persistArticleList(articles: SavedArticle[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    SAVED_ARTICLES_STORAGE_KEY,
    JSON.stringify(articles.slice(0, MAX_SAVED_ARTICLES)),
  );
}

export function saveArticle(
  input: Omit<SavedArticle, "id" | "savedAt"> & { id?: string },
): SavedArticle {
  const id =
    input.id ??
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now()));
  const savedAt = new Date().toISOString();
  const article: SavedArticle = {
    id,
    title: input.title.trim() || "Untitled",
    content: input.content,
    sourceUrl: input.sourceUrl,
    sourceLabel: input.sourceLabel,
    savedAt,
    difficulty: input.difficulty ?? null,
  };
  const rest = listSavedArticles().filter((a) => a.id !== id);
  persistArticleList([article, ...rest]);
  return article;
}

export function removeSavedArticle(id: string): void {
  persistArticleList(listSavedArticles().filter((a) => a.id !== id));
}

export function truncateForInstructions(
  text: string,
  maxChars = MAX_ARTICLE_INSTRUCTION_CHARS,
): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}\n\n[Article truncated for AI context limit.]`;
}

export function buildArticleInstructionPreamble(article: {
  title: string;
  content: string;
  sourceUrl: string | null;
  sourceLabel?: string;
}): string {
  const body = truncateForInstructions(article.content);
  const sourceLine =
    article.sourceUrl?.trim() ||
    article.sourceLabel?.trim() ||
    "Pasted by learner";
  return `You are a structured English-speaking tutor. The learner is working with the article below. Follow this lesson in STRICT ORDER (same idea as a guided reading lesson on the page).

Title: ${article.title.trim() || "Reading"}
Source: ${sourceLine}

--- Article text ---
${body}
--- End article ---

LESSON SECTIONS (strict order — start in Section 1; do not skip to opinion discussion early):

Section 1 — VOCABULARY
- Open with one sentence introducing today’s topic from the title, then say you are starting Section 1: Vocabulary.
- Choose useful words or phrases from the article IN ORDER of first appearance (about 2–5 items per session, or more if they move quickly). One word at a time: ask for a sentence, a paraphrase of meaning, or a simple example.
- FORBIDDEN in Section 1: “What do you think about this article?”; broad opinion questions; discussion of the whole piece before vocabulary work.

Section 2 — ARTICLE
- Only after Section 1. Brief summary together, check understanding, refer to specific parts of the text. Still no open-ended opinion questions about the whole article.

Section 3 — QUESTIONS
- Only after Section 2. Ask short comprehension questions you base directly on the article, one at a time.

Section 4 — DISCUSSION
- Only after Section 3. Now open-ended and opinion questions are allowed.

Rules:
- Do not start with generic chat (“How’s it going?”, “I can hear you”).
- Lead step by step; one clear question or task per turn.
- When correcting grammar, tie examples to language from the article when it helps.

`;
}
