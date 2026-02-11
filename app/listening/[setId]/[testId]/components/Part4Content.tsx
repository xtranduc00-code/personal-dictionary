"use client";
import { memo } from "react";
import type { Part4NotesContentData, Part4ContentData } from "@/lib/listening-part-content";
import { HighlightableSegment } from "./HighlightContext";
import { GenericPartContent } from "./GenericPartContent";
import { parseNotesSection } from "@/lib/listening-notes-schema";
import { NotesStructuredRenderer } from "./shared/NotesStructuredRenderer";
import { QBadge } from "./shared/QBadge";
import { InstructionSubBold } from "./shared/InstructionSubBold";
import { QuestionBlockHeading } from "./shared/QuestionBlockHeading";
import { SingleChoiceSection } from "./shared/SingleChoiceSection";
import { inputClass, listeningSectionCardClass, notesTitleCenteredClass, } from "./shared/questionStyles";
type Props = {
    answers: Record<number, string>;
    updateAnswer: (qNum: number, value: string) => void;
    isCorrect: (qNum: number) => boolean | null;
    submitted: boolean;
    segmentIdPrefix: string;
    content?: Part4NotesContentData | Part4ContentData | null;
    getCorrectAnswerText?: (qNum: number) => string | null;
};
function isPart4ContentData(c: Props["content"]): c is Part4ContentData {
    return c != null && typeof c === "object" && "singleChoice" in c && "notes" in c;
}
function isNotesContent(c: Props["content"]): c is Part4NotesContentData {
    return c != null && typeof c === "object" && "sections" in c && !("singleChoice" in c);
}
function Part4ContentInner({ answers, updateAnswer, isCorrect, submitted, segmentIdPrefix, content, getCorrectAnswerText, }: Props) {
    const seg = (path: string) => `${segmentIdPrefix}-${path}`;
    const cellProps = {
        answers,
        updateAnswer,
        isCorrect,
        submitted,
        getCorrectAnswerText,
    };
    if (!content) {
        return (<GenericPartContent partNumber={4} answers={answers} updateAnswer={updateAnswer} isCorrect={isCorrect} submitted={submitted} segmentIdPrefix={segmentIdPrefix} getCorrectAnswerText={getCorrectAnswerText}/>);
    }
    if (isPart4ContentData(content)) {
        const { singleChoice, notes } = content;
        const scMin = Math.min(...singleChoice.questions.map((q) => q.qNum));
        const scMax = Math.max(...singleChoice.questions.map((q) => q.qNum));
        const notesBlanks = notes.sections.flatMap((s) => s.content.map((p) => ("blank" in p ? p.blank : null)).filter((n): n is number => n !== null && n < 99));
        const notesMin = notesBlanks.length > 0 ? Math.min(...notesBlanks) : 34;
        const notesMax = notesBlanks.length > 0 ? Math.max(...notesBlanks) : 40;
        return (<>
        <QuestionBlockHeading startQ={scMin} endQ={scMax} className="mt-4">
          <div className="space-y-1.5 text-base text-zinc-800 dark:text-zinc-200">
            <p className="font-semibold">
              <HighlightableSegment id={seg("single-inst")}>{singleChoice.instruction}</HighlightableSegment>
            </p>
          </div>
          <SingleChoiceSection instruction={singleChoice.instruction} questions={singleChoice.questions} segmentIdPrefix={seg("single")} answers={answers} updateAnswer={updateAnswer} isCorrect={isCorrect} submitted={submitted} radioNamePrefix="p4" getCorrectAnswerText={getCorrectAnswerText} instructionOutside title={singleChoice.title} titleSegmentId={seg("single-title")}/>
        </QuestionBlockHeading>

        <QuestionBlockHeading startQ={notesMin} endQ={notesMax} className="mt-8">
          <div className="space-y-1.5 text-base text-zinc-800 dark:text-zinc-200">
            <p className="font-semibold">
              <HighlightableSegment id={seg("notes-inst")}>{notes.instruction}</HighlightableSegment>
            </p>
            <p className="text-zinc-700 dark:text-zinc-300">
              <InstructionSubBold text={notes.instructionSub}/>
            </p>
          </div>
          <section className={`mt-3 ${listeningSectionCardClass} px-5 py-3`}>
            {notes.title && (<p className={`${notesTitleCenteredClass} mb-2`}>
                <HighlightableSegment id={seg("notes-title")}>{notes.title}</HighlightableSegment>
              </p>)}
            {(function () {
                const parsedSections = notes.sections.map((section) => {
                    const normalizedContent = section.content.map((part) => {
                        if (!("text" in part) || typeof part.text !== "string")
                            return part;
                        const t = part.text.replace(/^\n+/, "").replace(/\n{2,}/g, "\n");
                        return { ...part, text: t };
                    });
                    return parseNotesSection(normalizedContent, {
                        sectionTitle: section.title,
                        keepDashBullet: true,
                    });
                });
                return parsedSections.map((section, i) => (<div key={i} className={i > 0 ? "mt-3 border-t border-zinc-200 pt-2 dark:border-zinc-700" : ""}>
                  <NotesStructuredRenderer section={section} sectionIndex={i} segmentIdPrefix={seg(`notes-sec-${i}`)} isFirstSection={i === 0} {...cellProps} defaultWidth="min-w-[6.5rem]" badgeVariant="outline"/>
                </div>));
            })()}
          </section>
        </QuestionBlockHeading>
      </>);
    }
    if (isNotesContent(content)) {
        const blanks = content.sections.flatMap((s) => s.content.map((p) => ("blank" in p ? p.blank : null)).filter((n): n is number => n !== null && n < 99));
        const minQ = blanks.length > 0 ? Math.min(...blanks) : 31;
        const maxQ = blanks.length > 0 ? Math.max(...blanks) : 40;
        return (<QuestionBlockHeading startQ={minQ} endQ={maxQ} className="mt-4">
        <div className="space-y-1.5 text-base text-zinc-800 dark:text-zinc-200">
          <p className="font-semibold">
            <HighlightableSegment id={seg("inst1")}>
              {content.instruction}
            </HighlightableSegment>
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            <InstructionSubBold text={content.instructionSub}/>
          </p>
        </div>

        <section className={`mt-3 ${listeningSectionCardClass} px-5 py-3`}>
          {content.title != null && content.title !== "" && (<p className={`${notesTitleCenteredClass} mb-2`}>
              <HighlightableSegment id={seg("title")}>{content.title}</HighlightableSegment>
            </p>)}
          {(function () {
                const parsedSections = content.sections.map((section) => {
                    const normalizedContent = section.content.map((part) => {
                        if (!("text" in part) || typeof part.text !== "string")
                            return part;
                        const t = part.text.replace(/^\n+/, "").replace(/\n{2,}/g, "\n");
                        return { ...part, text: t };
                    });
                    return parseNotesSection(normalizedContent, {
                        sectionTitle: section.title,
                        keepDashBullet: true,
                    });
                });
                return parsedSections.map((section, i) => (<div key={i} className={i > 0 ? "mt-3 border-t border-zinc-200 pt-2 dark:border-zinc-700" : ""}>
                <NotesStructuredRenderer section={section} sectionIndex={i} segmentIdPrefix={seg(`sec-${i}`)} isFirstSection={i === 0} {...cellProps} defaultWidth="min-w-[6.5rem]" badgeVariant="outline"/>
              </div>));
            })()}
        </section>
      </QuestionBlockHeading>);
    }
    return (<GenericPartContent partNumber={4} answers={answers} updateAnswer={updateAnswer} isCorrect={isCorrect} submitted={submitted} segmentIdPrefix={segmentIdPrefix} getCorrectAnswerText={getCorrectAnswerText}/>);
}
export const Part4Content = memo(Part4ContentInner);
