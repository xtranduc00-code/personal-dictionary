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

/** `display:contents` so typography from the parent `studyKitSheetRootClass` applies to nested markdown. */
const CONTENTS_WRAPPER = "contents exam-notes-markdown max-w-none";

type Props = {
    markdown: string;
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
    sectionThreads,
    setSectionThreads,
}: Props) {
    const { t } = useI18n();
    const { preamble, sections } = splitMarkdownByTopLevelH2(markdown);

    if (sections.length === 0) {
        return (
            <div className={studyKitSheetRootClass}>
                <StudyKitResultMarkdown markdown={markdown} wrapperClassName={CONTENTS_WRAPPER} />
                <StudyKitSectionChat
                    studyContext={markdown}
                    sectionTitle={null}
                    toggleLabel={t("studyKitSheetChatToggle")}
                    hint={t("studyKitSheetChatHint")}
                    instanceId="whole"
                    messages={sectionThreads.whole ?? []}
                    onMessagesChange={threadDispatch("whole", setSectionThreads)}
                />
            </div>
        );
    }

    return (
        <div className={studyKitSheetRootClass}>
            {preamble ? (
                <StudyKitResultMarkdown markdown={preamble} wrapperClassName={CONTENTS_WRAPPER} />
            ) : null}
            {sections.map((s, idx) => {
                const isFirstH2 = idx === 0 && !preamble;
                const key = String(idx);
                return (
                    <section key={`${idx}-${s.title}`} id={`sk-sec-${idx}`} className="scroll-mt-20">
                        <h2 className={studyKitSheetSectionH2Class(isFirstH2)}>{s.title}</h2>
                        <StudyKitResultMarkdown markdown={s.body} wrapperClassName={CONTENTS_WRAPPER} />
                        <StudyKitSectionChat
                            studyContext={markdown}
                            sectionTitle={s.title}
                            toggleLabel={t("studyKitSectionChatToggle")}
                            hint={t("studyKitSectionChatHint")}
                            instanceId={key}
                            messages={sectionThreads[key] ?? []}
                            onMessagesChange={threadDispatch(key, setSectionThreads)}
                        />
                    </section>
                );
            })}
        </div>
    );
}
