"use client";
import React, { memo } from "react";
import type { Part2ContentData } from "@/lib/listening-part-content";
import { HighlightableSegment } from "./HighlightContext";
import { GenericPartContent } from "./GenericPartContent";
import { ChooseTwoSection } from "./shared/ChooseTwoSection";
import { SingleChoiceSection } from "./shared/SingleChoiceSection";
import { MatchingSection } from "./shared/MatchingSection";
import { NotesCellParts } from "./shared/NotesCellParts";
import { QBadge } from "./shared/QBadge";
import { InstructionSubBold } from "./shared/InstructionSubBold";
import { QuestionBlockHeading } from "./shared/QuestionBlockHeading";
import { listeningSectionCardClass, notesContentClass, notesSectionGapClass, notesSubtitleClass, notesTitleCenteredClass, selectClass, tickClass } from "./shared/questionStyles";
type Props = {
    answers: Record<number, string>;
    updateAnswer: (qNum: number, value: string) => void;
    isCorrect: (qNum: number) => boolean | null;
    submitted: boolean;
    getChooseTwoSelection: (primaryQ: number, secondaryQ?: number) => string[];
    toggleChooseTwo: (primaryQ: number, secondaryQ: number, letter: string) => void;
    segmentIdPrefix: string;
    content?: Part2ContentData | null;
    getCorrectAnswerText?: (qNum: number) => string | null;
};
function Part2ContentInner(props: Props) {
    const { answers, updateAnswer, isCorrect, submitted, segmentIdPrefix, content, getCorrectAnswerText } = props;
    const seg = (path: string) => `${segmentIdPrefix}-${path}`;
    if (!content) {
        return (<GenericPartContent partNumber={2} answers={answers} updateAnswer={updateAnswer} isCorrect={isCorrect} submitted={submitted} segmentIdPrefix={segmentIdPrefix} getCorrectAnswerText={getCorrectAnswerText}/>);
    }
    const { chooseTwoBlocks, matching, matchingRole, singleChoice, mapLabeling, notesCompletion, tableCompletion } = content;
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
    const tableBlanks = (t: typeof tableCompletion) => t
        ? t.rows.flatMap((row) => [...row.name, ...row.costs, ...row.notes]
            .map((p) => ("blank" in p ? p.blank : null))
            .filter((n): n is number => n != null && n < 99))
        : [];
    const minFromTable = (t: typeof tableCompletion) => {
        const b = tableBlanks(t);
        return b.length === 0 ? 99 : Math.min(...b);
    };
    const maxFromTable = (t: typeof tableCompletion) => {
        const b = tableBlanks(t);
        return b.length === 0 ? 0 : Math.max(...b);
    };
    const sections: {
        minQ: number;
        maxQ: number;
        el: React.ReactNode;
        key: string;
    }[] = [];
    if (tableCompletion) {
        const minQ = minFromTable(tableCompletion);
        const maxQ = maxFromTable(tableCompletion);
        const [col1, col2, col3] = tableCompletion.columns;
        sections.push({
            minQ,
            maxQ,
            key: "table",
            el: (<QuestionBlockHeading startQ={minQ} endQ={maxQ}>
          <div className="space-y-1.5 text-base text-zinc-800 dark:text-zinc-200">
            <p className="font-semibold">
              <HighlightableSegment id={seg("table-inst")}>{tableCompletion.instruction}</HighlightableSegment>
            </p>
            <p className="text-zinc-700 dark:text-zinc-300">
              <InstructionSubBold text={tableCompletion.instructionSub}/>
            </p>
          </div>
          <section className={`mt-4 overflow-x-auto ${listeningSectionCardClass}`}>
              {(() => {
                    const titleRedundant = tableCompletion.columns.join(" / ") === tableCompletion.title.trim();
                    if (!titleRedundant) {
                        return (<p className="border-b border-zinc-200 px-4 py-3 text-center text-lg font-bold uppercase tracking-wide text-zinc-900 dark:border-zinc-700 dark:text-zinc-100">
                      <HighlightableSegment id={seg("table-title")}>{tableCompletion.title}</HighlightableSegment>
                    </p>);
                    }
                    return null;
                })()}
              <table className="w-full min-w-[520px] border-collapse text-base text-zinc-800 dark:text-zinc-100">
                <thead>
                  <tr className="border-b border-zinc-300 bg-zinc-200/80 dark:border-zinc-700 dark:bg-zinc-800/80">
                    <th className="border-r border-zinc-300 px-4 py-2.5 text-left font-semibold dark:border-zinc-700">{col1}</th>
                    <th className="border-r border-zinc-300 px-4 py-2.5 text-left font-semibold dark:border-zinc-700">{col2}</th>
                    <th className="px-4 py-2.5 text-left font-semibold">{col3}</th>
                  </tr>
                </thead>
                <tbody>
                  {tableCompletion.rows.map((row, ri) => (<tr key={ri} className="border-b border-zinc-200 dark:border-zinc-800 last:border-b-0">
                      <td className="border-r border-zinc-200 px-4 py-2.5 align-top font-semibold text-zinc-800 dark:border-zinc-800 dark:text-zinc-100">
                        <NotesCellParts parts={row.name} segmentIdPrefix={seg(`table-r${ri}-name`)} badgeVariant="outline" {...cellProps}/>
                      </td>
                      <td className="border-r border-zinc-200 px-4 py-2.5 align-top dark:border-zinc-800">
                        <NotesCellParts parts={row.costs} segmentIdPrefix={seg(`table-r${ri}-costs`)} badgeVariant="outline" {...cellProps}/>
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        <NotesCellParts parts={row.notes} segmentIdPrefix={seg(`table-r${ri}-notes`)} badgeVariant="outline" {...cellProps}/>
                      </td>
                    </tr>))}
                </tbody>
              </table>
          </section>
        </QuestionBlockHeading>),
        });
    }
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
                  <NotesCellParts parts={section.content} segmentIdPrefix={seg(`notes-sec-${i}-content`)} defaultWidth="min-w-[6.5rem]" badgeVariant="outline" bulletChar="•" {...cellProps}/>
                </div>
              </div>);
                })}
          </section>
        </QuestionBlockHeading>),
        });
    }
    if (matchingRole) {
        const qNums = matchingRole.items.map((i) => i.qNum);
        const minQ = Math.min(...qNums);
        const maxQ = Math.max(...qNums);
        sections.push({
            minQ,
            maxQ,
            key: "matchrole",
            el: (<QuestionBlockHeading startQ={minQ} endQ={maxQ}>
        <MatchingSection instruction={matchingRole.instruction} title={matchingRole.title} options={matchingRole.options} items={matchingRole.items.map((i) => ({ qNum: i.qNum, label: i.text }))} segmentIdPrefix={seg("matchrole")} answers={answers} updateAnswer={updateAnswer} isCorrect={isCorrect} submitted={submitted} getCorrectAnswerText={getCorrectAnswerText}/>
        </QuestionBlockHeading>),
        });
    }
    if (mapLabeling) {
        const qNums = mapLabeling.labels.map((l) => l.qNum);
        const minQ = Math.min(...qNums);
        const maxQ = Math.max(...qNums);
        sections.push({
            minQ,
            maxQ,
            key: "map",
            el: (<QuestionBlockHeading startQ={minQ} endQ={maxQ}>
          <p className="mb-2 text-base font-semibold text-zinc-800 dark:text-zinc-200">
            <HighlightableSegment id={seg("map-inst")}>{mapLabeling.instruction}</HighlightableSegment>
          </p>
        <section key="map" className={`mt-4 ${listeningSectionCardClass}`}>
          {mapLabeling.imageUrl && (<figure className="mb-4">
              <img src={mapLabeling.imageUrl} alt="Map for labelling" className="max-h-[420px] w-full rounded border border-zinc-200 object-contain dark:border-zinc-700"/>
            </figure>)}
          <ul className="space-y-2">
            {[...mapLabeling.labels].sort((a, b) => a.qNum - b.qNum).map(({ qNum, text }) => {
                    const correct = isCorrect(qNum);
                    return (<li key={qNum} className="flex flex-wrap items-center gap-2" data-question-number={qNum}>
                  <QBadge qNum={qNum} correct={correct} variant="border"/>
                  <span className="text-zinc-700 dark:text-zinc-300">
                    <HighlightableSegment id={seg(`map-q${qNum}`)}>{text}</HighlightableSegment>
                  </span>
                  <select value={answers[qNum] ?? ""} onChange={(e) => updateAnswer(qNum, e.target.value)} disabled={submitted} className={selectClass(correct)}>
                    <option value="">—</option>
                    {mapLabeling.letters.map((L) => (<option key={L} value={L}>{L}</option>))}
                  </select>
                  {submitted && correct !== null && (<span className={`text-xs font-medium ${tickClass(correct)}`}>
                      {correct ? "✓" : "✗"}
                    </span>)}
                  {submitted && correct === false && getCorrectAnswerText && (<span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                      Correct: {getCorrectAnswerText(qNum)}
                    </span>)}
                </li>);
                })}
          </ul>
        </section>
        </QuestionBlockHeading>),
        });
    }
    if (singleChoice && singleChoice.questions.length > 0) {
        const qNums = singleChoice.questions.map((q) => q.qNum);
        const minQ = Math.min(...qNums);
        const maxQ = Math.max(...qNums);
        sections.push({
            minQ,
            maxQ,
            key: "single",
            el: (<QuestionBlockHeading startQ={minQ} endQ={maxQ}>
        <SingleChoiceSection instruction={singleChoice.instruction} questions={singleChoice.questions} segmentIdPrefix={seg("single")} answers={answers} updateAnswer={updateAnswer} isCorrect={isCorrect} submitted={submitted} radioNamePrefix="p2" getCorrectAnswerText={getCorrectAnswerText}/>
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
        <ChooseTwoSection key={i} block={block} segmentIdPrefix={seg(`ct2`)} isCorrect={isCorrect} submitted={submitted} getChooseTwoSelection={props.getChooseTwoSelection} toggleChooseTwo={props.toggleChooseTwo} getCorrectAnswerText={getCorrectAnswerText}/>
        </QuestionBlockHeading>),
        });
    });
    if (matching) {
        const qNums = matching.years.map((y) => y.qNum);
        const minQ = Math.min(...qNums);
        const maxQ = Math.max(...qNums);
        sections.push({
            minQ,
            maxQ,
            key: "match",
            el: (<QuestionBlockHeading startQ={minQ} endQ={maxQ}>
        <MatchingSection instruction={matching.instruction} title={matching.title} options={matching.events} items={matching.years.map((y) => ({ qNum: y.qNum, label: y.year }))} segmentIdPrefix={seg("match")} answers={answers} updateAnswer={updateAnswer} isCorrect={isCorrect} submitted={submitted} getCorrectAnswerText={getCorrectAnswerText}/>
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
export const Part2Content = memo(Part2ContentInner);
