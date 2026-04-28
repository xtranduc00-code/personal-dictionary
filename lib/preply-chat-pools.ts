/**
 * Phrase pools for Preply trial / session-2 chat threads (in-lesson sub-channel).
 *
 * The trial/session-2 chat models the IN-LESSON chat box — the side channel
 * that runs alongside the voice call. Voice handles greetings, intro, goal
 * discussion, explanation. Chat handles ONLY hard-to-say content: code, math,
 * formulas, terms, brief framings, reactions.
 *
 * These pools are pre-picked per thread and INJECTED into the LLM prompt as
 * fixed phrases the model must use verbatim. That's what gives us combinatorial
 * variety without trusting the LLM to vary its own surface forms.
 */
import type { Subject } from "@/lib/preply-chat-scenario";

export type FramingHint = "code" | "math" | "language" | "generic";

export type SubjectGroup =
  | "languages" // english_general, english_exam, history, literature, geography
  | "stem_formula" // math, physics, chemistry, biology
  | "code" // computer_science
  | "theory"; // economics, art_music

export const SUBJECT_GROUP: Record<Subject, SubjectGroup> = {
  english_general: "languages",
  english_exam: "languages",
  history: "languages",
  literature: "languages",
  geography: "languages",
  math: "stem_formula",
  physics: "stem_formula",
  chemistry: "stem_formula",
  biology: "stem_formula",
  computer_science: "code",
  economics: "theory",
  art_music: "theory",
};

/**
 * Bubble count caps by subject group. Inclusive on both ends. Trial threads
 * use these as-is. Session-2 threads add +1/+2 to absorb the extra
 * homework-check bubbles in phase 1.
 *
 * Empirically calibrated: 2 cycles minimum × 4 bubbles + wrong-answer retry +
 * phase 1 + phase 3 = 14-17 for languages/theory; 3 cycles for stem/code adds
 * another ~5 bubbles.
 */
export const BUBBLE_RANGE: Record<SubjectGroup, [number, number]> = {
  languages: [10, 17],
  stem_formula: [14, 22],
  code: [16, 23],
  theory: [10, 17],
};

export function bubbleRangeFor(
  group: SubjectGroup,
  isSession2: boolean,
): [number, number] {
  const [lo, hi] = BUBBLE_RANGE[group];
  return isSession2 ? [lo + 1, hi + 2] : [lo, hi];
}

/**
 * Number of exercises to pick per thread, by subject group. Languages/theory
 * threads run 2 cycles to stay within the 8-13 / 8-12 caps. STEM/code run 3
 * cycles to fit the 12-18 / 14-20 caps. Each cycle = ~4 bubbles, so this is
 * the primary lever for bubble count.
 */
export const EXERCISE_COUNT: Record<SubjectGroup, number> = {
  languages: 2,
  stem_formula: 3,
  code: 3,
  theory: 2,
};

const pick = <T,>(arr: readonly T[]): T =>
  arr[Math.floor(Math.random() * arr.length)]!;

const pickN = <T,>(arr: readonly T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]!);
  }
  return out;
};

// =============================================================================
// A. TUTOR_OPENER_POOL — Phase 1, before voice starts
// =============================================================================
const TUTOR_OPENER_POOL: readonly string[] = [
  "hey ready to start?",
  "hey ready?",
  "ok ready when you are",
  "all set?",
  "hey, you good to go?",
  "ready when you are",
  "hey, can you hear me ok?",
  "mic working?",
  "screen showing up?",
  "you see my screen?",
  "ok i'm sharing",
  "hey, link working ok?",
  "you joined? all good?",
  "ok sharing in a sec",
  "hey, audio ok on your end?",
];

// =============================================================================
// B. STUDENT_OPENER_POOL — Phase 1 reactions
// =============================================================================
const STUDENT_OPENER_POOL: readonly string[] = [
  "yeah",
  "yep all set",
  "yeah just opened the link",
  "yep can hear you",
  "yeah good",
  "yep one sec",
  "yeah just sat down",
  "ready",
  "yep mic on",
  "yes can see screen",
  "yeah ready",
  "yep just finished my coffee",
  "ok ready",
  "yep good to go",
  "yeah hold on lemme open notebook",
];

// =============================================================================
// C. TUTOR_FRAMING_POOL — 1-line framings before content
// =============================================================================
const TUTOR_FRAMING_POOL: Record<FramingHint, readonly string[]> = {
  code: [
    "ok try this:",
    "spot the issue:",
    "what's the output:",
    "fix this:",
    "trace through this:",
    "what's the time complexity:",
    "predict what happens:",
    "complete this:",
  ],
  math: [
    "solve this:",
    "find x:",
    "simplify:",
    "what's wrong here:",
    "next one:",
    "try this one:",
    "evaluate:",
    "set up the equation:",
  ],
  language: [
    "fill the blank:",
    "fix this sentence:",
    "what's the tense:",
    "rewrite in past tense:",
    "what's wrong here:",
    "translate:",
    "complete this:",
    "try with this word:",
  ],
  generic: [
    "ok now this:",
    "next:",
    "try:",
    "what about:",
    "and this one:",
    "now -",
  ],
};

// =============================================================================
// D. TUTOR_REACTION_POOL — after student answer
// =============================================================================
const TUTOR_REACTION_POOL = {
  correct: [
    "yep",
    "mm-hm",
    "right",
    "k",
    "yeah",
    "yeah that's it",
    "👍",
    "exactly",
    "there you go",
    "uh-huh",
    "ok good",
    "yes",
  ],
  wrong: [
    "hmm",
    "not quite",
    "almost",
    "close",
    "wait",
    "hmm think again",
    "look at it again",
    "not exactly",
    "kind of",
    "partially",
    "you're close",
    "hmm what about that part",
    "read it back",
  ],
} as const;

// =============================================================================
// E. TUTOR_CLOSING_POOL — references {weakness} placeholder
// =============================================================================
const TUTOR_CLOSING_POOL: readonly string[] = [
  "ok we'll do more {weakness} next time",
  "we'll drill {weakness} more next session",
  "ok keep practicing {weakness}, that's your weak spot rn",
  "{weakness} we'll cover next time",
  "ok we'll come back to {weakness}",
  "send me a screenshot if you get stuck on {weakness}",
  "we'll spend more time on {weakness} next time",
  "good progress, we'll polish {weakness} next session",
  "ok try a few {weakness} problems before next time",
  "{weakness} is the priority next session",
  "let's nail {weakness} next time",
  "we'll keep working on {weakness}",
  "ok homework: practice {weakness}",
  "alright {weakness} drills next time",
  "we'll do a deep dive on {weakness} next",
  "remember to practice {weakness} between now and next time",
  "ok, focus on {weakness} this week if you can",
  "next time = more {weakness}",
  "i'll send you some {weakness} exercises after",
  "we'll fix {weakness} bit by bit",
];

// =============================================================================
// F. STUDENT_CLOSING_POOL
// =============================================================================
const STUDENT_CLOSING_POOL: readonly string[] = [
  "ok ty",
  "k will do",
  "got it thx",
  "👍",
  "ok thanks",
  "k thx",
  "alright ty",
  "ok cool",
  "thanks",
  "ok ty bye",
  "got it",
  "k cool",
  "ok will try",
  "thanks see you",
  "k",
];

// =============================================================================
// G. STUDENT_REACTION_POOL — mid-thread reactions between cycles
// =============================================================================
const STUDENT_REACTION_POOL = {
  thinking: [
    "hmm",
    "uhh",
    "wait",
    "lemme think",
    "one sec",
    "hmm idk",
    "not sure",
    "umm",
    "i think...",
    "maybe",
    "is it...?",
    "wait what",
  ],
  gotIt: [
    "ahh ok",
    "oh",
    "got it",
    "oh right",
    "k",
    "makes sense",
    "ok i see",
    "yeah ok",
    "oh wait",
    "ohh",
    "ok ok",
    "right",
    "alright",
  ],
} as const;

// =============================================================================
// SESSION 2 — homework opener variants (Phase 1 only differs from trial)
// =============================================================================
const TUTOR_HOMEWORK_OPENERS: readonly string[] = [
  "how'd the homework go?",
  "homework ok?",
  "did you get to the homework?",
  "how was the homework?",
  "homework went ok?",
  "managed the homework?",
  "did the homework work out?",
];

// =============================================================================
// HELPERS — pick + return picked phrases for prompt injection
// =============================================================================

export type PickedPhrases = {
  tutorOpener: string;
  studentOpener: string;
  tutorFramings: string[]; // 3-5 framings, in order
  tutorCorrectReactions: string[]; // 3-4 picked, no repeat
  tutorWrongReactions: string[]; // 1-2 picked
  studentReactions: string[]; // 3-5 picked across thinking + gotIt
  tutorClosing: string; // {weakness} substituted
  studentClosing: string;
  // session2-only
  homeworkOpener?: string;
};

export type PickedPhrasesInput = {
  framingHints: FramingHint[]; // one per exercise (typically 3 exercises)
  weakness: string;
  isSession2?: boolean;
};

export function pickPhrases(input: PickedPhrasesInput): PickedPhrases {
  // Pick a generous framing POOL (5 options) rather than 1:1 mapping. Model
  // chooses which framing fits each exercise — sequential mapping caused
  // mismatches like "fill the blank:" applied to "rewrite this conclusion".
  const primaryHint = input.framingHints[0] ?? "generic";
  const primaryPool = TUTOR_FRAMING_POOL[primaryHint] ?? TUTOR_FRAMING_POOL.generic;
  const tutorFramings = pickN(primaryPool, 5);
  const tutorCorrectReactions = pickN(TUTOR_REACTION_POOL.correct, 4);
  const tutorWrongReactions = pickN(TUTOR_REACTION_POOL.wrong, 2);
  const studentReactions = [
    ...pickN(STUDENT_REACTION_POOL.thinking, 2),
    ...pickN(STUDENT_REACTION_POOL.gotIt, 2),
  ];
  const tutorClosingTemplate = pick(TUTOR_CLOSING_POOL);
  const tutorClosing = tutorClosingTemplate.replace(
    /\{weakness\}/g,
    input.weakness,
  );

  return {
    tutorOpener: pick(TUTOR_OPENER_POOL),
    studentOpener: pick(STUDENT_OPENER_POOL),
    tutorFramings,
    tutorCorrectReactions,
    tutorWrongReactions,
    studentReactions,
    tutorClosing,
    studentClosing: pick(STUDENT_CLOSING_POOL),
    homeworkOpener: input.isSession2 ? pick(TUTOR_HOMEWORK_OPENERS) : undefined,
  };
}

/**
 * Render the pre-picked phrase pool as a constraint block for the LLM prompt.
 * The LLM is instructed to use these EXACT strings in the matching slots.
 */
export function renderPhraseConstraints(p: PickedPhrases): string {
  const lines: string[] = [
    "PRE-PICKED PHRASES — use each VERBATIM in the matching slot. Do NOT paraphrase or translate.",
    `- Tutor opener (Phase 1, bubble 1): "${p.tutorOpener}"`,
    `- Student opener (Phase 1, bubble 2): "${p.studentOpener}"`,
  ];
  if (p.homeworkOpener) {
    lines.push(
      `- Tutor homework check (Phase 1, after opener): "${p.homeworkOpener}"`,
    );
  }
  lines.push(
    `- Tutor framings - pick ONE per exercise from this pool, choose whichever fits the exercise content best. Don't reuse the same framing twice. Pool: ${p.tutorFramings.map((f) => `"${f}"`).join(", ")}`,
    `- Tutor reactions on CORRECT answer (rotate, never repeat the same one twice in a row): ${p.tutorCorrectReactions.map((r) => `"${r}"`).join(", ")}`,
    `- Tutor reactions on WRONG / partial answer (use at least once): ${p.tutorWrongReactions.map((r) => `"${r}"`).join(", ")}`,
    `- Student mid-thread reactions (sprinkle 2-4 of these between exercises): ${p.studentReactions.map((r) => `"${r}"`).join(", ")}`,
    `- Tutor closing (Phase 3, second-to-last bubble): "${p.tutorClosing}"`,
    `- Student closing (Phase 3, last bubble): "${p.studentClosing}"`,
  );
  return lines.join("\n");
}

// =============================================================================
// POST-PROCESSING — defense layer applied to every bubble before return
// =============================================================================

/**
 * Per-bubble cleanup: em dash, smart quotes, multi-bang collapse.
 * Whitespace trim is intentional — leading/trailing whitespace is never load-bearing.
 */
function postProcessBubble(text: string): string {
  return text
    .replace(/—/g, "-") // em dash → hyphen (#1 AI fingerprint)
    .replace(/–/g, "-") // en dash → hyphen
    .replace(/[‘’]/g, "'") // smart single quotes → straight
    .replace(/[“”]/g, '"') // smart double quotes → straight
    .replace(/!{2,}/g, ".") // !! / !!! → .
    .replace(/[ \t]+\n/g, "\n") // trailing whitespace before newlines
    .trim();
}

/**
 * Thread-level cleanup: cap total "!" across all bubbles to ≤ 1. If the model
 * emits multiple, keep the FIRST one and replace the rest with ".".
 */
export function postProcessThread(
  messages: { role: "teacher" | "student"; text: string }[],
): { role: "teacher" | "student"; text: string }[] {
  let bangSeen = false;
  return messages.map((m) => {
    const cleaned = postProcessBubble(m.text);
    const compactedBangs = cleaned.replace(/!/g, () => {
      if (!bangSeen) {
        bangSeen = true;
        return "!";
      }
      return ".";
    });
    return { role: m.role, text: compactedBangs };
  });
}
