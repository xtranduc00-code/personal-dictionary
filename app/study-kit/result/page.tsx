import { Suspense } from "react";
import { StudyKitResultContent } from "./study-kit-result-content";

export default function StudyKitResultPage() {
    return (
        <Suspense
            fallback={(
                <div
                    className="-mx-4 min-h-[50dvh] w-[calc(100%+2rem)] bg-[#F6F7F9] dark:bg-[#0a0a0b] md:-mx-8 md:w-[calc(100%+4rem)]"
                    aria-hidden
                />
            )}
        >
            <StudyKitResultContent />
        </Suspense>
    );
}
