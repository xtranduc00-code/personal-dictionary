export type StudyKitChatMsg = { id: string; role: "user" | "assistant"; content: string };

export function newStudyKitChatMsgId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto)
        return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
