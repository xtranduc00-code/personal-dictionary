"use client";
const BOLD_PHRASES = [
    "ONE WORD ONLY",
    "ONE WORD AND/OR A NUMBER",
    "NO MORE THAN TWO WORDS",
    "NO MORE THAN THREE WORDS",
    "NO MORE THAN TWO WORDS AND/OR A NUMBER",
].sort((a, b) => b.length - a.length);
function splitByPhrases(text: string): Array<{
    text: string;
    bold: boolean;
}> {
    let remaining = text;
    const result: Array<{
        text: string;
        bold: boolean;
    }> = [];
    const re = new RegExp("(" + BOLD_PHRASES.map((p) => p.replace(/\s+/g, "\\s+")).join("|") + ")", "gi");
    let m: RegExpExecArray | null;
    let lastIndex = 0;
    while ((m = re.exec(remaining)) !== null) {
        if (m.index > lastIndex) {
            result.push({ text: remaining.slice(lastIndex, m.index), bold: false });
        }
        result.push({ text: m[1], bold: true });
        lastIndex = re.lastIndex;
    }
    if (lastIndex < remaining.length) {
        result.push({ text: remaining.slice(lastIndex), bold: false });
    }
    if (result.length === 0 && text) {
        result.push({ text, bold: false });
    }
    return result;
}
export function InstructionSubBold({ text }: {
    text: string;
}) {
    const parts = splitByPhrases(text);
    return (<>
      {parts.map((p, i) => p.bold ? (<strong key={i} className="font-semibold text-zinc-800 dark:text-zinc-200">
            {p.text}
          </strong>) : (<span key={i}>{p.text}</span>))}
    </>);
}
