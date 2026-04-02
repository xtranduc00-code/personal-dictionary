function pad2(n: number): string {
    return String(n).padStart(2, "0");
}

function toVttTime(srtTime: string): string {
    // SRT uses comma for milliseconds. Keep HH:MM:SS.mmm
    // Example: 00:01:02,345 -> 00:01:02.345
    const t = srtTime.trim().replace(",", ".");
    // Ensure at least HH:MM:SS.mmm
    const m = /^(\d{2}):(\d{2}):(\d{2})\.(\d{1,3})$/.exec(t);
    if (!m) {
        return t;
    }
    const ms = m[4]!.padEnd(3, "0").slice(0, 3);
    return `${m[1]}:${m[2]}:${m[3]}.${ms}`;
}

export function srtToVtt(srt: string): string {
    // Minimal conversion: drop numeric indices, convert arrow timings, keep text lines.
    const lines = srt.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    const out: string[] = ["WEBVTT", ""];

    let i = 0;
    while (i < lines.length) {
        const line = lines[i]!.trim();
        if (!line) {
            i++;
            continue;
        }
        // Optional cue number
        if (/^\d+$/.test(line)) {
            i++;
        }
        const timeLine = (lines[i] || "").trim();
        const tm = /^(.+?)\s*-->\s*(.+?)(?:\s+.*)?$/.exec(timeLine);
        if (!tm) {
            // Not a timing line; skip this block
            i++;
            continue;
        }
        const start = toVttTime(tm[1]!);
        const end = toVttTime(tm[2]!);
        out.push(`${start} --> ${end}`);
        i++;
        // Text until blank line
        while (i < lines.length && (lines[i] || "").trim() !== "") {
            out.push(lines[i]!);
            i++;
        }
        out.push("");
        while (i < lines.length && (lines[i] || "").trim() === "") {
            i++;
        }
    }

    return out.join("\n");
}

