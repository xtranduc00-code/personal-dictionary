"use client";

import { useI18n } from "@/components/i18n-provider";
import {
    StudyKitResultMarkdown,
    studyKitSheetRootClass,
    studyKitSheetSectionH2Class,
} from "@/components/study-kit-result-markdown";
import { StudyKitSectionChat } from "@/components/study-kit-section-chat";
import type { StudyKitChatMsg } from "@/lib/study-kit-chat-types";
import { splitMarkdownByTopLevelH2 } from "@/lib/study-kit-section";
import type { Dispatch, SetStateAction } from "react";

/** Block wrapper — avoid `display:contents` here (breaks vertical flow / scroll in some layouts). Parent `sheetRoot` still scopes `[&_…]` typography rules. */
const SECTION_MARKDOWN_CLASS = "exam-notes-markdown max-w-none min-w-0";

const NOTES_CHAT_GRID =
    "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(272px,320px)] lg:items-start lg:gap-6";
const CHAT_RAIL =
    "min-h-0 min-w-0 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pr-1";

type Props = {
    /** Rendered sheet (may be quiz-truncated for display). */
    markdown: string;
    /** Full markdown for chat context when `markdown` is a preview slice. */
    studyContextMarkdown?: string;
    sectionThreads: Record<string, StudyKitChatMsg[]>;
    setSectionThreads: Dispatch<SetStateAction<Record<string, StudyKitChatMsg[]>>>;
};

function threadDispatch(
    key: string,
    setSectionThreads: Dispatch<SetStateAction<Record<string, StudyKitChatMsg[]>>>,
): Dispatch<SetStateAction<StudyKitChatMsg[]>> {
    return (action) => {
        setSectionThreads((map) => {
            const cur = map[key] ?? [];
            const next = typeof action === "function" ? action(cur) : action;
            return { ...map, [key]: next };
        });
    };
}

export function StudyKitResultSheetWithChats({
    markdown,
    studyContextMarkdown,
    sectionThreads,
    setSectionThreads,
}: Props) {
    const { t } = useI18n();
    const { preamble, sections } = splitMarkdownByTopLevelH2(markdown);
    const chatContext = studyContextMarkdown ?? markdown;

    if (sections.length === 0) {
        return (
            <div className={`${studyKitSheetRootClass} flex flex-col gap-6`}>
                <StudyKitResultMarkdown markdown={markdown} wrapperClassName={SECTION_MARKDOWN_CLASS} />
            </div>
        );
    }

    return (
        <div className={`${studyKitSheetRootClass} flex flex-col gap-2`}>
            {preamble ? (
                <div className="min-w-0 shrink-0">
                    <StudyKitResultMarkdown markdown={preamble} wrapperClassName={SECTION_MARKDOWN_CLASS} />
                </div>
            ) : null}
            {sections.map((s, idx) => {
                const isFirstH2 = idx === 0 && !preamble;
                const key = String(idx);
                return (
                    <section
                        key={`${idx}-${s.title}`}
                        id={`sk-sec-${idx}`}
                        className="scroll-mt-20 flex min-w-0 flex-col gap-3"
                    >
                        <h2 className={studyKitSheetSectionH2Class(isFirstH2)}>{s.title}</h2>
                        <div className={NOTES_CHAT_GRID}>
                            <div className="min-w-0">
                                <StudyKitResultMarkdown markdown={s.body} wrapperClassName={SECTION_MARKDOWN_CLASS} />
                            </div>
                            <div className={CHAT_RAIL}>
                                <StudyKitSectionChat
                                    studyContext={chatContext}
                                    sectionTitle={s.title}
                                    toggleLabel={t("studyKitSectionChatToggle")}
                                    hint={t("studyKitSectionChatHint")}
                                    instanceId={key}
                                    messages={sectionThreads[key] ?? []}
                                    onMessagesChange={threadDispatch(key, setSectionThreads)}
                                />
                            </div>
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
