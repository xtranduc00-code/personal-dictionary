// Adapted from WintrChess (GPL-3.0). Personal use only. See ../LICENSE.md.

export interface Evaluation {
  type: "centipawn" | "mate";
  value: number;
}

export default Evaluation;
