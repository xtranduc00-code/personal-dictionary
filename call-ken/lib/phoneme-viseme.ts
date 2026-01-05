import { dictionary as cmuDictionary } from "cmu-pronouncing-dictionary";

export type Viseme =
  | "rest"
  | "closed"
  | "open"
  | "wide"
  | "round"
  | "bite"
  | "tongue";

export type VisemeFrame = {
  atMs: number;
  viseme: Viseme;
};

const CMU_DICT: Record<string, string> =
  (cmuDictionary as Record<string, string>) || {};

const ARPABET_TO_VISEME: Record<string, Viseme> = {
  AA: "open",
  AE: "open",
  AH: "open",
  AO: "round",
  AW: "round",
  AY: "wide",
  B: "closed",
  CH: "bite",
  D: "tongue",
  DH: "tongue",
  EH: "wide",
  ER: "round",
  EY: "wide",
  F: "bite",
  G: "open",
  HH: "open",
  IH: "wide",
  IY: "wide",
  JH: "bite",
  K: "open",
  L: "tongue",
  M: "closed",
  N: "tongue",
  NG: "open",
  OW: "round",
  OY: "round",
  P: "closed",
  R: "round",
  S: "bite",
  SH: "round",
  T: "tongue",
  TH: "tongue",
  UH: "round",
  UW: "round",
  V: "bite",
  W: "round",
  Y: "wide",
  Z: "bite",
  ZH: "round",
};

const VOWEL_PHONE = /^(AA|AE|AH|AO|AW|AY|EH|ER|EY|IH|IY|OW|OY|UH|UW)/;

function normalizeWord(raw: string): string {
  return raw.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, "").toUpperCase();
}

function splitPhones(pronunciation: string): string[] {
  return pronunciation
    .split(/\s+/)
    .map((part) => part.replace(/[0-9]/g, ""))
    .filter(Boolean);
}

function guessPhonesFromGraphemes(word: string): string[] {
  const lower = word.toLowerCase();
  const phones: string[] = [];
  let i = 0;
  while (i < lower.length) {
    const tri = lower.slice(i, i + 3);
    const duo = lower.slice(i, i + 2);
    const one = lower[i];

    if (tri === "tch") {
      phones.push("CH");
      i += 3;
      continue;
    }

    if (duo === "th") {
      phones.push("TH");
      i += 2;
      continue;
    }
    if (duo === "sh") {
      phones.push("SH");
      i += 2;
      continue;
    }
    if (duo === "ch") {
      phones.push("CH");
      i += 2;
      continue;
    }
    if (duo === "ph") {
      phones.push("F");
      i += 2;
      continue;
    }
    if (duo === "ng") {
      phones.push("NG");
      i += 2;
      continue;
    }
    if (duo === "oo") {
      phones.push("UW");
      i += 2;
      continue;
    }
    if (duo === "ee") {
      phones.push("IY");
      i += 2;
      continue;
    }
    if (duo === "ou") {
      phones.push("AW");
      i += 2;
      continue;
    }

    switch (one) {
      case "a":
        phones.push("AE");
        break;
      case "e":
        phones.push("EH");
        break;
      case "i":
        phones.push("IH");
        break;
      case "o":
        phones.push("OW");
        break;
      case "u":
        phones.push("UH");
        break;
      case "b":
        phones.push("B");
        break;
      case "c":
      case "k":
      case "q":
        phones.push("K");
        break;
      case "d":
        phones.push("D");
        break;
      case "f":
        phones.push("F");
        break;
      case "g":
        phones.push("G");
        break;
      case "h":
        phones.push("HH");
        break;
      case "j":
        phones.push("JH");
        break;
      case "l":
        phones.push("L");
        break;
      case "m":
        phones.push("M");
        break;
      case "n":
        phones.push("N");
        break;
      case "p":
        phones.push("P");
        break;
      case "r":
        phones.push("R");
        break;
      case "s":
      case "x":
        phones.push("S");
        break;
      case "t":
        phones.push("T");
        break;
      case "v":
        phones.push("V");
        break;
      case "w":
        phones.push("W");
        break;
      case "y":
        phones.push("Y");
        break;
      case "z":
        phones.push("Z");
        break;
      default:
        break;
    }

    i += 1;
  }

  return phones.length > 0 ? phones : ["AH"];
}

function wordToPhones(word: string): string[] {
  if (!word) return [];
  const direct = CMU_DICT[word];
  if (direct) return splitPhones(direct);

  // CMU stores alternatives as WORD(1), WORD(2)...
  const altPrefix = `${word}(`;
  const firstAltKey = Object.keys(CMU_DICT).find((key) =>
    key.startsWith(altPrefix)
  );
  if (firstAltKey) return splitPhones(CMU_DICT[firstAltKey]);

  return guessPhonesFromGraphemes(word);
}

function phoneToViseme(phone: string): Viseme {
  return ARPABET_TO_VISEME[phone] ?? "rest";
}

export function textToVisemeFrames(
  text: string,
  opts: {
    startAtMs: number;
    totalDurationMs: number;
  }
): VisemeFrame[] {
  const words = text
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean);

  const phones = words.flatMap(wordToPhones);
  if (phones.length === 0) return [];

  const weightedUnits = phones.reduce((sum, phone) => {
    return sum + (VOWEL_PHONE.test(phone) ? 1.45 : 1);
  }, 0);

  const msPerUnit = Math.max(22, opts.totalDurationMs / Math.max(1, weightedUnits));
  const frames: VisemeFrame[] = [];
  let cursor = opts.startAtMs;

  for (const phone of phones) {
    const weight = VOWEL_PHONE.test(phone) ? 1.45 : 1;
    const viseme = phoneToViseme(phone);
    frames.push({ atMs: cursor, viseme });
    cursor += msPerUnit * weight;
  }

  frames.push({ atMs: cursor, viseme: "rest" });
  return frames;
}
