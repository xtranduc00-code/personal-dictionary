/**
 * Strip markdown for session list / history preview (plain text only).
 */
export function markdownToPlainPreview(md: string, maxLen = 220): string {
    let s = md.replace(/\r\n/g, "\n");

    s = s.replace(/```[\w-]*\n[\s\S]*?```/g, " ");
    s = s.replace(/```[\s\S]*?```/g, " ");

    s = s.replace(/^#{1,6}\s+/gm, "");
    s = s.replace(/^\s{0,3}[-*+]\s+/gm, "");
    s = s.replace(/^\s*\d+\.\s+/gm, "");

    s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
    s = s.replace(/\*([^*]+)\*/g, "$1");
    s = s.replace(/__([^_]+)__/g, "$1");
    s = s.replace(/_([^_]+)_/g, "$1");

    s = s.replace(/`([^`]+)`/g, "$1");
    s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
    s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");

    s = s.replace(/<[^>]+>/g, " ");
    s = s.replace(/\s+/g, " ").trim();

    if (s.length <= maxLen)
        return s;
    return `${s.slice(0, maxLen - 1)}…`;
}
