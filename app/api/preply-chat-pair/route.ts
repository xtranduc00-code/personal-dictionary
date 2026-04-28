import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import {
  SUBJECT_VALUES,
  SUBJECT_LABELS,
  buildTrialScenario,
  buildSession2Scenario,
  trialScenarioCard,
  session2ScenarioCard,
  type Subject,
  type TrialScenario,
  type Session2Scenario,
} from "@/lib/preply-chat-scenario";
import { pickPretrialPair } from "@/lib/preply-pretrial-pool";
import {
  bubbleRangeFor,
  SUBJECT_GROUP,
  pickPhrases,
  renderPhraseConstraints,
  postProcessThread,
} from "@/lib/preply-chat-pools";

const KIND_VALUES = ["pretrial_pair", "trial", "session2"] as const;
type Kind = (typeof KIND_VALUES)[number];

const requestSchema = z.object({
  kind: z.enum(KIND_VALUES),
  subject: z.enum(SUBJECT_VALUES),
});

const messageSchema = z.object({
  role: z.enum(["teacher", "student"]),
  text: z.string().min(1),
});

const resultSchema = z.object({
  messages: z.array(messageSchema).min(2),
});

// =============================================================================
// CHANNEL MENTAL MODEL — applies to trial + session2
// =============================================================================

const CHANNEL_MENTAL_MODEL = `CHANNEL MENTAL MODEL — read carefully before generating.

This chat is the IN-LESSON chat box that runs ALONGSIDE a voice call. Voice is the primary channel. Chat is a side channel for things hard to say out loud.

Voice (NOT in this thread): greetings, self-introduction, goal discussion, multi-paragraph explanation, encouragement, transitions, Q&A back-and-forth.

Chat (THIS thread): only "hard-to-say-out-loud" content -
- code snippets
- math equations / formulas
- technical terms / spelling
- URLs, file paths
- short sentences for the student to fix
- vocabulary words tutor introduces
- ONE-LINE framings before each exercise ("ok try this:", "fill the blank:")
- quick reactions ("yep", "hmm", "👍") when voice is busy
- a closing line referencing the student's weak topic

Chat is NOT for:
- tutor self-introduction (name, years, focus, what trial covers) - that all happens on voice
- student self-introduction (name, job, why learning) - voice
- goal/scope discussion - voice
- multi-bubble explanation prose - voice
- step-by-step rule explanations - voice
- 5+ tutor consecutive bubbles of prose - never

Most bubbles are content snippets + brief reactions. Roughly 90% of bubbles are EITHER an exercise paste OR a one-line framing OR a one-line reaction. Long prose paragraphs are forbidden.`;

const SHARED_REALISM = `REALISM RULES.

A. FEEDBACK DISCIPLINE
A1. Total uses across the WHOLE thread of "perfect", "great", "nice", "good", "excellent", "well done", "awesome", "amazing", "exactly", "correct" - combined - must be <= 2.
A2. After a correct student answer, vary the reaction. Use the pre-picked tutor reactions verbatim. Do NOT add filler praise.
A3. After a WRONG answer, do NOT immediately give the answer. Use a wrong-reaction phrase OR a SHORT guiding question (max 6 words). Voice handles the actual explanation.
A4. At least once, leave a topic half-resolved: "we'll come back to that" / "ok we'll drill this next time" - but tied to the closing topic.
A5. NEVER type a prose hint or partial explanation. Bubbles like "remember you need to track prev, curr, and next..." or "the trick here is..." are FORBIDDEN. Voice covers all explanation. Chat shows only: framings, exercise content, the student's attempt, short reactions, the closing line.

B. STUDENT VOICE
B1. Student bubbles MUST break standard writing conventions >= 60% of the time: lowercase "i", missing apostrophes, fragments, no period at end of short bubbles, occasional typos.
B2. Student NEVER uses precise grammar/subject terminology. Use the casual weakness phrasing from the scenario card.
B3. Student bubbles average SHORTER than tutor bubbles. Many are 1-4 words.
B4. Student hedges sometimes: "i think", "maybe", "is it ___?", "not sure", "kinda", "idk".

C. TUTOR VOICE
C1. Tutor bubbles in chat are SHORT. Most are 1-line framings or 1-word reactions.
C2. Casual contractions and lowercase starts allowed: "lemme", "ok so", "wait", "alright", "k".
C3. Tutor never types a full explanation paragraph. If a longer thought is needed, the model assumes it's said on voice and the chat shows only the artifact (e.g. the corrected sentence).

D. RHYTHM
D1. Same person sends 2-3 consecutive bubbles is FINE (e.g. tutor framing + paste, or student answer split across bubbles).
D2. Length variance - reactions are 1-3 words, exercise content is whatever it needs to be.
D3. The thread should READ like a chat box during a real lesson - silences are implicit.

E. CONTENT REALISM
E1. Exercises typed-into-chat, not textbook-formatted.
E2. Every field in the scenario card belongs to ONE sub-domain. Stay locked in that sub-domain - no off-topic exercises.
E3. The closing remark references the sub-domain's closing topic, NOT generic encouragement.

F. ENDING
F1. End mid-flow with a content-tied short closing pair (the pre-picked closing phrases).
F2. NEVER end with "Looking forward to...", "Talk soon", "See you next time!", or any "!" in the last 3 bubbles.

G. PUNCTUATION + CAPITALIZATION
G1. Total "!" across thread: <= 1. Most threads ZERO.
G2. Total emoji: 0-2. Allowed: 😊 🙏 👍 😅. Banned: 🎉 ✨ 💪 🚀 🔥 ❤️.
G3. NEVER use "—" (em dash) anywhere. Use "-" or "..." instead. Em dash is the #1 AI fingerprint.
G4. Lowercase "i" pronoun is encouraged. Keep proper nouns capitalized: weekdays, languages, country/city names, people's names, brand names.

H. FORBIDDEN PHRASES
- "Looking forward to..."
- "Let's nail this" / "you got this" / "we got this" / "you're doing great"
- "fun and engaging" / "structured but flexible"
- "Absolutely!" / "Definitely!" as standalone replies
- "feel free to" / "kindly"
- "common area to work on" / "that's a common one"
- "Let me know if you have any questions"

I. PRE-PICKED PHRASES
You will receive a PRE-PICKED PHRASES block in the user prompt. Use those phrases VERBATIM in their assigned slots. The whole point is to lock surface form so threads don't repeat across runs - paraphrasing them defeats the purpose.

J. SELF-CHECK
Before output: praise words <= 2; "!" <= 1; em dash count = 0; emoji <= 2; bubble count within target; sub-domain locked (no off-topic exercises); pre-picked phrases used verbatim; closing references the weakness topic; last 2 bubbles short, not a sign-off.`;

// =============================================================================
// FEW-SHOT EXAMPLES — match the sparse channel model
// =============================================================================

const FEW_SHOT_EXAMPLES = `Examples of the EXACT register and sparseness expected. Note: NO self-intro, NO goal discussion, NO long prose. Voice handles all of that.

EXAMPLE 1 - Trial CS, sub-domain Python basics, 16 bubbles:
teacher: hey ready?
student: yep just opened the editor
teacher: ok cool sharing screen
teacher: try this:
teacher: my_dict = {'name': 'alex'}
teacher: how do you add a new key 'age' with value 25
student: my_dict['age'] = 25
teacher: yep
teacher: next:
teacher: for i in range(5): print(i)
teacher: what's the output
student: 0 1 2 3 4
teacher: 👍
teacher: ok we'll do more list comprehensions next time
student: k thx

EXAMPLE 2 - Trial English exam, sub-domain IELTS speaking, 10 bubbles:
teacher: hey ready?
student: yeah all set
teacher: ok cool, fix this:
teacher: 'I have went to the store yesterday'
student: i went to the store yesterday?
teacher: yep
teacher: try with this:
teacher: 'She ___ her homework already' (finish)
student: she has finished her homework already
teacher: yep, we'll drill present perfect more next time

EXAMPLE 3 - Session 2 Math, sub-domain Algebra, 14 bubbles:
teacher: hey ready?
student: yep
teacher: how'd the homework go
student: ok mostly
student: stuck on problem 7
teacher: ok let's look:
teacher: 3(x-2) = 2x + 5
student: i got x = 11
teacher: hmm let me see your steps
student: 3x - 6 = 2x + 5 / 3x - 2x = 5 + 6 / x = 11
teacher: right that's correct actually
teacher: try next: 5(x+1) = 3(x-2) + 8
student: 5x + 5 = 3x - 6 + 8 / 2x = -3 / x = -1.5
teacher: yep, ok we'll do more inequalities next time`;

// =============================================================================
// TRIAL (in-lesson sparse, 3 phases)
// =============================================================================

const TRIAL_SYSTEM = `You generate ONE realistic in-lesson chat thread for a Preply TRIAL lesson. Chat is the side channel - voice is primary. See the channel mental model below.

${CHANNEL_MENTAL_MODEL}

Thread shape - THREE phases, in order:

PHASE 1 - Pre-voice opener (2-3 bubbles):
- Tutor opener (verbatim from pre-picked phrases).
- Student opener (verbatim).
- Optional 1 logistics bubble ("ok cool sharing screen", "ok i'm sharing"). NO welcome speech, NO self-intro.

PHASE 2 - During voice, sparse content (the bulk of bubbles):
- Cycle: [tutor framing 1 bubble] -> [content snippet 1 bubble, the exercise from the scenario card] -> [student answer 1-2 bubbles] -> [tutor reaction 1 bubble].
- Run ONE cycle per exercise in the scenario card (do NOT add cycles for exercises not in the card).
- Sometimes student types nothing and just types a reaction ("hmm", "got it", "ahh ok").
- Sometimes tutor splits framing + content across 2 bubbles (e.g. "try this:" then on next bubble the actual code).
- At least ONE wrong-answer-not-immediately-fixed moment - use a wrong-reaction phrase, NOT a prose hint.
- 0-1 student mid-thread reaction from the pre-picked pool (optional - only if bubble budget allows).

PHASE 3 - Closing (2 bubbles):
- Tutor closing (verbatim from pre-picked phrases). References the sub-domain weakness topic.
- Student closing (verbatim).

${FEW_SHOT_EXAMPLES}

${SHARED_REALISM}

OUTPUT - Plain text inside each "text" field. No markdown, no quotes, no role labels.`;

// =============================================================================
// SESSION 2 (returning student, NO self-intro, homework check phase)
// =============================================================================

const SESSION2_SYSTEM = `You generate ONE realistic in-lesson chat thread for a Preply SECOND lesson. Returning student - NO self-intro from either side. Chat is the side channel - voice is primary.

${CHANNEL_MENTAL_MODEL}

Thread shape - THREE phases, in order:

PHASE 1 - Opener + homework check (3-5 bubbles):
- Tutor opener (verbatim from pre-picked phrases).
- Student opener (verbatim).
- Tutor homework check (verbatim from pre-picked phrases).
- Student replies with the EXACT homework status from the scenario card.
- Optional 1 short clarification bubble ("which one", "the loop one", etc).

PHASE 2 - During voice, sparse content (the bulk of bubbles):
- Same cycle structure as the trial: framing -> content -> answer -> reaction.
- Run ONE cycle per exercise in the scenario card (do NOT add cycles for exercises not in the card).
- At least ONE wrong-answer-not-immediately-fixed moment - use a wrong-reaction phrase, NOT a prose hint.
- 0-1 student mid-thread reaction (optional - only if bubble budget allows).

PHASE 3 - Closing (2 bubbles):
- Tutor closing (verbatim, references sub-domain weakness topic).
- Student closing (verbatim).

${FEW_SHOT_EXAMPLES}

${SHARED_REALISM}

OUTPUT - Plain text inside each "text" field. No markdown, no quotes, no role labels.`;

// =============================================================================
// HANDLER
// =============================================================================

type AiKind = Exclude<Kind, "pretrial_pair">;

function systemPromptFor(kind: AiKind): string {
  switch (kind) {
    case "trial":
      return TRIAL_SYSTEM;
    case "session2":
      return SESSION2_SYSTEM;
  }
}

function userPromptFor(
  kind: AiKind,
  subject: Subject,
  scenario: TrialScenario | Session2Scenario,
  card: string,
  phrasesBlock: string,
): string {
  const subjectLabel = SUBJECT_LABELS[subject];
  const [minBubbles, maxBubbles] = bubbleRangeFor(
    SUBJECT_GROUP[subject],
    kind === "session2",
  );
  const subDomain = scenario.subDomain.label;
  const exerciseCount = scenario.exerciseTopics.length;
  return [
    `SUBJECT: ${subjectLabel}`,
    `SUB-DOMAIN (lock the whole thread to this): ${subDomain}`,
    `BUBBLE COUNT: STRICT ${minBubbles}-${maxBubbles}. Count bubbles before output. If above ${maxBubbles}, drop optional reactions / merge framing+content into 1 bubble. Going OVER ${maxBubbles} = FAIL.`,
    `EXERCISE COUNT: EXACTLY ${exerciseCount} exercises. The scenario card lists ${exerciseCount}. Use ALL of them, in any order. Do NOT add a ${exerciseCount + 1}th exercise. Do NOT repeat any exercise. Do NOT invent new exercises.`,
    `CYCLE STRUCTURE: every exercise has a framing bubble (1 line) BEFORE the exercise content. ${exerciseCount} cycles = ${exerciseCount} framings. No exercise appears without a framing in front of it.`,
    "",
    card,
    "",
    phrasesBlock,
    "",
    `Generate now. ${kind === "trial" ? "Trial" : "Session 2"} thread, sparse channel model, voice is primary. Run the SELF-CHECK in section J. Return JSON: { "messages": [ ... ] }.`,
  ].join("\n");
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY" },
      { status: 500 },
    );
  }
  try {
    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload" },
        { status: 400 },
      );
    }
    const { kind, subject } = parsed.data;

    // Pre-trial pair is pure pool - no AI call. Reality is copy-paste, so the
    // code is copy-paste. ~30 tutor templates × ~64 student phrasings = ~1920
    // unique pairs, all human-written.
    if (kind === "pretrial_pair") {
      const pair = pickPretrialPair(subject);
      return NextResponse.json({
        messages: [
          { role: "teacher" as const, text: pair.teacher },
          { role: "student" as const, text: pair.student },
        ],
      });
    }

    const scenario =
      kind === "trial"
        ? buildTrialScenario(subject)
        : buildSession2Scenario(subject);
    const card =
      kind === "trial"
        ? trialScenarioCard(scenario as TrialScenario)
        : session2ScenarioCard(scenario as Session2Scenario);

    // 3 framing hints (one per exercise) - all from the same sub-domain.
    const framingHints = [
      scenario.subDomain.framingHint,
      scenario.subDomain.framingHint,
      scenario.subDomain.framingHint,
    ];
    const phrases = pickPhrases({
      framingHints,
      weakness: pickClosingTopic(scenario),
      isSession2: kind === "session2",
    });
    const phrasesBlock = renderPhraseConstraints(phrases);

    const openai = new OpenAI({ apiKey });
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPromptFor(kind) },
        {
          role: "user",
          content: userPromptFor(kind, subject, scenario, card, phrasesBlock),
        },
      ],
      temperature: 1,
      text: {
        format: {
          type: "json_schema",
          name: "preply_chat_thread",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              messages: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    role: {
                      type: "string",
                      enum: ["teacher", "student"],
                    },
                    text: { type: "string" },
                  },
                  required: ["role", "text"],
                },
              },
            },
            required: ["messages"],
          },
        },
      },
    });
    const raw = response.output_text;
    const json = JSON.parse(raw);
    const result = resultSchema.parse(json);
    const cleaned = postProcessThread(result.messages);
    return NextResponse.json({ messages: cleaned });
  } catch (error) {
    console.error("Preply chat API failed:", error);
    return NextResponse.json(
      { error: "Could not generate chat" },
      { status: 500 },
    );
  }
}

/**
 * Pick a closing topic from the scenario's sub-domain. Tutor closings reference
 * a short noun phrase (e.g. "list comprehensions"), not the full student
 * weakness sentence (e.g. "loops break me"). The closing template substitutes
 * this noun phrase into "{weakness}".
 */
function pickClosingTopic(
  scenario: TrialScenario | Session2Scenario,
): string {
  const topics = scenario.subDomain.closingTopics;
  return topics[Math.floor(Math.random() * topics.length)]!;
}
