"use client";
import React, { memo } from "react";
import type { Part3ContentData } from "@/lib/listening-part-content";
import { HighlightableSegment } from "./HighlightContext";
import { GenericPartContent } from "./GenericPartContent";
import { ChooseTwoSection } from "./shared/ChooseTwoSection";
import { SingleChoiceSection } from "./shared/SingleChoiceSection";
import { MatchingSection } from "./shared/MatchingSection";
import { NotesCellParts } from "./shared/NotesCellParts";
import { InstructionSubBold } from "./shared/InstructionSubBold";
import { QuestionBlockHeading } from "./shared/QuestionBlockHeading";
import { listeningSectionCardClass, notesContentClass, notesSectionGapClass, notesSubtitleClass, notesTitleCenteredClass } from "./shared/questionStyles";
type Props = {
    answers: Record<number, string>;
    updateAnswer: (qNum: number, value: string) => void;
    isCorrect: (qNum: number) => boolean | null;
    submitted: boolean;
    getChooseTwoSelection: (primaryQ: number, secondaryQ?: number) => string[];
    toggleChooseTwo: (primaryQ: number, secondaryQ: number, letter: string) => void;
    segmentIdPrefix: string;
    content?: Part3ContentData | null;
    getCorrectAnswerText?: (qNum: number) => string | null;
};
function Part3ContentInner(props: Props) {
    const { answers, updateAnswer, isCorrect, submitted, segmentIdPrefix, content, getCorrectAnswerText } = props;
    const seg = (path: string) => `${segmentIdPrefix}-${path}`;
    if (!content) {
        return (<GenericPartContent partNumber={3} answers={answers} updateAnswer={updateAnswer} isCorrect={isCorrect} submitted={submitted} segmentIdPrefix={segmentIdPrefix} getCorrectAnswerText={getCorrectAnswerText}/>);
    }
    const { chooseTwoBlocks, singleChoice, matching, notesCompletion } = content;
    const cellProps = { answers, updateAnswer, isCorrect, submitted, getCorrectAnswerText };
    const notesBlanks = (notes: typeof notesCompletion) => notes
        ? notes.sections.flatMap((s) => s.content.map((p) => ("blank" in p ? p.blank : null)).filter((n): n is number => n !== null && n < 99))
        : [];
    const minFromNotes = (notes: typeof notesCompletion) => {
        const b = notesBlanks(notes);
        return b.length === 0 ? 99 : Math.min(...b);
    };
    const maxFromNotes = (notes: typeof notesCompletion) => {
        const b = notesBlanks(notes);
        return b.length === 0 ? 0 : Math.max(...b);
    };
    const sections: {
        minQ: number;
        maxQ: number;
        el: React.ReactNode;
        key: string;
    }[] = [];
    if (notesCompletion) {
        const minQ = minFromNotes(notesCompletion);
        const maxQ = maxFromNotes(notesCompletion);
        sections.push({
            minQ,
            maxQ,
            key: "notes",
            el: (<QuestionBlockHeading startQ={minQ} endQ={maxQ}>
          <div className="space-y-1.5 text-base text-zinc-800 dark:text-zinc-200">
            <p className="font-semibold">
              <HighlightableSegment id={seg("notes-inst")}>{notesCompletion.instruction}</HighlightableSegment>
            </p>
            <p className="text-zinc-700 dark:text-zinc-300">
              <InstructionSubBold text={notesCompletion.instructionSub}/>
            </p>
          </div>
          <section className={`mt-3 ${listeningSectionCardClass} px-5 py-3`}>
            {notesCompletion.sections.map((section, i) => {
                    const titleLines = section.title ? section.title.split(/\n/) : [];
                    const mainTitle = titleLines[0]?.trim() ?? "";
                    const subtitle = titleLines.slice(1).map((l) => l.trim()).filter(Boolean).join(" ");
                    return (<div key={i} className={i > 0 ? notesSectionGapClass : ""}>
                {mainTitle ? (<>
                    <p className={`${notesTitleCenteredClass} ${i === 0 ? "mb-0.5" : "mb-1"}`}>
                      <HighlightableSegment id={seg(`notes-sec-${i}`)}>{mainTitle}</HighlightableSegment>
                    </p>
                    {subtitle ? (<p className={notesSubtitleClass}>
                        <HighlightableSegment id={seg(`notes-sec-${i}-sub`)}>{subtitle}</HighlightableSegment>
                      </p>) : null}
                  </>) : null}
                <div className={section.title ? "mt-1 " + notesContentClass : notesContentClass}>
                  <NotesCellParts parts={section.content} segmentIdPrefix={seg(`notes-sec-${i}-content`)} defaultWidth="min-w-[6.5rem]" badgeVariant="outline" {...cellProps}/>
                </div>
              </div>);
                })}
          </section>
        </QuestionBlockHeading>),
        });
    }
    chooseTwoBlocks?.forEach((block, i) => {
        const minQ = Math.min(...block.qNums);
        const maxQ = Math.max(...block.qNums);
        sections.push({
            minQ,
            maxQ,
            key: `ct2-${i}`,
            el: (<QuestionBlockHeading startQ={minQ} endQ={maxQ}>
        <ChooseTwoSection key={i} block={block} segmentIdPrefix={seg("ct2")} isCorrect={isCorrect} submitted={submitted} getChooseTwoSelection={props.getChooseTwoSelection} toggleChooseTwo={props.toggleChooseTwo} getCorrectAnswerText={getCorrectAnswerText}/>
        </QuestionBlockHeading>),
        });
    });
    if (singleChoice && singleChoice.questions.length > 0) {
        const qNums = singleChoice.questions.map((q) => q.qNum);
        const minQ = Math.min(...qNums);
        const maxQ = Math.max(...qNums);
        sections.push({
            minQ,
            maxQ,
            key: "single",
            el: (<QuestionBlockHeading startQ={minQ} endQ={maxQ}>
        <SingleChoiceSection instruction={singleChoice.instruction} questions={singleChoice.questions} segmentIdPrefix={seg("single")} answers={answers} updateAnswer={updateAnswer} isCorrect={isCorrect} submitted={submitted} radioNamePrefix="p3" getCorrectAnswerText={getCorrectAnswerText}/>
        </QuestionBlockHeading>),
        });
    }
    if (matching) {
        const qNums = matching.items.map((i) => i.qNum);
        const minQ = Math.min(...qNums);
        const maxQ = Math.max(...qNums);
        sections.push({
            minQ,
            maxQ,
            key: "match",
            el: (<QuestionBlockHeading startQ={minQ} endQ={maxQ}>
        <MatchingSection instruction={matching.instruction} title={matching.title} options={matching.options} items={matching.items.map((i) => ({ qNum: i.qNum, label: i.text }))} segmentIdPrefix={seg("match")} answers={answers} updateAnswer={updateAnswer} isCorrect={isCorrect} submitted={submitted} getCorrectAnswerText={getCorrectAnswerText} optionsPlainList={matching.optionsPlainList}/>
        </QuestionBlockHeading>),
        });
    }
    sections.sort((a, b) => a.minQ - b.minQ);
    return (<div className="space-y-0 text-base text-zinc-800 dark:text-zinc-100">
      {sections.map((s, idx) => (<div key={s.key} className={idx === 0 ? "mt-4" : "mt-8"}>
          {s.el}
        </div>))}
    </div>);
}
export const Part3Content = memo(Part3ContentInner);
