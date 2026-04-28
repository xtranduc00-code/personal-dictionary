/**
 * Pre-trial pair pool — pure random-pick from human-written templates.
 *
 * Two-layer student pool:
 *   - GENERIC: ~58 logistics concerns that apply to any subject (timezone,
 *     prep, wifi, reschedule, etc.)
 *   - BY_SUBJECT: 6 subject-specific concerns per subject — flavor that only
 *     fits that subject (e.g. "balancing equations" for chemistry, "free-body
 *     diagrams" for physics)
 *
 * On pick: 60% chance generic, 40% chance subject-specific.
 *
 * Reality: Preply pre-trial concerns are ~60% logistics, ~40% subject-flavored,
 * so the 60/40 split matches what real users send.
 */

import type { Subject } from "@/lib/preply-chat-scenario";

const pick = <T,>(arr: readonly T[]): T =>
  arr[Math.floor(Math.random() * arr.length)]!;

/**
 * 30 tutor welcome messages — semi-templated "thanks for booking + what to
 * expect" style real Preply tutors send. Subject-agnostic. Em dashes / "!" are
 * normal in human-written formal welcomes and not an AI tell.
 */
export const TUTOR_WELCOME_TEMPLATES: readonly string[] = [
  "Hi,\nThank you for booking a trial lesson with me! What can you expect from our first lesson? I'll assess your level and get a better understanding of your needs, demonstrate my teaching style and develop a personalized learning plan for you. See you soon.",
  "Hello,\nThanks for scheduling a trial class! In our first session, I'll evaluate where you are, learn more about your goals, show you how I teach, and outline a study plan tailored to you. Looking forward to meeting you.",
  "Hi there,\nI'm glad you booked a trial lesson. We'll start by checking your level and what you want to achieve, you'll see how my lessons work, and we'll sketch a personalized roadmap together. See you in class!",
  "Thank you for choosing a trial lesson with me. First lesson: quick level check, discussion of your needs, a sample of my teaching approach, and a custom plan so you know what comes next. Can't wait!",
  "Hi!\nYou've booked a trial with me — great. Expect an informal assessment, clarity on your goals, a taste of my teaching style, and a learning plan built around you. See you soon.",
  "Thanks for your trial booking. Our first meeting will cover your current level, priorities, how I structure lessons, and next steps in a plan made for you. Excited to get started.",
  "Hello and thank you for the trial lesson reservation. I'll gauge your proficiency, listen to what you need, demonstrate my method, and propose a personalized path forward. See you then.",
  "Hi,\nWelcome — your trial lesson is confirmed. We'll assess your skills, align on objectives, experience a short sample of my teaching, and agree on a tailored plan. Talk soon!",
  "Thank you for booking a trial. In session one I assess your level, understand your context, show my teaching style in action, and draft a learning plan that fits you. See you!",
  "Hi there,\nAppreciate you signing up for a trial. Expect: level evaluation, needs conversation, teaching demo, and a personalized roadmap so every following lesson counts. See you soon.",
  "Good morning,\nYour trial slot is saved on my calendar. In our first lesson we'll map your goals, run a friendly skills check, and agree on how we can work together week to week. I'm looking forward to meeting you.",
  "Hi!\nThanks for reserving a trial with me. We'll keep the first session practical: a short diagnostic, a realistic mini-task, and clear recommendations so you know what progress could look like. Speak soon.",
  "Hello,\nI'm pleased you booked a trial lesson. We'll clarify your priorities, review strengths and gaps, and you'll get a feel for how feedback and practice fit into my lessons. See you at the scheduled time.",
  "Hi there,\nTrial confirmed! First meeting is about understanding you: your background, your targets, and the habits that will help you improve fastest. I'll also show you what a 'normal' lesson looks like with me.",
  "Thank you for booking a trial.\nI'll use the first session to listen carefully to how you communicate now, then suggest a simple plan with milestones you can actually sustain. Excited to begin.",
  "Hi,\nGreat to see a trial on the schedule. We'll balance conversation with targeted practice so you can feel progress without overwhelm — and we'll end with a clear idea of what to focus on next.",
  "Hello and thanks for choosing a trial lesson.\nWe'll start with a warm-up chat, then a few focused tasks so I can see how you handle the subject in context. Then we'll talk next steps.",
  "Hi!\nYour trial is booked. Expect a supportive first lesson: I'll ask about your goals, observe how you work under light pressure, and suggest a routine that matches your schedule and motivation.",
  "Thanks for scheduling a trial with me.\nI'll keep the session structured but relaxed: goals, quick assessment, a sample activity, and a roadmap you can follow whether you continue with me or study independently for a while.",
  "Hi there,\nLooking forward to our trial lesson. We'll identify what 'success' means for you, check your current comfort level, and try one exercise that matches your main objective.",
  "Hello,\nTrial lesson locked in. I'll assess your skills in a natural way, explain how I give corrections and homework, and outline a weekly rhythm that fits your lifestyle. See you soon.",
  "Hi,\nAppreciate your trial booking. Our first meeting will help us both decide if we're a good match: you'll experience my teaching, and I'll understand the support you need to reach your goals confidently.",
  "Thank you for booking a trial session.\nWe'll spend a few minutes on logistics and goals, then move into activities that show how you process the material in real time. I'll finish with concrete suggestions tailored to you.",
  "Hi!\nYour trial is on my calendar. Expect a friendly diagnostic, clear explanations when something is tricky, and a plan that respects both ambition and realism — consistency beats intensity every time.",
  "Hello,\nThanks for trusting me with a trial lesson. I'll combine conversation with targeted feedback so you can see how small adjustments quickly make a difference.",
  "Hi there,\nTrial confirmed — wonderful. We'll explore what you already do well, what slows you down, and what practice style keeps you motivated. Then we'll align on a direction that feels doable.",
  "Good afternoon,\nI'm glad you booked a trial. First lesson: we'll clarify outcomes, run a short skills snapshot, and discuss how accountability and review can help you improve without burning out.",
  "Hi,\nThanks for signing up for a trial. I'll show you how I blend explanation with practice, and we'll co-create a mini-plan so you leave the session knowing exactly what to work on first.",
  "Hello,\nYour trial lesson reservation is all set. We'll talk about your timeline, your biggest frustrations, and the habits that will help you improve steadily — not just during class, but between classes too.",
  "Hi!\nLooking forward to meeting you for the trial. We'll keep energy high and pressure low: a few questions, a short task, and honest feedback — plus a roadmap that matches your real life, not an imaginary perfect schedule.",
];

/**
 * 58 GENERIC student concerns — apply to any subject. Logistics, scheduling,
 * platform, learning preferences. No subject-specific terminology.
 *
 * Coverage (13 generic concern types):
 *   timezone (5) · prep (5) · platform/wifi (5) · beginner shyness (5)
 *   reschedule (5) · correction style (5) · materials (4) · after-trial (5)
 *   level check format (4) · audio test (4) · use case (4) · camera/video (4)
 *   running late (3)
 */
const STUDENT_CONCERN_GENERIC: readonly string[] = [
  // timezone (5)
  "Hi, thanks for the message. Quick question, is the trial time in your timezone or mine? I'm in Vietnam and want to make sure I don't miss it.",
  "Hi! Just checking, is 6pm your local time or mine? I'm in a different timezone and don't want to mix it up.",
  "Hello, sorry for the basic question. The booked time, is that converted to my timezone automatically or should I do the math myself?",
  "Hi, thanks. Could you confirm what time the trial is in UTC? I travel between two timezones and that's the easiest reference for me.",
  "Hi, quick one. My profile location is from when I was abroad. The trial time, is it based on my current timezone or the one in my profile?",

  // prep (5)
  "Hi, thanks. Should I prepare anything specific before the trial, or is just showing up enough?",
  "Hi! Quick question, do you usually want students to bring something (notebook, list of questions, anything written) for the trial?",
  "Hello, I wanted to ask if there's anything you'd like me to review beforehand. I have a bit of time this weekend.",
  "Hi, thanks for the message. Is there a short questionnaire or anything you'd like me to fill out before our session?",
  "Hi, do I need to install anything or set up an account somewhere, or is it all in the platform itself?",

  // platform / wifi / device (5)
  "Hi, thanks. Will we use the platform's built-in video, or do I need Zoom, Google Meet, or anything else?",
  "Hi! My laptop's webcam is iffy. Can I join from my phone instead, or does that limit anything?",
  "Hello, quick check. Is the lesson on desktop browser, app, or either? My work laptop has restrictions on app installs.",
  "Hi, my wifi can be unstable when it rains here. What's the usual approach if it cuts out mid-lesson?",
  "Hi, sorry to ask. Does the platform work fine on Safari, or do you recommend Chrome? I usually use Safari.",

  // beginner / shyness (5)
  "Hi. Honestly I'm a complete beginner and I get a bit shy when I make mistakes. Hope that's ok. I mostly want to feel more comfortable in everyday situations.",
  "Hi, thank you. Just wanted to flag that I'm pretty much starting from zero and I've never had a private lesson before. Please go easy on me at first.",
  "Hello, I should mention I haven't studied formally in a long time and I forget things under pressure. Hope we can keep it relaxed for the first lesson.",
  "Hi! Just a heads up, I'm super self-conscious about speaking out loud. If we can do more written stuff or quieter practice in the trial, that would help.",
  "Hi, thanks for the welcome. I'm nervous about the level check. Is it ok if I freeze a bit at the start? I usually warm up after 10-15 minutes.",

  // reschedule / cancel (5)
  "Hi, thanks. One quick thing, what's your reschedule policy if something work-related comes up? I have on-call weeks sometimes.",
  "Hi! How much notice do you need if I have to move the trial? My schedule can shift on short notice with kids.",
  "Hello, I just wanted to ask. If I need to cancel and rebook, is there a fee? I'd rather know upfront.",
  "Hi, do you offer a free reschedule once, or is it tracked strictly? I'll do my best to keep the time but life happens sometimes.",
  "Hi, thanks for booking. If I run into a clash on the day, is messaging you on the platform fine, or is there a separate cancel button I should use?",

  // correction style (5)
  "Hi, thanks. One question, do you usually correct mistakes as I work, or save them for the end? I learn better with quick corrections but happy to adapt.",
  "Hi! Quick ask, do you write corrections in the chat as we go, or summarize them after? Just so I know whether to keep an eye on the chat box.",
  "Hello, I learn fastest when someone calls out my mistakes immediately. Is that your style, or do you prefer to let students finish their thought first?",
  "Hi, do you correct multiple things at once, or focus on one type of issue at a time? I tend to overload if everything comes at once.",
  "Hi, thank you. Just curious about feedback style, gentle and indirect, or direct and fast? I respond well to direct, just wanted to mention it.",

  // materials (4)
  "Hi, thanks. Do you usually use a textbook, or do you create your own materials? I want to know if I should buy anything before the trial.",
  "Hi! Quick question, will you send PDFs or worksheets after lessons, or is it all done live? I like having something to review later.",
  "Hello, I wanted to ask if you have a recommended textbook or course outline I can look at. Mainly to see your approach before the trial.",
  "Hi, do you usually share notes after each session, or do you expect students to take their own? Both are fine, just want to know how to prepare.",

  // after-trial / continuation (5)
  "Hi, thanks. Just curious, what happens after the trial if I'd like to continue? Do you offer packages, weekly slots, or pay-as-you-go?",
  "Hi! If we click after the trial, how do you usually book ongoing lessons? Same time each week, or is it flexible?",
  "Hello, I wanted to ask about pricing for regular lessons. I noticed the trial price but couldn't find the standard rate clearly.",
  "Hi, sorry if this is too soon, but do you have a discount for booking 5 or 10 lessons upfront? Just trying to plan my budget.",
  "Hi, thanks for the booking. After the trial, do we discuss next steps in the lesson itself, or do you message later? Just want to know what to expect.",

  // level check format (4)
  "Hi, quick question about the level check. Is it like a formal test, or more of a conversation with a few tasks? Tests make me nervous.",
  "Hi! How do you usually figure out my level? I've been told I'm intermediate but I really don't trust that anymore.",
  "Hello, I wanted to ask. Do you do the level check at the start of the trial, or scattered throughout? Just so I can mentally prepare.",
  "Hi, thanks. Is the level check graded or is it just for your reference? I'm asking because I might focus differently if it counts.",

  // audio / mic test (4)
  "Hi, would it be ok to do a quick audio test 5 minutes before the trial? I just got a new headset and want to make sure it works.",
  "Hi! My mic has been cutting out lately. Can I send you a test message in the platform a day before the lesson to check?",
  "Hello, I'd like to do a brief tech check before we start. Is there a way to test the connection on the platform without using lesson time?",
  "Hi, thanks. Quick one, if my audio sounds off at the start, can we troubleshoot together briefly, or should I sort it out before the lesson?",

  // specific use case (4)
  "Hi, thanks. I wanted to mention upfront, I'm using this mostly for work calls with international clients. Is that a context you've taught before?",
  "Hi! Heads up, I have a job interview coming up in 6 weeks and that's my real goal. Can we shape lessons around interview prep over time?",
  "Hello, I'm preparing to relocate abroad in a few months. Most of my goals are around daily life over there, restaurants, banks, doctor visits, that sort of thing.",
  "Hi, just so you know, I mostly need this for travel. I'm not aiming for an advanced level, just enough to navigate trips comfortably.",

  // camera / video (4)
  "Hi, quick check, is having my camera on required? I'd prefer to keep it off at first until I'm more comfortable.",
  "Hi! Just wanted to ask, can I do the trial audio-only? I'm in a shared space and don't want my background showing.",
  "Hello, I prefer cameras off generally. Is that a dealbreaker, or do most of your students do video?",
  "Hi, thanks. Camera on is fine, but I might sit slightly off-center because of my desk setup. Hope that's not weird.",

  // running late (3)
  "Hi, thanks. Quick logistics question, if I'm running 5 minutes late from a meeting, should I message you on the platform or just join when I can?",
  "Hi! How strict is the start time? My job sometimes overruns by a couple of minutes and I worry about losing trial time.",
  "Hello, just wanted to ask, what's the best way to let you know if I'm late? I'd rather you know than wonder.",
];

/**
 * 6 subject-specific concerns per subject. Topic flavor that only fits that
 * subject — e.g. "balancing equations" for chemistry, "free-body diagrams"
 * for physics.
 */
const STUDENT_CONCERN_BY_SUBJECT: Record<Subject, readonly string[]> = {
  english_general: [
    "Hi, just wanted to flag that i get shy speaking out loud in English. Im fine reading but speaking on the spot makes me freeze. Hope thats ok.",
    "Hello, quick thing. My accent is a weird mix of US and UK from different teachers over the years. Should i settle on one, or is mixing fine?",
    "Hi, thanks. Pronunciation is my weak spot. People sometimes ask me to repeat myself and i dont always know which sounds to fix.",
    "Hi! Ive been told my stress patterns sound flat. Is that something we can work on, or is it usually for later sessions?",
    "Hi, quick context. I mainly need English for daily life stuff, restaurants, hotels, small talk while traveling. Hope thats specific enough.",
    "Hi, thanks for the message. Just so you know, ive plateaued at intermediate for years. Curious if you usually have a method for getting unstuck.",
  ],
  english_exam: [
    "Hi, im prepping for IELTS in March. Aiming for 7.0 overall. Is that timeline realistic if we start now, or should i adjust expectations?",
    "Hello, my weakest section is writing task 2. I keep getting band 6 and cant figure out what to fix. Is that something you focus on?",
    "Hi, ive taken IELTS twice already, last score was 6.5. Want to get to 7.5 for visa application. Whats your usual approach for repeat candidates?",
    "Hi! Quick question, do you cover speaking part 2 specifically? Thats where i blank out, the long turn freaks me out.",
    "Hi, thanks. Im taking TOEFL not IELTS. Most tutors here teach IELTS so i wanted to check, are you familiar with the TOEFL format?",
    "Hello, my exam is in 6 weeks and im behind. Honestly i havent prepped much. Can we focus on highest-impact areas first, or is that not how this works?",
  ],
  math: [
    "Hi, im rusty on basics, especially algebra. Should i tell you which topics ive been struggling with before the trial, or do you check that during the lesson?",
    "Hello, quick question, do you cover word problems too? Thats where i always lose marks. The math itself is fine but translating from words trips me up.",
    "Hi, just wanted to ask, is calculator allowed in your trial format? Im used to having one at school but want to make sure i practice the right way.",
    "Hi! Im prepping for SAT math in 3 months. Mainly need help with the harder algebra and geometry questions. Is that something you cover?",
    "Hi, thanks. Im an adult learner getting back into math after 15 years. Probably need to start very basic. Hope thats ok with you.",
    "Hello, calculus is what im stuck on, specifically integration. Ive watched tons of YouTube but it doesnt click. Does that sound like something we can work on?",
  ],
  biology: [
    "Hi, my biggest issue is memorizing all the terminology in English. Im a non-native speaker and the names blur. Any tricks for that?",
    "Hello, quick question, do you focus more on theory or do you incorporate labs and diagrams? Im a visual learner.",
    "Hi, im prepping for the MCAT cell bio section. Thats my weakest area. Curious if you have experience with med school admissions content.",
    "Hi! High school finals coming up and i still confuse mitosis vs meiosis stages. Hoping that one finally clicks with a tutor.",
    "Hi, thanks. Genetics is what i need help with. Punnett squares confuse me when there are multiple traits. Should i prep anything specific?",
    "Hello, im honest about my level, im weak on anatomy and the Latin names. Hope we can start with that even if its basic.",
  ],
  chemistry: [
    "Hi, my main struggle is balancing equations, especially with polyatomic ions. Ive tried several methods online and got more confused. Any tips?",
    "Hello, quick question, do you cover lab safety and procedures, or just theory? My school exam has a practical section.",
    "Hi, thanks. Honestly im weak at unit conversions. Moles vs grams keeps tripping me up. Should we start there or do you check first?",
    "Hi! Im prepping for AP Chemistry. Organic chemistry section especially. Is that an area you teach often?",
    "Hi, periodic table memorization is killing me. Are there specific patterns you teach or is it just brute force memorization?",
    "Hello, redox reactions are my weak spot, specifically tracking electrons. Ive read the textbook but it doesnt stick. Hope we can dig into that.",
  ],
  physics: [
    "Hi, im worried because my math is rusty. Will that hold us back, or do you cover the math along the way?",
    "Hello, free-body diagrams confuse me. I always forget normal force or get directions wrong. Hoping that finally clicks.",
    "Hi, thanks. Mechanics is my weakest area, specifically problems with friction and inclined planes. Is that ok to focus on?",
    "Hi! Quick question, do you teach more conceptual or formula-based? I tend to memorize formulas without understanding, so i want to fix that.",
    "Hi, im prepping for IB Physics HL exam. The waves and optics section is what i need most help with. Is that an area you teach?",
    "Hello, im an adult coming back to physics after years. Probably need to relearn kinematics from scratch. Hope thats ok to start there.",
  ],
  history: [
    "Hi, my issue is essay writing, not facts. I know the events but my essays score low. Do you help with structure too?",
    "Hello, im prepping for AP World History. Thesis statements are my weak spot. Any specific approach you use?",
    "Hi, thanks. Source analysis is what i struggle with. I can describe a source but not analyze it. Hoping that finally clicks.",
    "Hi! Quick question, do you cover specific periods or general approach? Im studying 20th century European history right now.",
    "Hi, just wanted to flag, i quote way too much instead of paraphrasing. My teacher always points it out. Hoping you can help me fix that habit.",
    "Hello, im weak on connecting events into a clear narrative. I memorize dates but cant write a strong argument. Is that something we can work on?",
  ],
  literature: [
    "Hi, im studying Shakespeare for my exam, specifically Hamlet. Any chance you cover that, or do you focus on more modern texts?",
    "Hello, my issue is poetry analysis. I can describe what a poem says but not the deeper meaning. Hoping you can help.",
    "Hi, thanks. English isnt my native language and i miss subtle themes in novels. Is that ok, or should i pick a tutor who teaches in my language?",
    "Hi! Quick question, do you teach essay writing for literature, or just discussion? I need help structuring arguments.",
    "Hi, irony is what i struggle with. I literally cant tell when something is ironic vs literal. Embarrassing but true.",
    "Hello, im preparing for IB English literature paper 2. Need help with comparative essays specifically. Is that an area you cover?",
  ],
  computer_science: [
    "Hi, just wanted to ask if you prefer Python or JavaScript for the trial. Ive been learning Python but most online resources use JS, kinda confused which to focus on.",
    "Hello, do i need to set up VSCode or any IDE before the trial, or do we just talk through the concepts? Im on a Mac if that matters.",
    "Hi, thanks. Im a self-taught dev struggling with algorithms and data structures. Specifically recursion. Is that something you can help with?",
    "Hi! Im prepping for tech interviews in 2 months. LeetCode mediums break me. Hoping to pattern-match better with a tutor.",
    "Hi, debugging is my weak spot. I can write code that almost works but i panic when errors come up. Curious how you teach that.",
    "Hello, do you teach more theory like Big O or hands-on projects? Im a visual learner who needs to build to understand.",
  ],
  economics: [
    "Hi, im worried about the math in econ, especially derivatives in micro. Hoping you can break that down, im not a math person.",
    "Hello, real-world examples help me a lot. Do you usually tie concepts to current events, or stick to textbook?",
    "Hi, thanks. Im prepping for AP Macro. The graphs trip me up, especially shifts vs movements along curves. Any tips?",
    "Hi! Quick question, do you cover behavioral econ at all? Or is it strictly traditional micro and macro?",
    "Hi, im an MBA student needing a refresher on intermediate micro. Specifically game theory. Is that something you teach?",
    "Hello, elasticity formulas always slip from my head during exams. I get them in homework but blank during tests. Hoping for a memorization trick.",
  ],
  geography: [
    "Hi, contour lines and topographic maps confuse me. Im a visual learner but somehow these dont click. Hoping that finally lands.",
    "Hello, do you teach more physical or human geography? Im stronger on physical but my exam covers both.",
    "Hi, thanks. Climate patterns are what im weak on, specifically how altitude and ocean currents interact. Big topic in my exam.",
    "Hi! Im prepping for GCSE geography. Case studies are killing me, i confuse the details across regions. Any way to organize them?",
    "Hi, just wanted to flag, im a non-native speaker and the geography vocabulary in English is dense. Hope we can go slow on terminology.",
    "Hello, exam format question. Do you help with the data response questions specifically? Thats where i lose the most marks.",
  ],
  art_music: [
    "Hi, im an adult beginner picking up piano after 15 years away. Mainly want to play casually, not exam-level. Hope thats your kind of student.",
    "Hello, quick question, do you teach music theory alongside playing, or focus on technique? Im a self-taught guitarist who never learned theory.",
    "Hi, thanks. Im preparing a portfolio for art school. Mainly need feedback on figure drawing. Is that something you cover?",
    "Hi! Performance anxiety is real. I can play fine alone but freeze when someone listens. Hoping a tutor environment helps me get past that.",
    "Hi, im learning watercolor and my blends always look muddy. Ive watched tutorials but the texture doesnt match. Does that sound like something we can work on?",
    "Hello, my hand cramps after 10 minutes of piano. Probably technique issue. Curious if thats something you check on first.",
  ],
};

/** Fraction of picks that come from the subject-specific pool (vs generic). */
const SUBJECT_SPECIFIC_RATE = 0.4;

export function pickPretrialPair(subject: Subject): {
  teacher: string;
  student: string;
} {
  const useSubjectPool = Math.random() < SUBJECT_SPECIFIC_RATE;
  const student = useSubjectPool
    ? pick(STUDENT_CONCERN_BY_SUBJECT[subject])
    : pick(STUDENT_CONCERN_GENERIC);
  return {
    teacher: pick(TUTOR_WELCOME_TEMPLATES),
    student,
  };
}
