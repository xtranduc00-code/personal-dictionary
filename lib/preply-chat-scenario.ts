/**
 * Preply trial / session-2 scenario builder.
 *
 * Scenarios are LOCKED to a single sub-domain to avoid the original cross-mix
 * problem (DSA tutor scenario + git rebase weakness + react hooks exercise).
 * Every field comes from the same sub-domain.
 *
 * All 12 subjects have multi-sub-domain content. Exercises are SNIPPETS (paste-able
 * code, equations, sentences-to-fix) rather than conceptual questions, since chat
 * is the side-channel and voice handles conceptual discussion.
 */
import {
  EXERCISE_COUNT,
  SUBJECT_GROUP,
  type FramingHint,
} from "@/lib/preply-chat-pools";

export const SUBJECT_VALUES = [
  "english_general",
  "english_exam",
  "math",
  "biology",
  "chemistry",
  "physics",
  "history",
  "literature",
  "computer_science",
  "economics",
  "geography",
  "art_music",
] as const;

export type Subject = (typeof SUBJECT_VALUES)[number];

export const SUBJECT_LABELS: Record<Subject, string> = {
  english_general: "general English (everyday speaking, grammar, vocabulary)",
  english_exam: "English exam prep (IELTS / TOEFL / Cambridge)",
  math: "Math (algebra, geometry, calculus, word problems)",
  biology: "Biology (cells, ecology, anatomy, vocabulary)",
  chemistry: "Chemistry (equations, reactions, lab work)",
  physics: "Physics (mechanics, free-body diagrams, waves)",
  history: "History (sources, essays, thesis writing)",
  literature: "Literature (novels, poetry, analysis)",
  computer_science: "Computer Science (coding, debugging, algorithms)",
  economics: "Economics (supply/demand, real-world examples)",
  geography: "Geography (maps, climate, regions)",
  art_music: "Art / Music (sketches, scales, practice routines)",
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
// PERSON FIELDS — name / job / vibe pools (subject-agnostic)
// =============================================================================

const TUTOR_NAMES = [
  "Anna", "James", "Marta", "David", "Linh", "Pavel", "Olivia", "Joaquin",
  "Fatima", "Kenji", "Sara", "Lukas", "Ngozi", "Chiara", "Amir", "Elena",
  "Tomás", "Priya", "Daniel", "Mira", "Sebastian", "Yara", "Hugo", "Aiko",
  "Carlos", "Beatriz", "Krzysztof", "Ines", "Mateo", "Sofia",
  "Andrei", "Mei", "Rafael", "Hannah", "Theo", "Zara", "Niko",
  "Jasmine", "Felipe", "Aria", "Marko", "Yuna", "Diego", "Camille",
  "Hassan", "Wei", "Ola", "Bruno", "Eleni", "Rico",
] as const;

const STUDENT_NAMES = [
  "Sara", "Minh", "Tomás", "Aisha", "Liam", "Yuki", "Marko", "Nina",
  "Joon", "Ines", "Hugo", "Kavya", "Felipe", "Zara", "Pavel", "Linh",
  "Sven", "Mariam", "Diego", "Aiko", "Lukas", "Priya", "Theo", "Ana",
  "Hassan", "Mei", "Rafael", "Beatriz", "Andrei", "Camille", "Jin",
  "Olu", "Lara", "Rico", "Eleni", "Wei", "Niko", "Yara",
  "Bruno", "Noor", "Henrik", "Chiara", "Mateo", "Hana", "Ola",
  "Tariq", "Jana", "Kofi", "Lena", "Pablo", "Aya",
] as const;

const STUDENT_PROFESSIONS = [
  "graphic designer", "software engineer", "nurse", "marketing manager",
  "uni student", "high school student", "freelance writer", "accountant",
  "teacher", "barista taking a course on the side", "civil engineer",
  "data analyst", "real estate agent", "small business owner",
  "stay-at-home parent getting back into studying", "PhD student",
  "lawyer", "product manager", "consultant", "researcher",
  "back to studying after a 5-year break", "doctor doing residency",
  "junior dev", "operations manager", "translator", "chef",
  "logistics coordinator", "physiotherapist", "video editor",
  "supply chain analyst", "freelance illustrator",
] as const;

const TUTOR_VIBES = [
  "warm and patient",
  "efficient and punchy",
  "slightly chatty, asks small follow-ups",
  "calm - gives the student space to think",
  "encouraging without overdoing praise",
  "direct, gentle corrections",
] as const;

const STUDENT_VIBES = [
  "polite and slightly anxious",
  "chatty and friendly",
  "quiet, short replies",
  "self-deprecating about mistakes",
  "confident but rusty",
  "tired but engaged",
  "curious, asks back a lot",
  "embarrassed about basics",
] as const;

const HOMEWORK_STATUSES = [
  "did all of it",
  "did most of it, got stuck on one",
  "did half - work was crazy this week",
  "barely started - sorry",
  "forgot until last night, rushed it",
  "did it but i'm not sure about a few",
  "did all but one feels wrong",
] as const;

const TUTOR_YEARS = [3, 4, 5, 6, 7, 8, 9, 10, 12] as const;

// =============================================================================
// SUB-DOMAIN TYPES
// =============================================================================

export type SubDomain = {
  /** Sub-domain key, e.g. "python_basics" */
  key: string;
  /** Human label for scenario card, e.g. "Python basics" */
  label: string;
  /** Default framing hint for exercises in this sub-domain */
  framingHint: FramingHint;
  /** What the tutor specializes in (one sentence). */
  tutorFocus: string;
  /** Why student is learning this sub-domain (3-4 phrasings, casual). */
  trialReason: readonly string[];
  /** Student weakness phrasings - CASUAL student voice, NOT technical (4 items). */
  weakness: readonly string[];
  /** Exercises - SNIPPET format, paste-able into chat (6 items). */
  exercises: readonly string[];
  /** What "last lesson" covered for session2 scenarios (3 items). */
  lastLessonTopics: readonly string[];
  /** Short noun phrases the tutor references in closing (3-4 items). */
  closingTopics: readonly string[];
};

type SubjectConfig = {
  subDomains: Record<string, SubDomain>;
};

// =============================================================================
// COMPUTER SCIENCE (5 sub-domains)
// =============================================================================

const CS_SUB_DOMAINS: Record<string, SubDomain> = {
  python_basics: {
    key: "python_basics",
    label: "Python basics",
    framingHint: "code",
    tutorFocus: "Python basics for beginners - variables, loops, dicts, lists, functions",
    trialReason: [
      "career switch into dev, picked Python as my first lang",
      "uni CS course starting and we use Python",
      "trying to automate boring stuff at my job",
      "doing a coding bootcamp and Python is the foundation",
    ],
    weakness: [
      "loops break me, like off-by-one is the worst",
      "i forget the syntax for dictionaries",
      "i can read code but writing it from scratch is hard",
      "indentation errors keep biting me",
    ],
    exercises: [
      "fix this loop: for i in range(len(arr)-1): print(arr[i])",
      "my_dict = {'name': 'alex'} - add 'age' = 25 ?",
      "for i in range(5): print(i) - what's the output?",
      "complete the swap: a, b = ___, ___",
      "predict output: for i in range(0, 10, 2): print(i)",
      "nums = [1,2,3,4] - sum without using sum()",
    ],
    lastLessonTopics: [
      "for loops and range",
      "list slicing basics",
      "intro to dictionaries",
    ],
    closingTopics: [
      "list comprehensions",
      "dictionary syntax",
      "off-by-one errors",
      "indentation",
    ],
  },
  dsa: {
    key: "dsa",
    label: "Data structures and algorithms",
    framingHint: "code",
    tutorFocus: "Data structures and algorithms - Big O, recursion, sorting, hashmaps",
    trialReason: [
      "interviewing for a junior dev role and DSA breaks me",
      "uni course on algorithms is starting",
      "self-taught dev finally tackling Big O",
      "leetcode mediums kill me, want a structured approach",
    ],
    weakness: [
      "big O confuses me",
      "i never know if my code is fast enough",
      "recursion makes my head spin",
      "i can't tell when to use a hashmap vs a list",
    ],
    exercises: [
      "what's the time complexity: for i in arr: for j in arr: print(i+j)",
      "what's the complexity: while lo < hi: mid = (lo+hi)//2",
      "spot the bug: def fib(n): return fib(n-1) + fib(n-2)",
      "fix the dup check: seen=set(); for x in arr: if x in seen: return x",
      "rank by complexity: O(n), O(n+m), O(2n), O(n log n) - which is fastest?",
      "fix linked list reverse: prev=None; curr=head; while curr: curr.next=prev; prev=curr; curr=curr.next",
    ],
    lastLessonTopics: [
      "Big O basics",
      "intro to recursion",
      "hashmap patterns",
    ],
    closingTopics: [
      "Big O analysis",
      "recursion patterns",
      "hashmap vs array tradeoffs",
      "linked list pointers",
    ],
  },
  web_dev: {
    key: "web_dev",
    label: "Web dev basics",
    framingHint: "code",
    tutorFocus: "Web dev basics - HTML, CSS layout, vanilla JS",
    trialReason: [
      "want to add frontend to my backend skills",
      "building a personal portfolio site",
      "career pivot from QA to frontend",
      "uni web dev module starting next term",
    ],
    weakness: [
      "css positioning makes no sense to me",
      "i copy stack overflow and pray",
      "flexbox vs grid, i never know which",
      "javascript 'this' freaks me out",
    ],
    exercises: [
      "complete: .center { display: ___; justify-content: ___; align-items: ___; }",
      "<div style='display:none'>A</div><div style='visibility:hidden'>B</div> - which keeps space?",
      "const arr = [1,2,3]; arr.push(4); console.log(arr.length) - output?",
      "console.log(typeof null) - output?",
      "el.onclick = fn1; el.onclick = fn2; vs el.addEventListener('click', fn1); el.addEventListener('click', fn2); - which keeps both?",
      "spot the strict mode error: 'use strict'; x = 5; // no var/let/const",
    ],
    lastLessonTopics: [
      "flexbox basics",
      "DOM event listeners",
      "CSS box model",
    ],
    closingTopics: [
      "flexbox vs grid",
      "CSS positioning",
      "JS event handling",
      "the 'this' keyword",
    ],
  },
  git: {
    key: "git",
    label: "Git and version control",
    framingHint: "code",
    tutorFocus: "Git and version control - branches, merge, rebase, conflict resolution",
    trialReason: [
      "joined a team and don't know git well",
      "got bitten by a merge conflict and want to actually understand",
      "career switch into dev, every job needs git",
      "self-taught dev finally learning git properly",
    ],
    weakness: [
      "git rebase confuses me",
      "merge conflicts make me want to give up",
      "i'm scared of force push",
      "i don't get the difference between merge and rebase",
    ],
    exercises: [
      "git log: * abc oops (HEAD -> main) | * def good - command to undo soft, keep changes?",
      "merge result: c1 - c2 - merge-commit | rebase result: c1 - c2 - c3 - which is which?",
      "git status: 3 modified files, need to switch branch - command to save them temporarily?",
      "git log --oneline: abc1 wip / abc2 add feat / abc3 fix typo - command to squash all 3?",
      "fill: git pull = git fetch + git ___",
      "git reflog: HEAD@{2}: good_commit - command to recover after bad force push?",
    ],
    lastLessonTopics: [
      "branches and merging",
      "git stash",
      "interactive rebase",
    ],
    closingTopics: [
      "rebase workflow",
      "merge conflict resolution",
      "force push safety",
      "git reflog recovery",
    ],
  },
  interview_prep: {
    key: "interview_prep",
    label: "Interview prep",
    framingHint: "code",
    tutorFocus: "Coding interview prep - LeetCode patterns, light system design",
    trialReason: [
      "interview at a startup in 3 weeks",
      "leetcode mediums kill me",
      "switching companies and need to grind",
      "first dev job interviews coming up",
    ],
    weakness: [
      "i panic on whiteboard",
      "i can solve it slowly but never in 30 mins",
      "two pointers vs sliding window, i mix them up",
      "system design questions are too vague for me",
    ],
    exercises: [
      "complete two_sum: seen={}; for i,n in enumerate(arr): if target-n in seen: return [seen[target-n], ___]; seen[n] = ___",
      "fix the sliding window bug: while s[end] in seen: seen.remove(s[end]); start += 1",
      "complete is_sorted: return all(arr[i] <= arr[i+1] for i in range(___))",
      "complete valid_parens stack: if c in '({[': stack.append(c); else: if not stack: return False; if pairs[stack.pop()] != ___: return False",
      "complete slow/fast pointer: while fast and fast.next: slow = slow.___ ; fast = fast.next.___",
      "design a url shortener - fill the 3 main components: hash function, ___, ___",
    ],
    lastLessonTopics: [
      "two pointer pattern",
      "sliding window",
      "stack patterns",
    ],
    closingTopics: [
      "sliding window pattern",
      "two pointers",
      "stack-based problems",
      "system design fundamentals",
    ],
  },
};

// =============================================================================
// MATH (5 sub-domains)
// =============================================================================

const MATH_SUB_DOMAINS: Record<string, SubDomain> = {
  algebra: {
    key: "algebra",
    label: "Algebra",
    framingHint: "math",
    tutorFocus: "Algebra - linear equations, inequalities, factoring, polynomials",
    trialReason: [
      "uni course assumes algebra and i'm rusty",
      "GRE quant prep",
      "helping my kid with homework and i forgot it all",
      "high school algebra final coming up",
    ],
    weakness: [
      "word problems trip me up",
      "i mess up signs when moving stuff over",
      "factoring is the worst",
      "i forget the rules for inequalities",
    ],
    exercises: [
      "solve 2x + 5 = 13",
      "factor x^2 - 9",
      "expand (x+2)(x-3)",
      "solve 3(x-2) = 2x + 5",
      "solve -2x > 6 (careful with the inequality)",
      "factor x^2 + 5x + 6",
    ],
    lastLessonTopics: [
      "linear equations",
      "factoring quadratics",
      "inequality rules",
    ],
    closingTopics: [
      "factoring patterns",
      "sign-flip in inequalities",
      "FOIL expansion",
      "isolating x",
    ],
  },
  geometry: {
    key: "geometry",
    label: "Geometry",
    framingHint: "math",
    tutorFocus: "Geometry - triangles, circles, angles, basic proofs",
    trialReason: [
      "SAT geometry section is killing me",
      "high school geometry exam coming up",
      "uni course starting with geometry refresh",
      "trig is up next and i need geometry first",
    ],
    weakness: [
      "proofs make no sense to me",
      "i forget the area formulas under pressure",
      "i mix up sin cos tan",
      "angles in circles confuse me",
    ],
    exercises: [
      "area of a triangle with base 6 and height 4",
      "right triangle, legs 3 and 4 - hypotenuse?",
      "interior angles of a hexagon sum to?",
      "circle radius 5 - area? circumference?",
      "if sin(theta) = 0.5, theta in degrees?",
      "two parallel lines cut by transversal at 60 degrees - alternate interior angle?",
    ],
    lastLessonTopics: [
      "triangle area + Pythagoras",
      "circle area and circumference",
      "angle theorems",
    ],
    closingTopics: [
      "Pythagorean triples",
      "circle theorems",
      "angle pairs",
      "SOH CAH TOA",
    ],
  },
  calculus: {
    key: "calculus",
    label: "Calculus",
    framingHint: "math",
    tutorFocus: "Calculus - derivatives, integrals, chain rule, applications",
    trialReason: [
      "engineering masters needs a calc refresh",
      "first calc course at uni starting",
      "rusty after 10 years and need it for stats",
      "data bootcamp assumes calculus",
    ],
    weakness: [
      "i forget the derivative rules",
      "chain rule trips me up",
      "integrals are scary",
      "i don't get when to use product vs quotient rule",
    ],
    exercises: [
      "derivative of 3x^2 + 2x",
      "derivative of sin(2x)",
      "integral of 4x dx",
      "derivative of x*ln(x)",
      "derivative of (x^2)/(x+1)",
      "evaluate the integral from 0 to 2 of x^2 dx",
    ],
    lastLessonTopics: [
      "power rule",
      "chain rule basics",
      "intro to integrals",
    ],
    closingTopics: [
      "chain rule",
      "product rule",
      "definite integrals",
      "derivative shortcuts",
    ],
  },
  stats: {
    key: "stats",
    label: "Stats",
    framingHint: "math",
    tutorFocus: "Statistics - mean, median, distribution, probability basics",
    trialReason: [
      "data bootcamp and the stats hurt",
      "psych research methods course needs stats",
      "starting a stats course at uni",
      "data analyst role requires stats",
    ],
    weakness: [
      "stats vocab confuses me",
      "i mix up mean median mode under pressure",
      "probability questions make me freeze",
      "i don't get standard deviation intuitively",
    ],
    exercises: [
      "mean of [3, 5, 7, 9, 11]",
      "median of [2, 4, 6, 8, 10, 12]",
      "P(rolling a 6 on a die) = ?",
      "P(2 heads in 2 coin flips) = ?",
      "what's the mode of [1, 2, 2, 3, 4]?",
      "if mean = 50, std dev = 10 - 1 std above mean?",
    ],
    lastLessonTopics: [
      "central tendency",
      "basic probability",
      "intro to distributions",
    ],
    closingTopics: [
      "mean vs median",
      "probability rules",
      "standard deviation",
      "distribution shape",
    ],
  },
  word_problems: {
    key: "word_problems",
    label: "Word problems",
    framingHint: "math",
    tutorFocus: "Word problems and SAT-style math - translating words to equations",
    trialReason: [
      "SAT prep, math section drops on word problems",
      "GRE quant - word problems are my weakness",
      "kid keeps asking me word problem help",
      "trying to relearn algebra via SAT problems",
    ],
    weakness: [
      "i can't translate words to equations",
      "i miss a step and the whole thing breaks",
      "i waste time re-reading the question",
      "ratio problems specifically kill me",
    ],
    exercises: [
      "train at 60mph, another at 80mph same direction. when does 2nd catch up if 1st started 1 hr earlier?",
      "shirt costs $20 after 25% off - original price?",
      "ratio of boys to girls is 3:5 - if 25 girls, how many boys?",
      "alex is 5 yrs older than ben. in 10 yrs alex's age = 2x ben's. find ages now",
      "rectangle perimeter 30, length is 2x width - find dimensions",
      "what's 15% of 80?",
    ],
    lastLessonTopics: [
      "rate problems",
      "percent problems",
      "ratio scaling",
    ],
    closingTopics: [
      "rate setups",
      "ratio scaling",
      "percent backwards",
      "equation translation",
    ],
  },
};

// =============================================================================
// ENGLISH EXAM (4 sub-domains) - Cambridge uses 4 official UoE format types
// =============================================================================

const ENGLISH_EXAM_SUB_DOMAINS: Record<string, SubDomain> = {
  ielts_speaking: {
    key: "ielts_speaking",
    label: "IELTS speaking",
    framingHint: "language",
    tutorFocus: "IELTS speaking - parts 1, 2, 3, fluency under timing",
    trialReason: [
      "IELTS in 6 weeks for visa, speaking is the lowest",
      "second IELTS attempt, last speaking was 5.5",
      "uni admission needs 7.0 and i'm at 6 in speaking",
      "moving abroad and need 6.5 minimum",
    ],
    weakness: [
      "part 2 makes me blank, the long turn freaks me out",
      "i run out of things to say after 30 sec",
      "my pronunciation tanks under pressure",
      "i overthink and pause too much",
    ],
    exercises: [
      "spot the band-6 phrase: 'i think yes the place is good'",
      "rewrite the speech with smoother fillers: 'um yeah um i mostly um like japan um'",
      "rewrite to be more complex: 'yes i think so'",
      "fix the stress: 'i WANT to GO to LONDON'",
      "complete with a contrast linker (not but/however): 'I love coffee. ___, my doctor said to cut down.'",
      "rewrite as a 2-sentence answer with a reason: 'do you prefer mornings or evenings?'",
    ],
    lastLessonTopics: [
      "part 2 long turn structure",
      "natural fillers",
      "part 3 elaboration",
    ],
    closingTopics: [
      "part 2 fillers",
      "long turn structure",
      "part 3 elaboration",
      "natural stress",
    ],
  },
  ielts_writing: {
    key: "ielts_writing",
    label: "IELTS writing",
    framingHint: "language",
    tutorFocus: "IELTS writing task 1 (graphs) + task 2 (essay)",
    trialReason: [
      "task 2 always scores 6 and i can't break past it",
      "visa needs 7 in writing",
      "uni admission, IELTS writing is my weakest",
      "second attempt, want to fix the writing band",
    ],
    weakness: [
      "task 2 essays score 6 and i can't fix it",
      "task 1 graphs all blur together",
      "linkers feel forced when i use them",
      "my vocab feels too basic for band 7",
    ],
    exercises: [
      "task 1: rewrite with stronger lexis: 'sales of A rose 20% from 2010 to 2015'",
      "fix the weak thesis: 'In my opinion, governments should fund arts because it is good.'",
      "rewrite as a paraphrase: 'The chart below shows the population of 5 cities from 2000 to 2020.'",
      "spot the band-6 sentence: 'Many people think pollution is bad. I agree.'",
      "fix with a stronger linker than 'also': 'Pollution harms health. Also, it damages buildings.'",
      "rewrite to be less repetitive: 'In conclusion, I think...'",
    ],
    lastLessonTopics: [
      "task 2 essay structure",
      "task 1 paraphrasing",
      "linker variety",
    ],
    closingTopics: [
      "task 2 thesis",
      "task 1 paraphrase",
      "linker upgrade",
      "lexical range",
    ],
  },
  toefl: {
    key: "toefl",
    label: "TOEFL",
    framingHint: "language",
    tutorFocus: "TOEFL iBT - integrated tasks, independent tasks, timing",
    trialReason: [
      "TOEFL 100 for grad school in the US",
      "PhD application needs 105+",
      "switched from IELTS to TOEFL, format is new",
      "TOEFL in 8 weeks and i've never taken it",
    ],
    weakness: [
      "the integrated speaking task makes me freeze",
      "i can't take notes and listen at the same time",
      "writing integrated mixes me up - lecture vs reading",
      "the timing kills me, especially speaking",
    ],
    exercises: [
      "fill the timing: integrated speaking task 2 - prep ___ sec, speak ___ sec",
      "fix the integrated writing opener: 'In the listening, the lecturer talks about the topic from the reading.'",
      "complete the integrated speaking structure: reading point + lecture point + ___",
      "rewrite the prompt as a paraphrase: 'Do you agree that technology improves education?'",
      "fill: TOEFL independent writing target word count = ___ words",
      "fix the example transition (not 'for example'): 'Pollution harms health. ___, smog causes asthma.'",
    ],
    lastLessonTopics: [
      "integrated speaking timing",
      "integrated writing template",
      "independent writing structure",
    ],
    closingTopics: [
      "integrated speaking timing",
      "integrated writing template",
      "note-taking under timing",
      "transition variety",
    ],
  },
  cambridge: {
    key: "cambridge",
    label: "Cambridge English (FCE / CAE / CPE)",
    framingHint: "language",
    tutorFocus: "Cambridge English - FCE, CAE, CPE Use of English (multi-choice cloze, open cloze, word formation, key word transformation)",
    trialReason: [
      "C1 cert needed for uni admission",
      "company will pay me a bonus for C1",
      "FCE next month for high school cert",
      "CAE for visa in 3 months",
    ],
    weakness: [
      "key word transformations break me",
      "multiple choice cloze always traps me",
      "i mix up phrasal verbs constantly",
      "word formation prefixes/suffixes confuse me",
    ],
    exercises: [
      "multi-choice cloze: 'He was ___ accused of stealing.' (A) wrongly (B) badly (C) hardly (D) loosely",
      "open cloze: '___ the rain, we went out.' (one word)",
      "word formation: 'He showed great ___ in the project.' (DETERMINE)",
      "key word transformation: 'I haven't seen him for years.' (AGES) -> It has _____ him.",
      "multi-choice cloze: 'She was deeply ___ by the speech.' (A) genuinely (B) widely (C) heavily (D) moved",
      "word formation: 'Her ___ was clear from the start.' (ENTHUSIASTIC)",
    ],
    lastLessonTopics: [
      "key word transformations",
      "open cloze grammar",
      "word formation patterns",
    ],
    closingTopics: [
      "key word transformations",
      "open cloze gaps",
      "word formation",
      "multiple choice cloze",
    ],
  },
};

// =============================================================================
// ENGLISH GENERAL (4 sub-domains)
// =============================================================================

const ENGLISH_GENERAL_SUB_DOMAINS: Record<string, SubDomain> = {
  everyday_conversation: {
    key: "everyday_conversation",
    label: "Everyday conversation",
    framingHint: "language",
    tutorFocus: "Everyday speaking - small talk, daily situations, restaurants, travel",
    trialReason: [
      "i moved abroad and need english for daily stuff",
      "going on a 3-week trip and want to feel comfy",
      "my partner's family is english speaking, want to keep up",
      "watching shows without subs is the goal",
    ],
    weakness: [
      "small talk is hard, i never know what to say",
      "i freeze when someone asks me a question fast",
      "ordering at restaurants makes me nervous",
      "i can read fine but speaking is messy",
    ],
    exercises: [
      "fix: 'i go to the restaurant yesterday'",
      "complete: 'how was your ___? mine was great.'",
      "fix: 'i am agree with you'",
      "complete a polite request: 'could you ___ me the menu, please?'",
      "fix: 'how it is going?'",
      "complete: 'sorry to ___ you, do you know where the station is?'",
    ],
    lastLessonTopics: [
      "small talk openers",
      "restaurant phrases",
      "asking for directions",
    ],
    closingTopics: [
      "small talk fluency",
      "polite requests",
      "restaurant phrases",
      "directions vocabulary",
    ],
  },
  work_communication: {
    key: "work_communication",
    label: "Work communication",
    framingHint: "language",
    tutorFocus: "Business english - emails, calls, meetings, professional small talk",
    trialReason: [
      "got promoted and now in international meetings",
      "i talk to clients in english and it gets messy",
      "switched companies and the new one is english only",
      "writing emails in english takes me forever",
    ],
    weakness: [
      "writing emails feels too formal or too casual, never right",
      "speaking up in meetings is scary",
      "i sound rude on calls when i don't mean to",
      "i mix up tone for different situations",
    ],
    exercises: [
      "fix the tone for an email: 'send me the file now'",
      "complete: 'I hope this email finds you well. I am writing to ___'",
      "fix: 'thanks for your patience, looking forward your reply'",
      "rewrite politely: 'I need this by Friday'",
      "fix the meeting opener: 'so let us begin the meeting'",
      "complete a follow-up: 'just ___ to check on the status of...'",
    ],
    lastLessonTopics: [
      "email phrases",
      "meeting language",
      "politeness in calls",
    ],
    closingTopics: [
      "email tone",
      "meeting openers",
      "polite requests",
      "professional follow-ups",
    ],
  },
  grammar_fundamentals: {
    key: "grammar_fundamentals",
    label: "Grammar fundamentals",
    framingHint: "language",
    tutorFocus: "Core English grammar - tenses, articles, prepositions, modals",
    trialReason: [
      "tenses keep tripping me up at work",
      "going back to study english properly after years",
      "i can speak ok but my grammar is messy",
      "want a real foundation before exam prep",
    ],
    weakness: [
      "tenses confuse me, the 'have done' thing trips me up",
      "articles, i forget when to use 'the'",
      "prepositions feel random",
      "modals confuse me, can vs could vs may",
    ],
    exercises: [
      "fix: 'i have went to the store yesterday'",
      "fill: 'I ___ to the store yesterday' (go)",
      "fill: 'They ___ here since 2015' (live)",
      "fill articles: '___ apple a day keeps ___ doctor away'",
      "fix: 'i am agree with you'",
      "fill the preposition: 'The meeting is ___ Monday ___ 3 pm'",
    ],
    lastLessonTopics: [
      "past simple vs present perfect",
      "articles a/an/the",
      "prepositions of time",
    ],
    closingTopics: [
      "present perfect",
      "articles",
      "preposition patterns",
      "modal verbs",
    ],
  },
  pronunciation_clarity: {
    key: "pronunciation_clarity",
    label: "Pronunciation and clarity",
    framingHint: "language",
    tutorFocus: "Pronunciation and clarity - sounds, stress, intonation, rhythm",
    trialReason: [
      "people ask me to repeat myself often",
      "want to sound more natural at conferences",
      "my accent is a mix and i wanna clean it up",
      "starting customer-facing role, need clearer speech",
    ],
    weakness: [
      "the th sound is impossible for me",
      "i don't know which syllable to stress",
      "my intonation sounds flat, ppl say",
      "fast english blurs together when i speak",
    ],
    exercises: [
      "fix the stress: 'i WANT to GO to LONDON'",
      "fix the th: 'i tink so' (two pronunciation fixes)",
      "syllable stress: PHO-to-graph or pho-TO-graph?",
      "fix the linking: 'i am a teacher' said as 3 separate words",
      "stress: 'we eat OUT a lot' or 'we EAT out a lot'?",
      "fix the schwa: 'I want a banana' - which 'a' is schwa?",
    ],
    lastLessonTopics: [
      "th sounds",
      "word stress patterns",
      "linking sounds",
    ],
    closingTopics: [
      "th sounds",
      "word stress",
      "intonation patterns",
      "schwa drills",
    ],
  },
};

// =============================================================================
// BIOLOGY (4 sub-domains)
// =============================================================================

const BIOLOGY_SUB_DOMAINS: Record<string, SubDomain> = {
  cells_genetics: {
    key: "cells_genetics",
    label: "Cells and genetics",
    framingHint: "generic",
    tutorFocus: "Cell biology and genetics - organelles, mitosis/meiosis, Mendelian inheritance",
    trialReason: [
      "high school bio finals coming up",
      "first year biology at uni is overwhelming",
      "med school entrance exam in 4 months",
      "switched into bio masters and need refresh",
    ],
    weakness: [
      "i mix up mitosis and meiosis stages",
      "punnett squares confuse me with multiple traits",
      "cell organelles - i forget which does what",
      "DNA replication steps don't stick",
    ],
    exercises: [
      "label the 4 stages of mitosis in order",
      "punnett square: Bb x Bb - what's the genotype ratio?",
      "match: mitochondria does ___ , ribosome does ___",
      "name 3 differences between mitosis and meiosis",
      "in 1 line: what does mRNA do in protein synthesis?",
      "punnett square: AA x aa - genotypes of offspring?",
    ],
    lastLessonTopics: [
      "mitosis stages",
      "punnett squares basics",
      "cell organelles",
    ],
    closingTopics: [
      "mitosis vs meiosis",
      "punnett square setup",
      "DNA replication steps",
      "protein synthesis",
    ],
  },
  ecology: {
    key: "ecology",
    label: "Ecology",
    framingHint: "generic",
    tutorFocus: "Ecology - food webs, ecosystems, biomes, biodiversity",
    trialReason: [
      "AP biology coming up and ecology is half",
      "ecology unit at uni starting next week",
      "exam covers ecology and i'm rusty",
      "switched into environmental science",
    ],
    weakness: [
      "all the ecology vocab is huge",
      "i mix up biomes and ecosystems",
      "food chain vs food web confuses me",
      "nutrient cycles all blur",
    ],
    exercises: [
      "in food chain: grass -> rabbit -> fox - what's the producer?",
      "name 2 features of a temperate forest biome",
      "fill: ___ % of energy passes from one trophic level to the next",
      "name 3 biomes and 1 feature each",
      "name the 2 main steps of the nitrogen cycle",
      "match: producer = ___ , consumer = ___ , decomposer = ___ (give 1 example each)",
    ],
    lastLessonTopics: [
      "trophic levels",
      "biome characteristics",
      "nutrient cycles",
    ],
    closingTopics: [
      "biome features",
      "trophic energy",
      "nutrient cycles",
      "ecosystem services",
    ],
  },
  anatomy: {
    key: "anatomy",
    label: "Anatomy",
    framingHint: "generic",
    tutorFocus: "Human anatomy - body systems, organ functions, terminology",
    trialReason: [
      "nursing program needs anatomy basics",
      "med school admission test",
      "high school bio anatomy unit",
      "personal training cert covers anatomy",
    ],
    weakness: [
      "all the latin names blur together",
      "i mix up which organ does what",
      "i can't remember all the bones",
      "muscle groups confuse me",
    ],
    exercises: [
      "name the 4 chambers of the heart",
      "match: alveoli = ___ , nephron = ___ , villi = ___ (organ + role)",
      "name the 3 parts of the small intestine in order",
      "name 3 bones of the lower limb",
      "in 1 line: what's the function of the pancreas?",
      "match: cardiac, smooth, skeletal - which muscle is voluntary?",
    ],
    lastLessonTopics: [
      "circulatory system",
      "digestive tract",
      "muscle types",
    ],
    closingTopics: [
      "heart anatomy",
      "digestive organs",
      "muscle types",
      "skeletal landmarks",
    ],
  },
  biochem: {
    key: "biochem",
    label: "Biochemistry",
    framingHint: "math",
    tutorFocus: "Biochemistry - enzymes, ATP, photosynthesis, cellular respiration",
    trialReason: [
      "AP bio biochem unit is killing me",
      "med school MCAT prep",
      "uni biochem starting next term",
      "career pivot into pharma",
    ],
    weakness: [
      "photosynthesis equation never sticks",
      "i mix up enzymes and substrates",
      "ATP cycle is confusing",
      "respiration steps blur together",
    ],
    exercises: [
      "balance photosynthesis: 6CO2 + 6H2O -> ___ + ___",
      "name the 3 main steps of cellular respiration in order",
      "in 1 line: what's the role of ATP?",
      "what does an enzyme do to activation energy?",
      "match: glycolysis happens in ___ , Krebs in ___ , ETC in ___",
      "balance respiration: C6H12O6 + 6O2 -> ___ + ___",
    ],
    lastLessonTopics: [
      "photosynthesis equation",
      "ATP cycle",
      "respiration steps",
    ],
    closingTopics: [
      "photosynthesis",
      "respiration steps",
      "ATP-ADP cycle",
      "enzyme kinetics",
    ],
  },
};

// =============================================================================
// CHEMISTRY (3 sub-domains)
// =============================================================================

const CHEMISTRY_SUB_DOMAINS: Record<string, SubDomain> = {
  balancing_stoichiometry: {
    key: "balancing_stoichiometry",
    label: "Balancing equations and stoichiometry",
    framingHint: "math",
    tutorFocus: "Balancing chemical equations and stoichiometry calculations",
    trialReason: [
      "uni gen chem starting and balancing is week 1",
      "high school chem exam in 2 months",
      "career pivot into lab work",
      "med school admission test",
    ],
    weakness: [
      "balancing with polyatomic ions is the worst",
      "moles confuse me, can't track grams to moles",
      "limiting reactant problems trip me up",
      "i mess up coefficients vs subscripts",
    ],
    exercises: [
      "balance: H2 + O2 -> H2O",
      "balance: NaOH + HCl -> NaCl + H2O",
      "molar mass of NaCl = ?",
      "how many moles in 18 g of water? (H2O molar mass = 18)",
      "balance: Fe + O2 -> Fe2O3",
      "if 2 mol H2 reacts with 1 mol O2, mass of water produced?",
    ],
    lastLessonTopics: [
      "balancing simple equations",
      "mole conversions",
      "molar mass",
    ],
    closingTopics: [
      "balancing patterns",
      "mole conversions",
      "limiting reactant",
      "stoichiometry setup",
    ],
  },
  redox_acidsbase: {
    key: "redox_acidsbase",
    label: "Redox and acids/bases",
    framingHint: "math",
    tutorFocus: "Redox reactions and acid-base chemistry - oxidation states, pH, conjugate pairs",
    trialReason: [
      "redox unit started and i'm lost",
      "uni chem 101 covers acids/bases week 4",
      "exam in 6 weeks and these chapters scare me",
      "career into chem-related role",
    ],
    weakness: [
      "oxidation states never make sense",
      "i can't track which one is reduced vs oxidized",
      "pH calculations slip from my head",
      "conjugate pairs confuse me",
    ],
    exercises: [
      "oxidation state of Fe in Fe2O3?",
      "pH of 0.01 M HCl?",
      "conjugate base of NH4+ ?",
      "in 2Na + Cl2 -> 2NaCl, which is reduced?",
      "pH of 0.1 M NaOH?",
      "name the conjugate acid-base pairs in HCl + H2O -> H3O+ + Cl-",
    ],
    lastLessonTopics: [
      "oxidation states",
      "pH calculations",
      "conjugate pairs",
    ],
    closingTopics: [
      "oxidation tracking",
      "pH calculations",
      "conjugate pairs",
      "redox half-reactions",
    ],
  },
  organic: {
    key: "organic",
    label: "Organic chemistry basics",
    framingHint: "generic",
    tutorFocus: "Organic chemistry basics - functional groups, naming, simple reactions",
    trialReason: [
      "organic unit started and i'm panicking",
      "med school MCAT organic prep",
      "uni organic chem next term",
      "exam covers organic and i need help",
    ],
    weakness: [
      "naming organic compounds is the worst",
      "i mix up functional groups",
      "reactions all blur together",
      "i can't draw structures from names",
    ],
    exercises: [
      "name CH3CH2OH",
      "name CH3COOH",
      "what functional group is in CH3CHO?",
      "in 1 line, what does ethanal look like (structure description)?",
      "name the linear alkane C4H10",
      "what's the functional group in CH3CH2NH2?",
    ],
    lastLessonTopics: [
      "functional groups",
      "alkane naming",
      "alcohols and ethers",
    ],
    closingTopics: [
      "functional groups",
      "IUPAC naming",
      "addition reactions",
      "substitution reactions",
    ],
  },
};

// =============================================================================
// PHYSICS (4 sub-domains)
// =============================================================================

const PHYSICS_SUB_DOMAINS: Record<string, SubDomain> = {
  mechanics: {
    key: "mechanics",
    label: "Mechanics",
    framingHint: "math",
    tutorFocus: "Mechanics - forces, motion, kinematics, energy",
    trialReason: [
      "engineering uni starting and mechanics is week 1",
      "high school physics finals soon",
      "AP physics 1 prep",
      "career pivot into engineering",
    ],
    weakness: [
      "free-body diagrams - i forget normal force",
      "kinematics formulas all blur",
      "i can do equations but word problems break me",
      "i mix up scalar and vector",
    ],
    exercises: [
      "v = u + at - find v if u=2, a=3, t=4",
      "kinetic energy of 2 kg object at 3 m/s",
      "find acceleration: F=10N, m=2kg",
      "5 kg box on flat surface - normal force? (g=10)",
      "ball dropped from 20 m, time to land? (g=10)",
      "work done lifting 5 kg by 2 m? (g=10)",
    ],
    lastLessonTopics: [
      "Newton's 2nd law",
      "kinematics equations",
      "work and energy",
    ],
    closingTopics: [
      "FBD setup",
      "kinematics formulas",
      "work-energy theorem",
      "Newton's laws",
    ],
  },
  waves: {
    key: "waves",
    label: "Waves and oscillations",
    framingHint: "math",
    tutorFocus: "Waves and oscillations - frequency, wavelength, sound, simple harmonic motion",
    trialReason: [
      "waves unit just started and i'm lost",
      "AP physics 2 covers waves",
      "uni physics 2 starting",
      "engineering acoustics module",
    ],
    weakness: [
      "wavelength and frequency calculations confuse me",
      "i mix up transverse and longitudinal",
      "doppler effect is scary",
      "SHM equations slip",
    ],
    exercises: [
      "wavelength of a 5 Hz wave at 10 m/s",
      "if wavelength = 2 m, speed = 340 m/s, find frequency",
      "approx speed of sound in air = ___ m/s",
      "period of a wave with frequency 4 Hz",
      "match: light = ___ , sound = ___ (transverse / longitudinal)",
      "amplitude of SHM: x(t) = 3 cos(2t) - what is it?",
    ],
    lastLessonTopics: [
      "v = f * lambda",
      "wave types",
      "SHM basics",
    ],
    closingTopics: [
      "wave equation",
      "wave types",
      "doppler effect",
      "SHM amplitude",
    ],
  },
  electricity: {
    key: "electricity",
    label: "Electricity and circuits",
    framingHint: "math",
    tutorFocus: "Electricity - Ohm's law, circuits, current, resistance",
    trialReason: [
      "circuits unit starting and i'm rusty",
      "AP physics electricity",
      "engineering needs electricity basics",
      "career into electronics",
    ],
    weakness: [
      "circuits with parallel resistors confuse me",
      "i mix up V, I, R formulas",
      "kirchhoff's laws scare me",
      "capacitors don't make sense",
    ],
    exercises: [
      "V = IR. find V if I=2A, R=5 ohm",
      "two 4 ohm resistors in parallel - total resistance?",
      "find current: V=12V, R=6 ohm",
      "two 6 ohm resistors in series - total?",
      "power: P=VI. find P if V=10V, I=2A",
      "kirchhoff's voltage rule in 1 line",
    ],
    lastLessonTopics: [
      "Ohm's law",
      "series and parallel",
      "power formulas",
    ],
    closingTopics: [
      "Ohm's law applications",
      "parallel circuits",
      "kirchhoff's laws",
      "power calculations",
    ],
  },
  thermo: {
    key: "thermo",
    label: "Thermodynamics",
    framingHint: "math",
    tutorFocus: "Thermodynamics - heat, gas laws, entropy",
    trialReason: [
      "thermo chapter killing me",
      "engineering thermo course",
      "MCAT physics thermo",
      "uni physics 2 finals",
    ],
    weakness: [
      "i mix up Celsius and Kelvin",
      "PV=nRT confuses me with units",
      "first law of thermo is abstract",
      "entropy makes no sense intuitively",
    ],
    exercises: [
      "convert 27 Celsius to Kelvin",
      "PV = nRT. find P if n=1, V=1L, T=300K, R=8.31",
      "first law: deltaU = Q - W. if Q=100J, W=30J, deltaU = ?",
      "ideal gas at 300K, V=2L, P=1atm. if T -> 600K (P constant), V -> ?",
      "specific heat of water = ? (give approx value)",
      "heat to warm 1 kg water from 20C to 40C? (c=4.18 J/g/K)",
    ],
    lastLessonTopics: [
      "ideal gas law",
      "first law",
      "specific heat",
    ],
    closingTopics: [
      "PV=nRT",
      "first law",
      "specific heat",
      "entropy intuition",
    ],
  },
};

// =============================================================================
// HISTORY (3 sub-domains)
// =============================================================================

const HISTORY_SUB_DOMAINS: Record<string, SubDomain> = {
  essay_writing: {
    key: "essay_writing",
    label: "History essay writing",
    framingHint: "language",
    tutorFocus: "History essay writing - thesis, structure, evidence integration",
    trialReason: [
      "history major at uni and essays are hardest",
      "AP world history essay component",
      "writing thesis paper and stuck",
      "exchange semester needs essays in english",
    ],
    weakness: [
      "i can't form a strong thesis",
      "my essays are descriptive, not analytical",
      "i don't know how to integrate quotes",
      "intros and conclusions feel formulaic",
    ],
    exercises: [
      "write a 1-sentence thesis on causes of WWI",
      "rewrite to be analytical: 'WWI started in 1914.'",
      "spot the descriptive sentence: 'The Treaty of Versailles imposed harsh terms on Germany.'",
      "complete: 'The French Revolution failed primarily because ___'",
      "spot the weak thesis: 'WWII was bad for many reasons.'",
      "rewrite to be more specific: 'Many things caused the Civil War.'",
    ],
    lastLessonTopics: [
      "thesis writing",
      "evidence integration",
      "analytical sentences",
    ],
    closingTopics: [
      "thesis structure",
      "analytical voice",
      "evidence integration",
      "intro/conclusion patterns",
    ],
  },
  primary_sources: {
    key: "primary_sources",
    label: "Primary source analysis",
    framingHint: "language",
    tutorFocus: "Primary source analysis - bias, context, citation, reliability",
    trialReason: [
      "uni history covers source analysis week 1",
      "AP US history primary docs",
      "thesis paper based on primary sources",
      "high school history exam",
    ],
    weakness: [
      "i don't know how to use primary sources",
      "spotting bias in sources is hard",
      "i quote too much instead of paraphrasing",
      "context matters but i never know how",
    ],
    exercises: [
      "spot the bias: 'The peasants were ungrateful for the king's wisdom.' (1789 letter)",
      "rewrite to paraphrase: 'They were ungrateful for the king's wisdom.'",
      "context check: a 1942 newspaper - reliable for accurate info? why or why not in 1 line",
      "identify the perspective: 'We had no choice but to fight back.' (soldier letter)",
      "spot loaded language: 'The savages destroyed the village.'",
      "match: primary source = ___ , secondary = ___ (letter / textbook / etc)",
    ],
    lastLessonTopics: [
      "bias in sources",
      "paraphrasing",
      "source perspective",
    ],
    closingTopics: [
      "bias detection",
      "context analysis",
      "paraphrasing",
      "source corroboration",
    ],
  },
  modern_eras: {
    key: "modern_eras",
    label: "Modern eras",
    framingHint: "language",
    tutorFocus: "20th century history - world wars, cold war, decolonization",
    trialReason: [
      "AP modern world history exam",
      "uni modern history module",
      "history major focused on 20th century",
      "high school finals on world wars",
    ],
    weakness: [
      "dates and timelines blur",
      "all the cold war crises mix up",
      "i memorize but can't connect events",
      "decolonization vocab is huge",
    ],
    exercises: [
      "place in order: Cuban Missile Crisis, Korean War, fall of Berlin Wall",
      "name 2 causes of WWI",
      "what year did WWII end in Europe?",
      "match: Truman doctrine = ___ , Marshall plan = ___",
      "name 3 countries that decolonized after 1945",
      "in 1 sentence: what was the Iron Curtain?",
    ],
    lastLessonTopics: [
      "WWI causes",
      "cold war timeline",
      "decolonization",
    ],
    closingTopics: [
      "WWII timeline",
      "cold war flashpoints",
      "decolonization patterns",
      "interwar period",
    ],
  },
};

// =============================================================================
// LITERATURE (3 sub-domains)
// =============================================================================

const LITERATURE_SUB_DOMAINS: Record<string, SubDomain> = {
  poetry_analysis: {
    key: "poetry_analysis",
    label: "Poetry analysis",
    framingHint: "language",
    tutorFocus: "Poetry analysis - imagery, metaphor, form, sound devices",
    trialReason: [
      "english lit major covers poetry hard",
      "AP english lit exam focuses on poems",
      "writing thesis on a poet",
      "exam essays on set poems",
    ],
    weakness: [
      "i can't analyse poetry, i just describe it",
      "metaphors confuse me",
      "i don't see imagery patterns",
      "form vs content split is unclear to me",
    ],
    exercises: [
      "what's the metaphor in: 'Hope is the thing with feathers'",
      "identify the sound device: 'silent silver of the moon'",
      "rewrite to be analytical: 'this poem is about love'",
      "spot the imagery: 'her eyes were dark pools of midnight'",
      "what's the meter: 'Shall I compare thee to a summer's day'",
      "identify the device: 'death, be not proud'",
    ],
    lastLessonTopics: [
      "metaphor analysis",
      "imagery",
      "sound devices",
    ],
    closingTopics: [
      "metaphor depth",
      "imagery patterns",
      "form analysis",
      "thematic analysis",
    ],
  },
  novels_modern: {
    key: "novels_modern",
    label: "Modern novels",
    framingHint: "language",
    tutorFocus: "Modern fiction analysis - character, narrative, themes",
    trialReason: [
      "uni lit covers modern novels",
      "AP english lit modern fiction",
      "thesis on a 20th century novelist",
      "book club leader, want deeper analysis",
    ],
    weakness: [
      "themes and motifs confuse me",
      "i can't read between the lines",
      "narrative voice is hard to spot",
      "modernist writing makes no sense",
    ],
    exercises: [
      "identify the narrator: 'I had been awake for hours' - first or third person?",
      "name 2 themes in The Great Gatsby",
      "what does the green light symbolize in Gatsby?",
      "spot the unreliable narrator clue: 'I'm sure I locked the door'",
      "in 1 line: what's stream of consciousness?",
      "identify the theme: 'Time is a flat circle' (one-line analysis)",
    ],
    lastLessonTopics: [
      "theme identification",
      "narrative voice",
      "symbolism",
    ],
    closingTopics: [
      "theme depth",
      "narrative perspective",
      "symbolism",
      "modernist techniques",
    ],
  },
  classics_drama: {
    key: "classics_drama",
    label: "Classics and drama",
    framingHint: "language",
    tutorFocus: "Shakespeare and classical drama - tragedy, comedy, dramatic devices",
    trialReason: [
      "exam covers Hamlet specifically",
      "uni lit Shakespeare unit",
      "drama club, want better analysis",
      "AP english lit Shakespeare",
    ],
    weakness: [
      "Shakespeare's language is hard",
      "i can't follow the plot in old plays",
      "soliloquies are confusing",
      "dramatic irony i never spot",
    ],
    exercises: [
      "identify the device: 'A horse, a horse, my kingdom for a horse'",
      "in 1 line: what's a soliloquy?",
      "give a 1-line example of dramatic irony",
      "what does 'wherefore art thou Romeo' mean?",
      "name a comic relief character in Hamlet",
      "identify the rhyme: 'love is blind, and lovers cannot see / The pretty follies that themselves commit'",
    ],
    lastLessonTopics: [
      "Shakespeare's verse",
      "soliloquy structure",
      "dramatic irony",
    ],
    closingTopics: [
      "soliloquy analysis",
      "Shakespeare language",
      "dramatic irony",
      "tragic structure",
    ],
  },
};

// =============================================================================
// ECONOMICS (4 sub-domains)
// =============================================================================

const ECONOMICS_SUB_DOMAINS: Record<string, SubDomain> = {
  micro: {
    key: "micro",
    label: "Microeconomics",
    framingHint: "generic",
    tutorFocus: "Microeconomics - supply, demand, elasticity, market structures",
    trialReason: [
      "uni micro econ class starting",
      "MBA micro econ component",
      "investing hobby, want fundamentals",
      "career into financial analysis",
    ],
    weakness: [
      "i mix up shifts in supply vs movement along curve",
      "elasticity formulas slip from my head",
      "market structures confuse me",
      "monopoly graphs make no sense",
    ],
    exercises: [
      "if Q drops 10% and P rises 5%, find PED",
      "is this a supply shift or demand shift: 'oil prices rise' (which curve?)",
      "match: perfect competition = ___ , monopoly = ___ , oligopoly = ___ (which has price-takers?)",
      "in 1 line: effect of a price ceiling on quantity?",
      "supply shifts right means: P ___ , Q ___",
      "PED of a luxury good is usually: elastic or inelastic?",
    ],
    lastLessonTopics: [
      "supply and demand",
      "elasticity",
      "market structures",
    ],
    closingTopics: [
      "supply vs demand shifts",
      "elasticity",
      "monopoly graphs",
      "consumer surplus",
    ],
  },
  macro: {
    key: "macro",
    label: "Macroeconomics",
    framingHint: "generic",
    tutorFocus: "Macroeconomics - GDP, inflation, unemployment, fiscal/monetary policy",
    trialReason: [
      "AP macro coming up",
      "uni macro module",
      "MBA macro component",
      "trying to understand the news",
    ],
    weakness: [
      "GDP indicators all blur",
      "i don't get when to use real vs nominal",
      "monetary policy confuses me",
      "phillips curve scares me",
    ],
    exercises: [
      "name 2 differences between GDP and GNP",
      "if nominal GDP = 110, deflator = 1.1, real GDP = ?",
      "central bank raises interest rates - effect on inflation?",
      "match: expansionary fiscal = ___ , contractionary fiscal = ___ (gov spending up/down)",
      "GDP = C + I + G + ___",
      "phillips curve shows tradeoff between ___ and ___",
    ],
    lastLessonTopics: [
      "GDP basics",
      "monetary policy",
      "fiscal policy",
    ],
    closingTopics: [
      "GDP indicators",
      "monetary tools",
      "fiscal multipliers",
      "inflation measurement",
    ],
  },
  behavioral: {
    key: "behavioral",
    label: "Behavioral economics",
    framingHint: "generic",
    tutorFocus: "Behavioral economics - cognitive biases, nudges, prospect theory",
    trialReason: [
      "behavioral econ class starting",
      "psychology + econ combo major",
      "want to apply nudges at my company",
      "fascinated by Daniel Kahneman's work",
    ],
    weakness: [
      "all the biases names blur",
      "i can't apply nudges to real cases",
      "loss aversion vs risk aversion is fuzzy",
      "prospect theory math is scary",
    ],
    exercises: [
      "spot the bias: 'I'll keep this stock because i bought it at 100'",
      "name 2 examples of nudges",
      "loss aversion means: people feel loss ___ x more than gain",
      "match: anchoring = ___ , confirmation bias = ___ , sunk cost = ___ (give 1-line example each)",
      "spot the bias: 'this brand is always in the news, must be popular'",
      "in 1 line: what's the endowment effect?",
    ],
    lastLessonTopics: [
      "common biases",
      "nudge examples",
      "loss aversion",
    ],
    closingTopics: [
      "anchoring",
      "loss aversion",
      "nudge design",
      "framing effects",
    ],
  },
  exam_prep: {
    key: "exam_prep",
    label: "Econ exam prep",
    framingHint: "generic",
    tutorFocus: "AP/IB economics exam prep - FRQ structure, multiple choice strategy",
    trialReason: [
      "AP macro/micro in 2 months",
      "IB econ HL exam coming",
      "second exam attempt, want to improve",
      "uni placement exam in econ",
    ],
    weakness: [
      "i panic on multiple choice",
      "FRQs always score lower than i expect",
      "graphs in MCQs trip me up",
      "i run out of time",
    ],
    exercises: [
      "FRQ structure: ___ + body + ___ (fill the 2 missing parts)",
      "spot the trap MCQ: which answer has the wrong direction in 'price ceiling -> quantity ___'?",
      "name 2 things to label on every macro graph",
      "rewrite this short FRQ answer to be more complete: 'Yes, raising interest rates reduces inflation.'",
      "AP macro: roughly how many MCQs in section 1?",
      "IB econ paper 1 has ___ questions",
    ],
    lastLessonTopics: [
      "FRQ structure",
      "graph labeling",
      "MCQ traps",
    ],
    closingTopics: [
      "FRQ writing",
      "graph labels",
      "exam timing",
      "MCQ strategy",
    ],
  },
};

// =============================================================================
// GEOGRAPHY (3 sub-domains)
// =============================================================================

const GEOGRAPHY_SUB_DOMAINS: Record<string, SubDomain> = {
  physical: {
    key: "physical",
    label: "Physical geography",
    framingHint: "generic",
    tutorFocus: "Physical geography - landforms, climate, hydrology, plate tectonics",
    trialReason: [
      "GCSE geography next term",
      "uni physical geography starting",
      "exam covers physical sections",
      "self-study, want to understand the earth",
    ],
    weakness: [
      "climate patterns confuse me",
      "i can't read contour lines",
      "river features blur together",
      "plate boundaries are fuzzy",
    ],
    exercises: [
      "what does a closed loop of contour lines mean?",
      "name 3 features of a temperate climate",
      "name 2 erosion features of rivers",
      "match: convergent = ___ , divergent = ___ , transform = ___ (plate boundaries)",
      "feature: V-shaped valley - usually formed by ___ ?",
      "in 1 line: what causes the rain shadow effect?",
    ],
    lastLessonTopics: [
      "contour lines",
      "climate types",
      "river processes",
    ],
    closingTopics: [
      "contour reading",
      "climate zones",
      "plate boundaries",
      "river features",
    ],
  },
  human: {
    key: "human",
    label: "Human geography",
    framingHint: "generic",
    tutorFocus: "Human geography - population, urbanization, migration, economic patterns",
    trialReason: [
      "AP human geo exam",
      "uni human geo starting",
      "exam covers human geo half",
      "fascinated by population trends",
    ],
    weakness: [
      "case studies blur together",
      "push and pull factors confuse me",
      "demographic transition stages slip",
      "i can't connect data to theory",
    ],
    exercises: [
      "give 2 push factors for migration",
      "stage 4 of demographic transition: birth rate ___ , death rate ___",
      "name 2 features of urbanisation in megacities",
      "match: brain drain = ___ , chain migration = ___ (1-line definition each)",
      "approx % of world population that is urban?",
      "spot the human geo concept: 'people move to cities for jobs'",
    ],
    lastLessonTopics: [
      "migration patterns",
      "urbanisation",
      "demographic transition",
    ],
    closingTopics: [
      "push/pull factors",
      "demographic stages",
      "urbanisation drivers",
      "case study structure",
    ],
  },
  maps_data: {
    key: "maps_data",
    label: "Maps and data",
    framingHint: "math",
    tutorFocus: "Map skills, scale, projections, data interpretation",
    trialReason: [
      "GIS course needs map basics",
      "GCSE map work section",
      "want to read maps for hiking",
      "career into urban planning",
    ],
    weakness: [
      "i can't calculate scale fast",
      "projections all look the same",
      "data on graphs trips me up",
      "compass and bearings confuse me",
    ],
    exercises: [
      "scale 1:50000 - 2 cm on map = ___ km in real",
      "match: Mercator = ___ , Robinson = ___ (which preserves shape?)",
      "bearings: north = ___ deg, east = ___ , south = ___ , west = ___",
      "data: pop 100, area 50 km^2 - density?",
      "scale 1:25000 - 1 cm = ___ m",
      "graph type for showing percentages of a whole?",
    ],
    lastLessonTopics: [
      "scale calculation",
      "projection types",
      "data interpretation",
    ],
    closingTopics: [
      "scale conversions",
      "projection trade-offs",
      "bearings",
      "data readouts",
    ],
  },
};

// =============================================================================
// ART / MUSIC (4 sub-domains)
// =============================================================================

const ART_MUSIC_SUB_DOMAINS: Record<string, SubDomain> = {
  visual_art_drawing: {
    key: "visual_art_drawing",
    label: "Drawing fundamentals",
    framingHint: "generic",
    tutorFocus: "Drawing fundamentals - line, perspective, proportion, shading",
    trialReason: [
      "preparing portfolio for art school",
      "hobby getting serious, want fundamentals",
      "back to drawing after years",
      "self-taught, want structured practice",
    ],
    weakness: [
      "my proportions are off when i draw faces",
      "perspective makes no sense to me",
      "shading always looks flat",
      "hands and feet look weird",
    ],
    exercises: [
      "loomis head method: head = sphere + ___",
      "rule of thirds: divide into ___ x ___ grid",
      "1-point perspective: lines converge to ___ point(s)",
      "for a face, eyes are usually at ___ of head height",
      "shadow side has ___ value, light side has ___ value (light/dark)",
      "for hands, palm is usually ___ x finger length",
    ],
    lastLessonTopics: [
      "loomis head construction",
      "perspective basics",
      "value mapping",
    ],
    closingTopics: [
      "head proportions",
      "perspective rules",
      "value mapping",
      "anatomy basics",
    ],
  },
  visual_art_painting: {
    key: "visual_art_painting",
    label: "Painting basics",
    framingHint: "generic",
    tutorFocus: "Painting basics - color mixing, watercolor, oil, value",
    trialReason: [
      "watercolor hobby, want techniques",
      "oil painting class starting",
      "back to painting after long break",
      "art school portfolio prep",
    ],
    weakness: [
      "my color mixing always goes muddy",
      "watercolor blends never smooth",
      "i can't see values, everything looks the same",
      "edges always look harsh",
    ],
    exercises: [
      "complementary color of red is ___",
      "name 2 warm colors",
      "in 1 line: what does watercolor wet-on-wet mean?",
      "to lighten oil paint, mix with ___ (white or yellow?)",
      "high value = ___ (light or dark?)",
      "name 2 cool colors",
    ],
    lastLessonTopics: [
      "color theory basics",
      "watercolor blending",
      "value mapping",
    ],
    closingTopics: [
      "color mixing",
      "blending techniques",
      "value contrast",
      "edge control",
    ],
  },
  music_theory_basics: {
    key: "music_theory_basics",
    label: "Music theory basics",
    framingHint: "generic",
    tutorFocus: "Music theory - scales, intervals, chords, key signatures",
    trialReason: [
      "self-taught guitarist, want to learn theory",
      "music school audition prep",
      "songwriting hobby, want to compose",
      "back to piano needs theory refresh",
    ],
    weakness: [
      "key signatures all look the same",
      "intervals confuse me past the basics",
      "i can't build chords from scratch",
      "minor scales are tricky",
    ],
    exercises: [
      "C major scale notes: C, D, E, F, G, A, B, ___",
      "interval from C to E is a major ___ ?",
      "G major chord = G + ___ + ___",
      "relative minor of C major = ?",
      "interval from C to G is a perfect ___ ?",
      "key signature with 1 sharp = ___ major?",
    ],
    lastLessonTopics: [
      "major scales",
      "intervals",
      "triads",
    ],
    closingTopics: [
      "scale building",
      "interval recognition",
      "chord construction",
      "key signatures",
    ],
  },
  instrument_practice: {
    key: "instrument_practice",
    label: "Instrument practice",
    framingHint: "generic",
    tutorFocus: "Instrument technique - scales, sight-reading, technique practice",
    trialReason: [
      "exam grade 5 piano coming",
      "guitar hobby, want better technique",
      "violin lessons restarting",
      "audition prep for music school",
    ],
    weakness: [
      "my hand cramps after 10 mins",
      "i can play but reading sheet music is slow",
      "scales above 2 octaves break me",
      "rhythm patterns trip me up",
    ],
    exercises: [
      "rhythm: 4/4 with quarter, quarter, half - is this 1 measure?",
      "approx tempo of allegro in BPM range?",
      "fingering for D major scale on right hand: 1-2-3, then ___",
      "common time = ___ / ___ ?",
      "rhythm: dotted quarter = quarter + ___ ?",
      "name the 5 lines of the treble staff (bottom to top)",
    ],
    lastLessonTopics: [
      "C major scale fingering",
      "rhythm reading",
      "tempo markings",
    ],
    closingTopics: [
      "scale fingering",
      "rhythm patterns",
      "tempo markings",
      "sight-reading drills",
    ],
  },
};

// =============================================================================
// SUBJECTS — index of all sub-domains per subject
// =============================================================================

const SUBJECTS: Record<Subject, SubjectConfig> = {
  english_general: { subDomains: ENGLISH_GENERAL_SUB_DOMAINS },
  english_exam: { subDomains: ENGLISH_EXAM_SUB_DOMAINS },
  math: { subDomains: MATH_SUB_DOMAINS },
  biology: { subDomains: BIOLOGY_SUB_DOMAINS },
  chemistry: { subDomains: CHEMISTRY_SUB_DOMAINS },
  physics: { subDomains: PHYSICS_SUB_DOMAINS },
  history: { subDomains: HISTORY_SUB_DOMAINS },
  literature: { subDomains: LITERATURE_SUB_DOMAINS },
  computer_science: { subDomains: CS_SUB_DOMAINS },
  economics: { subDomains: ECONOMICS_SUB_DOMAINS },
  geography: { subDomains: GEOGRAPHY_SUB_DOMAINS },
  art_music: { subDomains: ART_MUSIC_SUB_DOMAINS },
};

function pickSubDomain(subject: Subject): SubDomain {
  const subDomains = Object.values(SUBJECTS[subject].subDomains);
  return pick(subDomains);
}

// =============================================================================
// SCENARIO TYPES + BUILDERS
// =============================================================================

export type TrialScenario = {
  tutorName: string;
  tutorYears: number;
  tutorFocus: string;
  tutorVibe: string;
  studentName: string;
  studentProfession: string;
  studentVibe: string;
  trialReason: string;
  weakness: string;
  exerciseTopics: string[];
  /** Locked sub-domain for coherence. */
  subDomain: SubDomain;
};

export type Session2Scenario = {
  studentName: string;
  studentProfession: string;
  studentVibe: string;
  tutorVibe: string;
  lastLessonTopic: string;
  homeworkStatus: string;
  weakness: string;
  exerciseTopics: string[];
  subDomain: SubDomain;
};

export function buildTrialScenario(subject: Subject): TrialScenario {
  const sub = pickSubDomain(subject);
  const n = EXERCISE_COUNT[SUBJECT_GROUP[subject]];
  return {
    tutorName: pick(TUTOR_NAMES),
    tutorYears: pick(TUTOR_YEARS),
    tutorFocus: sub.tutorFocus,
    tutorVibe: pick(TUTOR_VIBES),
    studentName: pick(STUDENT_NAMES),
    studentProfession: pick(STUDENT_PROFESSIONS),
    studentVibe: pick(STUDENT_VIBES),
    trialReason: pick(sub.trialReason),
    weakness: pick(sub.weakness),
    exerciseTopics: pickN(sub.exercises, n),
    subDomain: sub,
  };
}

export function buildSession2Scenario(subject: Subject): Session2Scenario {
  const sub = pickSubDomain(subject);
  const n = EXERCISE_COUNT[SUBJECT_GROUP[subject]];
  return {
    studentName: pick(STUDENT_NAMES),
    studentProfession: pick(STUDENT_PROFESSIONS),
    studentVibe: pick(STUDENT_VIBES),
    tutorVibe: pick(TUTOR_VIBES),
    lastLessonTopic: pick(sub.lastLessonTopics),
    homeworkStatus: pick(HOMEWORK_STATUSES),
    weakness: pick(sub.weakness),
    exerciseTopics: pickN(sub.exercises, n),
    subDomain: sub,
  };
}

export function trialScenarioCard(s: TrialScenario): string {
  return [
    "SCENARIO CARD - use these EXACT details, do NOT invent your own:",
    `- Sub-domain (LOCK every field below to this): ${s.subDomain.label}`,
    `- Tutor name: ${s.tutorName}`,
    `- Tutor experience: ${s.tutorYears} years`,
    `- Tutor focus / who they teach: ${s.tutorFocus}`,
    `- Tutor vibe: ${s.tutorVibe}`,
    `- Student name: ${s.studentName}`,
    `- Student job/role: ${s.studentProfession}`,
    `- Student vibe: ${s.studentVibe}`,
    `- Why student is learning: ${s.trialReason}`,
    `- Student's weakness (in their OWN casual words, NOT technical): "${s.weakness}"`,
    `- Exercises - pick all of them, paste each as-is or near-as-is into chat:`,
    ...s.exerciseTopics.map((e) => `    • ${e}`),
    "",
    "Names verbatim. Weakness phrasing verbatim or near-verbatim. The whole thread stays in the sub-domain - tutor never references content outside it.",
  ].join("\n");
}

export function session2ScenarioCard(s: Session2Scenario): string {
  return [
    "SCENARIO CARD - use these EXACT details, do NOT invent your own:",
    `- Sub-domain (LOCK every field below to this): ${s.subDomain.label}`,
    `- Student name: ${s.studentName} (returning student, NO self-intro)`,
    `- Student job context: ${s.studentProfession}`,
    `- Student vibe: ${s.studentVibe}`,
    `- Tutor vibe: ${s.tutorVibe}`,
    `- Last lesson covered: ${s.lastLessonTopic}`,
    `- Homework status (what student types verbatim): "${s.homeworkStatus}"`,
    `- Student's weakness rn: "${s.weakness}"`,
    `- Exercises - pick all of them, paste each as-is or near-as-is into chat:`,
    ...s.exerciseTopics.map((e) => `    • ${e}`),
    "",
    "Tutor opens with the homework check. Student replies with the EXACT homework status. Whole thread stays in the sub-domain.",
  ].join("\n");
}
