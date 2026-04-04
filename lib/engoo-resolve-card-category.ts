type RefMap = Record<string, Record<string, unknown>>;

function textFromRefObject(obj: Record<string, unknown> | null): string {
  if (!obj) return "";
  const name = obj.name as Record<string, unknown> | undefined;
  if (name && typeof name.text === "string") return name.text.trim();
  for (const k of ["display_name", "label", "title", "text"] as const) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** Resolve tag display names from lesson_headers `tags` + `references`. */
export function engooTagCategoryFromRow(
  row: Record<string, unknown>,
  references: RefMap,
): string | null {
  const tags = row.tags as unknown[] | undefined;
  if (!Array.isArray(tags) || tags.length === 0) return null;
  for (const t of tags) {
    if (!t || typeof t !== "object") continue;
    const ref = (t as { _ref?: string })._ref;
    if (!ref) continue;
    const obj = references[ref];
    if (!obj) continue;
    const label = textFromRefObject(obj);
    if (label) return label;
  }
  return null;
}

/**
 * When API tags are empty, infer a topic pill from title + introduction.
 * Labels align with Engoo Daily News category tabs (not separate “Finance” / “Food” pills).
 */
export function inferEngooTopicFromBlurb(title: string, introduction: string): string | null {
  const s = `${title}\n${introduction}`.toLowerCase();
  const rules: [string, RegExp][] = [
    [
      "Football",
      /\b(soccer|football|fifa|uefa|premier league|champions league|world cup|euro \d{4}|la liga|bundesliga|serie a|eredivisie|mls\b|goalkeeper|strikers?|midfielders?|penalty shoot|offside|var\b|stadium.*(match|game)|manager sacked|transfer window|golden boot)\b/i,
    ],
    [
      "Travel & Experiences",
      /\b(airline|economy class|lie-flat|train ride|cheaper fare|faster ride|rail travelers|overtourism|tourists?\b|quietness of japan|castle tower|hotel(s)?\b|resort|vacation|destination(s)?\b|scenic|tourism)\b/i,
    ],
    [
      "Science & Technology",
      /\b(nasa|artemis|astronaut|moon mission|spacecraft|orbit the moon|genetic evidence|scientists?\s+discover|researchers?\s+find|\bai\b|chatbots?|algorithm|playstation|cryptograph|mission to the moon|space station|software|startup tech)\b/i,
    ],
    [
      "Health & Lifestyle",
      /\b(heart health|healthy diet|lifestyle changes.*health|mental health|vivid dreams|hay fever|protein sources|vaccin|disease risk|feel rested|sleep quality|fitness|wellness)\b/i,
    ],
    [
      "Culture & Society",
      /\b(streamers?|influencers?|dream jobs|reviews or|young people trust|sony to increase|social media|celebrit|museum|festival|heritage|education system|graduates?)\b/i,
    ],
    [
      "Business & Politics",
      /\b(survey shows|japanese people want|foreign residents|south koreans|flock to seoul|louisiana|u\.s\. states|public holidays|countries have|retirement saving|engagement ring|salarymen|rising costs|economic|price increase|paid\s+\$|\$\d+\s+to|student life.*costs|financial|tea brands|restaurants?|kitkat|theft|steal|thieves|brand(s)?\s+grow|corporate|election|government|parliament|politic)\b/i,
    ],
  ];
  for (const [label, re] of rules) {
    if (re.test(s)) return label;
  }
  return null;
}

/** Map Engoo tag labels onto our Daily News tab pill when they clearly mean football/soccer. */
function engooTagMapsToFootballTab(tag: string): boolean {
  const t = tag.toLowerCase().trim();
  if (/\b(football|soccer)\b/.test(t)) return true;
  if (/^sport(s)?$/i.test(t)) return true;
  if (/^sporting\b/i.test(t)) return true;
  return false;
}

export function resolveEngooListCardCategory(
  row: Record<string, unknown>,
  references: RefMap,
  channelLabel: string,
): string {
  const tag = engooTagCategoryFromRow(row, references);
  const titleText = row.title_text as Record<string, unknown> | undefined;
  const title = typeof titleText?.text === "string" ? titleText.text : "";
  const introObj = row.introduction_text as Record<string, unknown> | undefined;
  const intro = typeof introObj?.text === "string" ? introObj.text : "";
  const inferred = inferEngooTopicFromBlurb(title, intro);

  if (tag) {
    if (engooTagMapsToFootballTab(tag)) return "Football";
    return tag;
  }
  if (inferred) return inferred;
  return channelLabel;
}
