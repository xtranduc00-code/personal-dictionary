// Adapted from WintrChess (GPL-3.0). Personal use only. See ../LICENSE.md.

export enum Classification {
  BRILLIANT = "brilliant",
  CRITICAL = "critical",
  BEST = "best",
  EXCELLENT = "excellent",
  OKAY = "okay",
  INACCURACY = "inaccuracy",
  MISTAKE = "mistake",
  BLUNDER = "blunder",
  THEORY = "theory",
  FORCED = "forced",
  RISKY = "risky",
}

export const classifValues: Record<Classification, number> = {
  [Classification.BLUNDER]: 0,
  [Classification.MISTAKE]: 1,
  [Classification.INACCURACY]: 2,
  [Classification.RISKY]: 2,
  [Classification.OKAY]: 3,
  [Classification.EXCELLENT]: 4,
  [Classification.BEST]: 5,
  [Classification.CRITICAL]: 5,
  [Classification.BRILLIANT]: 5,
  [Classification.FORCED]: 5,
  [Classification.THEORY]: 5,
};
