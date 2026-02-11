import { authFetch } from "@/lib/auth-context";
import { formatCorrectAnswer as formatCorrectAnswerShared, getNormalizedAnswer as getNormalizedAnswerShared, } from "@/lib/ielts-utils";
export const getNormalizedAnswer = getNormalizedAnswerShared;
export const formatCorrectAnswer = formatCorrectAnswerShared;
const HALF_PAST_WORD: Record<string, string> = {
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    ten: "10",
    eleven: "11",
    twelve: "12",
};
const BR_TO_AM: [
    string,
    string
][] = [
    ["harbours", "harbors"],
    ["harbour", "harbor"],
    ["colours", "colors"],
    ["colour", "color"],
    ["fertilisers", "fertilizers"],
    ["fertiliser", "fertilizer"],
    ["centres", "centers"],
    ["centre", "center"],
    ["theatres", "theaters"],
    ["theatre", "theater"],
    ["organisers", "organizers"],
    ["organiser", "organizer"],
    ["recognise", "recognize"],
    ["specialise", "specialize"],
];
export function normalizeListeningAnswer(raw: string): string {
    let s = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (!s)
        return s;
    s = s.replace(/\bhalf\s+past\s+(\d{1,2})\b/g, (_, n) => `${n}:30`);
    s = s.replace(/\bhalf\s+past\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g, (_, w) => `${HALF_PAST_WORD[w]}:30`);
    s = s.replace(/\bhalf\s+(\d{1,2})\b/g, (_, n) => `${n}:30`);
    if (/^[\d\s,]+$/.test(s)) {
        s = s.replace(/[\s,]/g, "");
    }
    else {
        let prev: string;
        do {
            prev = s;
            s = s.replace(/(\d),(\d{3})\b/g, "$1$2");
        } while (s !== prev);
    }
    s = s.replace(/\b(\d{1,2})[.:](\d{2})\b/g, (_, h, m) => {
        const mi = parseInt(m, 10);
        if (mi > 59)
            return `${h}.${m}`;
        return `${h}:${m}`;
    });
    for (const [br, am] of BR_TO_AM) {
        s = s.replace(new RegExp(`\\b${br}\\b`, "g"), am);
    }
    if (s === "02")
        s = "o2";
    return s.trim();
}
export function rawScoreToBand(raw: number): number | null {
    if (raw >= 39)
        return 9;
    if (raw >= 37)
        return 8.5;
    if (raw >= 35)
        return 8;
    if (raw >= 32)
        return 7.5;
    if (raw >= 30)
        return 7;
    if (raw >= 26)
        return 6.5;
    if (raw >= 23)
        return 6;
    if (raw >= 18)
        return 5.5;
    if (raw >= 16)
        return 5;
    if (raw >= 13)
        return 4.5;
    if (raw >= 10)
        return 4;
    return null;
}
export const LISTENING_HISTORY_KEY = "listening-test-history";
export type ListeningHistoryEntry = {
    setId: string;
    testId: string;
    setLabel: string;
    testLabel: string;
    correctCount: number;
    totalCount: number;
    band: number | null;
    date: string;
};
export async function saveListeningResultToHistory(entry: ListeningHistoryEntry): Promise<void> {
    try {
        await authFetch("/api/listening/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                setId: entry.setId,
                testId: entry.testId,
                setLabel: entry.setLabel,
                testLabel: entry.testLabel,
                correctCount: entry.correctCount,
                totalCount: entry.totalCount,
                band: entry.band,
                date: entry.date,
            }),
        });
    }
    catch {
    }
}
export async function getListeningHistory(): Promise<ListeningHistoryEntry[]> {
    try {
        const res = await authFetch("/api/listening/history");
        if (!res.ok)
            return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    }
    catch {
        return [];
    }
}
