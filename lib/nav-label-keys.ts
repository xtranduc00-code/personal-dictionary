import type { TranslationKey } from "@/lib/i18n";

/** Stable i18n keys for sidebar rows the user may rename; server validates PATCH against this set. */
export const NAV_LABEL_KEYS = [
    "portfolio",
    "navLanguageSection",
    "dictionary",
    "ielts",
    "navStudySection",
    "navScheduleSection",
    "others",
    "portfolioHome",
    "portfolioProfile",
    "portfolioContact",
    "search",
    "translate",
    "library",
    "history",
    "listen",
    "read",
    "write",
    "speak",
    "aiSpeakingNav",
    "ieltsVocabNotes",
    "studyKit",
    "studyKitSessionHistory",
    "studyKitSavedFolder",
    "calendar",
    "meets",
    "notes",
    "navDriveDashboard",
    "navDriveFolders",
    "navDriveDocuments",
    "navDriveImages",
    "navDriveMedia",
    "navDriveStarred",
    "portfolioGoogleDrive",
] as const satisfies readonly TranslationKey[];

export type NavLabelKey = (typeof NAV_LABEL_KEYS)[number];

const KEY_SET = new Set<string>(NAV_LABEL_KEYS);

export function isNavLabelKey(k: string): k is NavLabelKey {
    return KEY_SET.has(k);
}

export const NAV_LABEL_MAX_LEN = 80;
