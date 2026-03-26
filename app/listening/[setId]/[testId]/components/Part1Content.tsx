"use client";
import { memo } from "react";
import type { Part1CellPart, Part1TableContentData, Part1Table4ColContentData, Part1NotesContentData, Part1TablePlusNotesContentData, } from "@/lib/listening-part-content";
import { MatchingSection } from "./shared/MatchingSection";
import { HighlightableSegment } from "./HighlightContext";
import { GenericPartContent } from "./GenericPartContent";
import { parseNotesSection } from "@/lib/listening-notes-schema";
import { NotesCellParts } from "./shared/NotesCellParts";
import { NotesStructuredRenderer } from "./shared/NotesStructuredRenderer";
import { QBadge } from "./shared/QBadge";
import { InstructionSubBold } from "./shared/InstructionSubBold";
import { inputClass, listeningSectionCardClass, notesContentClass, notesSectionGapClass, notesSubtitleClass, notesTitleCenteredClass, selectClass } from "./shared/questionStyles";
type Props = {
    answers: Record<number, string>;
    updateAnswer: (qNum: number, value: string) => void;
    isCorrect: (qNum: number) => boolean | null;
    submitted: boolean;
    segmentIdPrefix: string;
    content?: Part1TableContentData | Part1Table4ColContentData | Part1NotesContentData | Part1TablePlusNotesContentData | null;
    getCorrectAnswerText?: (qNum: number) => string | null;
};
function isTableContent(c: Props["content"]): c is Part1TableContentData {
    return (c != null &&
        typeof c === "object" &&
        "title" in c &&
        "rows" in c &&
        Array.isArray((c as Part1TableContentData).columns) &&
        (c as Part1TableContentData).columns.length === 3);
}
function isTable4ColContent(c: Props["content"]): c is Part1Table4ColContentData {
    return (c != null &&
        typeof c === "object" &&
        "title" in c &&
        "rows" in c &&
        Array.isArray((c as Part1Table4ColContentData).columns) &&
        (c as Part1Table4ColContentData).columns.length === 4);
}
function isPart1NotesContent(c: Props["content"]): c is Part1NotesContentData {
    return c != null && typeof c === "object" && "sections" in c && !("table" in c && (c as Part1TablePlusNotesContentData).table);
}
function isPart1TablePlusNotesContent(c: Props["content"]): c is Part1TablePlusNotesContentData {
    return c != null && typeof c === "object" && "table" in c && (c as Part1TablePlusNotesContentData).table != null;
}
function Part1ContentInner({ answers, updateAnswer, isCorrect, submitted, segmentIdPrefix, content, getCorrectAnswerText, }: Props) {
    const seg = (path: string) => `${segmentIdPrefix}-${path}`;
    const cellProps = { answers, updateAnswer, isCorrect, submitted, getCorrectAnswerText };
    if (!content) {
        return (<GenericPartContent partNumber={1} answers={answers} updateAnswer={updateAnswer} isCorrect={isCorrect} submitted={submitted} segmentIdPrefix={segmentIdPrefix} getCorrectAnswerText={getCorrectAnswerText}/>);
    }
    if (isTableContent(content)) {
        const [col1, col2, col3] = content.columns;
        const blanks = content.rows.flatMap((r) => [...r.name, ...r.costs, ...r.notes].map((p) => ("blank" in p ? p.blank : null)).filter((n): n is number => n != null && n < 99));
        const minQ = blanks.length ? Math.min(...blanks) : 1;
        const maxQ = blanks.length ? Math.max(...blanks) : 10;
        return (<>
        <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">Questions {minQ} – {maxQ}</p>
        <div className="mt-2 space-y-1.5 text-base text-zinc-800 dark:text-zinc-200">
          <p className="font-semibold">
            <HighlightableSegment id={seg("inst1")}>{content.instruction}</HighlightableSegment>
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            <InstructionSubBold text={content.instructionSub}/>
          </p>
        </div>
        <section className={`mt-4 overflow-x-auto ${listeningSectionCardClass}`}>
          {content.columns.join(" / ") !== (content.title || "").trim() && content.title ? (<p className="border-b border-zinc-200 px-4 py-3 text-center text-lg font-bold uppercase tracking-wide text-zinc-900 dark:border-zinc-700 dark:text-zinc-100">
              <HighlightableSegment id={seg("title")}>{content.title}</HighlightableSegment>
            </p>) : null}
          <table className="w-full min-w-[520px] border-collapse text-base text-zinc-800 dark:text-zinc-100">
            <thead>
              <tr className="border-b border-zinc-300 bg-zinc-200/80 dark:border-zinc-700 dark:bg-zinc-800/80">
                <th className="border-r border-zinc-300 px-4 py-2.5 text-left font-semibold dark:border-zinc-700">{col1}</th>
                <th className="border-r border-zinc-300 px-4 py-2.5 text-left font-semibold dark:border-zinc-700">{col2}</th>
                <th className="px-4 py-2.5 text-left font-semibold">{col3}</th>
              </tr>
            </thead>
            <tbody>
              {content.rows.map((row, ri) => (<tr key={ri} className="border-b border-zinc-200 dark:border-zinc-800 last:border-b-0">
                  <td className="border-r border-zinc-200 px-4 py-2.5 align-top font-semibold text-zinc-800 dark:border-zinc-800 dark:text-zinc-100">
                    <NotesCellParts parts={row.name} segmentIdPrefix={seg(`t3-r${ri}-name`)} badgeVariant="outline" {...cellProps}/>
                  </td>
                  <td className="border-r border-zinc-200 px-4 py-2.5 align-top dark:border-zinc-800">
                    <NotesCellParts parts={row.costs} segmentIdPrefix={seg(`t3-r${ri}-costs`)} badgeVariant="outline" {...cellProps}/>
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <NotesCellParts parts={row.notes} segmentIdPrefix={seg(`t3-r${ri}-notes`)} badgeVariant="outline" {...cellProps}/>
                  </td>
                </tr>))}
            </tbody>
          </table>
        </section>
      </>);
    }
    if (isTable4ColContent(content)) {
        const [col1, col2, col3, col4] = content.columns;
        const blanks = content.rows.flatMap((r) => [...r.name, ...r.location, ...r.reason, ...r.other].map((p) => ("blank" in p ? p.blank : null)).filter((n): n is number => n != null && n < 99));
        const minQ = blanks.length ? Math.min(...blanks) : 1;
        const maxQ = blanks.length ? Math.max(...blanks) : 10;
        return (<>
        <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">Questions {minQ} – {maxQ}</p>
        <div className="mt-2 space-y-1.5 text-base text-zinc-800 dark:text-zinc-200">
          <p className="font-semibold">
            <HighlightableSegment id={seg("inst1")}>{content.instruction}</HighlightableSegment>
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            <InstructionSubBold text={content.instructionSub}/>
          </p>
        </div>
        <section className={`mt-4 overflow-x-auto ${listeningSectionCardClass}`}>
          {content.columns.join(" / ") !== (content.title || "").trim() && content.title ? (<p className="border-b border-zinc-200 px-4 py-3 text-center text-lg font-bold uppercase tracking-wide text-zinc-900 dark:border-zinc-700 dark:text-zinc-100">
              <HighlightableSegment id={seg("title")}>{content.title}</HighlightableSegment>
            </p>) : null}
          <table className="w-full min-w-[640px] border-collapse text-base text-zinc-800 dark:text-zinc-100">
            <thead>
              <tr className="border-b border-zinc-300 bg-zinc-200/80 dark:border-zinc-700 dark:bg-zinc-800/80">
                <th className="border-r border-zinc-300 px-4 py-2.5 text-left font-semibold dark:border-zinc-700">{col1}</th>
                <th className="border-r border-zinc-300 px-4 py-2.5 text-left font-semibold dark:border-zinc-700">{col2}</th>
                <th className="border-r border-zinc-300 px-4 py-2.5 text-left font-semibold dark:border-zinc-700">{col3}</th>
                <th className="px-4 py-2.5 text-left font-semibold">{col4}</th>
              </tr>
            </thead>
            <tbody>
              {content.rows.map((row, ri) => (<tr key={ri} className="border-b border-zinc-200 dark:border-zinc-800 last:border-b-0">
                  <td className="border-r border-zinc-200 px-4 py-2.5 align-top font-semibold text-zinc-800 dark:border-zinc-800 dark:text-zinc-100">
                    <NotesCellParts parts={row.name} segmentIdPrefix={seg(`t4-r${ri}-name`)} badgeVariant="outline" {...cellProps}/>
                  </td>
                  <td className="border-r border-zinc-200 px-4 py-2.5 align-top dark:border-zinc-800">
                    <NotesCellParts parts={row.location} segmentIdPrefix={seg(`t4-r${ri}-loc`)} badgeVariant="outline" {...cellProps}/>
                  </td>
                  <td className="border-r border-zinc-200 px-4 py-2.5 align-top dark:border-zinc-800">
                    <NotesCellParts parts={row.reason} segmentIdPrefix={seg(`t4-r${ri}-reason`)} badgeVariant="outline" {...cellProps}/>
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <NotesCellParts parts={row.other} segmentIdPrefix={seg(`t4-r${ri}-other`)} badgeVariant="outline" {...cellProps}/>
                  </td>
                </tr>))}
            </tbody>
          </table>
        </section>
      </>);
    }
    if (isPart1TablePlusNotesContent(content)) {
        const { table, sections = [], matching } = content;
        const colCount = table?.columns?.length ?? 3;
        const is4Col = colCount === 4;
        const minBlank = (parts: Part1CellPart[]): number => Math.min(...parts.map((p) => ("blank" in p ? p.blank : 99)).filter((n) => n < 99), 99);
        const minFromTable = (): number => {
            if (!table)
                return 99;
            let m = 99;
            for (const row of table.rows) {
                for (const key of ["name", "costs", "notes", "location", "reason", "other"] as const) {
                    const cell = (row as Record<string, Part1CellPart[]>)[key];
                    if (cell)
                        m = Math.min(m, minBlank(cell));
                }
            }
            return m;
        };
        const maxFromTable = (): number => {
            if (!table)
                return 0;
            let m = 0;
            for (const row of table.rows) {
                for (const key of ["name", "costs", "notes", "location", "reason", "other"] as const) {
                    const cell = (row as Record<string, Part1CellPart[]>)[key];
                    if (Array.isArray(cell)) {
                        const blanks = cell.map((p) => ("blank" in p ? p.blank : 0)).filter((n) => n > 0);
                        if (blanks.length)
                            m = Math.max(m, ...blanks);
                    }
                }
            }
            return m;
        };
        const sectionBlanks = () => sections.flatMap((s) => s.content.map((p) => ("blank" in p ? p.blank : null)).filter((n): n is number => n !== null && n > 0));
        const minFromSections = (): number => {
            const blanks = sectionBlanks();
            return blanks.length === 0 ? 99 : Math.min(...blanks);
        };
        const maxFromSections = (): number => {
            const blanks = sectionBlanks();
            return blanks.length === 0 ? 0 : Math.max(...blanks);
        };
        const minFromMatching = (): number => matching ? Math.min(...matching.items.map((i) => i.qNum)) : 99;
        const parts: {
            minQ: number;
            el: React.ReactNode;
        }[] = [];
        if (sections.length > 0) {
            const minS = minFromSections();
            const maxS = maxFromSections();
            parts.push({
                minQ: minS,
                el: (<div key="notes" className="mt-2">
            <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Questions {minS} – {maxS}
            </p>
            <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">{content.instruction}</p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              <InstructionSubBold text={content.instructionSub}/>
            </p>
            <div className={`mt-1.5 ${listeningSectionCardClass} px-5 py-2.5`}>
              {sections.map((section, i) => {
                        const normalizedContent = section.content.map((part, j) => {
                            if (!("text" in part) || typeof part.text !== "string")
                                return part;
                            const t = part.text.replace(/^\n+/, "").replace(/\n{2,}/g, "\n");
                            return { ...part, text: t };
                        });
                        const titleLines = section.title ? section.title.split(/\n/) : [];
                        const mainTitle = titleLines[0]?.trim() ?? "";
                        const subtitle = titleLines.slice(1).map((l) => l.trim()).filter(Boolean).join(" ");
                        const isFirstSection = i === 0;
                        return (<div key={i} className={i > 0 ? notesSectionGapClass : ""}>
                  {mainTitle ? (<>
                      <p className={isFirstSection ? `${notesTitleCenteredClass} mb-0.5` : "mb-1 text-left text-base font-bold uppercase tracking-wide text-zinc-900 dark:text-zinc-100"}>
                        <HighlightableSegment id={seg(`sec-${i}`)}>{mainTitle}</HighlightableSegment>
                      </p>
                      {subtitle ? (<p className={isFirstSection ? notesSubtitleClass : "mb-1 text-left text-sm italic text-zinc-700 dark:text-zinc-300"}>
                          <HighlightableSegment id={seg(`sec-${i}-sub`)}>{subtitle}</HighlightableSegment>
                        </p>) : null}
                    </>) : null}
                  <div className={section.title ? "mt-1 " + notesContentClass : notesContentClass}>
                    <NotesCellParts parts={normalizedContent} segmentIdPrefix={seg(`sec-${i}-content`)} defaultWidth="min-w-[6.5rem]" badgeVariant="outline" bulletChar="•" {...cellProps}/>
                  </div>
                </div>);
                    })}
            </div>
          </div>),
            });
        }
        if (table) {
            const tableMin = minFromTable();
            const tableMax = maxFromTable();
            parts.push({
                minQ: tableMin,
                el: (<div key="table" className="mt-8">
            <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Questions {tableMin} – {tableMax}
            </p>
            <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">Complete the table below.</p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              <InstructionSubBold text={content.instructionSub}/>
            </p>
            <div className={`mt-4 overflow-x-auto ${listeningSectionCardClass}`}>
            {(() => {
                        const titleRedundant = table.title && table.columns.join(" / ") === table.title.trim();
                        if (table.title && !titleRedundant) {
                            return (<p className="border-b border-zinc-200 px-4 py-3 text-center text-lg font-bold uppercase tracking-wide text-zinc-900 dark:border-zinc-700 dark:text-zinc-100">
                    <HighlightableSegment id={seg("title")}>{table.title}</HighlightableSegment>
                  </p>);
                        }
                        return null;
                    })()}
            <table className={`w-full border-collapse text-base text-zinc-800 dark:text-zinc-100 ${is4Col ? "min-w-[640px]" : "min-w-[520px]"}`}>
              <thead>
                <tr className="border-b border-zinc-300 bg-zinc-200/80 dark:border-zinc-700 dark:bg-zinc-800/80">
                  {table.columns.map((col, i) => (<th key={i} className={`px-4 py-2.5 text-left font-semibold dark:border-zinc-700 ${i < colCount - 1 ? "border-r border-zinc-300" : ""}`}>{col}</th>))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                        const rows = table.rows;
                        const getPlaceText = (r: (typeof rows)[0]) => {
                            if (r.name.length === 1 && "text" in r.name[0])
                                return r.name[0].text.trim();
                            return "";
                        };
                        const firstColRowSpan: number[] = [];
                        for (let i = 0; i < rows.length; i++) {
                            const place = getPlaceText(rows[i]);
                            if (place === "" && i > 0) {
                                firstColRowSpan.push(0);
                            }
                            else {
                                let count = 1;
                                const currentPlace = place || (i > 0 ? getPlaceText(rows[i - 1]) : "");
                                while (i + count < rows.length && (getPlaceText(rows[i + count]) === "" || getPlaceText(rows[i + count]) === currentPlace))
                                    count++;
                                firstColRowSpan.push(count);
                            }
                        }
                        return rows.map((row, ri) => (<tr key={ri} className="border-b border-zinc-200 dark:border-zinc-800 last:border-b-0">
                      {is4Col && "location" in row ? (<>
                          {firstColRowSpan[ri] > 0 && (<td rowSpan={firstColRowSpan[ri]} className="border-r border-zinc-200 px-4 py-2.5 align-top font-semibold text-zinc-800 dark:border-zinc-800 dark:text-zinc-100">
                              <NotesCellParts parts={row.name} segmentIdPrefix={seg(`t-r${ri}-name`)} badgeVariant="outline" {...cellProps}/>
                            </td>)}
                          <td className="border-r border-zinc-200 px-4 py-2.5 align-top dark:border-zinc-800">
                            <NotesCellParts parts={row.location} segmentIdPrefix={seg(`t-r${ri}-loc`)} badgeVariant="outline" {...cellProps}/>
                          </td>
                          <td className="border-r border-zinc-200 px-4 py-2.5 align-top dark:border-zinc-800">
                            <NotesCellParts parts={row.reason} segmentIdPrefix={seg(`t-r${ri}-reason`)} badgeVariant="outline" {...cellProps}/>
                          </td>
                          <td className="px-4 py-2.5 align-top">
                            <NotesCellParts parts={row.other} segmentIdPrefix={seg(`t-r${ri}-other`)} badgeVariant="outline" {...cellProps}/>
                          </td>
                        </>) : (<>
                          {firstColRowSpan[ri] > 0 && (<td rowSpan={firstColRowSpan[ri]} className="border-r border-zinc-200 px-4 py-2.5 align-top font-semibold text-zinc-800 dark:border-zinc-800 dark:text-zinc-100">
                              <NotesCellParts parts={row.name} segmentIdPrefix={seg(`t-r${ri}-name`)} badgeVariant="outline" {...cellProps}/>
                            </td>)}
                          <td className="border-r border-zinc-200 px-4 py-2.5 align-top dark:border-zinc-800">
                            <NotesCellParts parts={"costs" in row ? row.costs : row.location} segmentIdPrefix={seg(`t-r${ri}-c2`)} badgeVariant="outline" {...cellProps}/>
                          </td>
                          <td className="px-4 py-2.5 align-top">
                            <NotesCellParts parts={((row as {
                                notes?: Part1CellPart[];
                            }).notes ?? []) as Part1CellPart[]} segmentIdPrefix={seg(`t-r${ri}-c3`)} badgeVariant="outline" {...cellProps}/>
                          </td>
                        </>)}
                    </tr>));
                    })()}
              </tbody>
            </table>
            </div>
          </div>),
            });
        }
        if (matching)
            parts.push({
                minQ: minFromMatching(),
                el: (<div key="match" className="mt-5">
            <MatchingSection instruction={matching.instruction} title={matching.title} options={matching.options} items={matching.items.map((i) => ({ qNum: i.qNum, label: i.text }))} segmentIdPrefix={seg("match")} answers={answers} updateAnswer={updateAnswer} isCorrect={isCorrect} submitted={submitted} getCorrectAnswerText={getCorrectAnswerText} optionsPlainList={matching.optionsPlainList}/>
          </div>),
            });
        parts.sort((a, b) => a.minQ - b.minQ);
        return <>{parts.map((p) => p.el)}</>;
    }
    if (isPart1NotesContent(content)) {
        const blanks = content.sections.flatMap((s) => s.content.map((p) => ("blank" in p ? p.blank : null)).filter((n): n is number => n != null && n < 99));
        const minQ = blanks.length > 0 ? Math.min(...blanks) : 1;
        const maxQ = blanks.length > 0 ? Math.max(...blanks) : 10;
        const parsedSections = content.sections.map((section) => {
            const normalizedContent = section.content.map((part) => {
                if (!("text" in part) || typeof part.text !== "string")
                    return part;
                const t = part.text.replace(/^\n+/, "").replace(/\n{2,}/g, "\n");
                return { ...part, text: t };
            });
            return parseNotesSection(normalizedContent, {
                sectionTitle: section.title,
                keepDashBullet: false,
            });
        });
        return (<>
        <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">
          Questions {minQ} – {maxQ}
        </p>
        <div className="mt-2 space-y-1 text-base text-zinc-800 dark:text-zinc-200">
          <p className="font-semibold">
            <HighlightableSegment id={seg("inst1")}>{content.instruction}</HighlightableSegment>
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            <InstructionSubBold text={content.instructionSub}/>
          </p>
        </div>
        <section className={`mt-2 ${listeningSectionCardClass} px-5 py-3`}>
          {parsedSections.map((section, i) => (<NotesStructuredRenderer key={i} section={section} sectionIndex={i} segmentIdPrefix={seg(`sec-${i}`)} isFirstSection={i === 0} {...cellProps} defaultWidth="min-w-[6.5rem]" badgeVariant="outline"/>))}
        </section>
      </>);
    }
    return (<GenericPartContent partNumber={1} answers={answers} updateAnswer={updateAnswer} isCorrect={isCorrect} submitted={submitted} segmentIdPrefix={segmentIdPrefix} getCorrectAnswerText={getCorrectAnswerText}/>);
}
export const Part1Content = memo(Part1ContentInner);
