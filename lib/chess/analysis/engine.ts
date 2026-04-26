// Adapted from WintrChess (GPL-3.0). Personal use only.
//
// Stockfish UCI worker wrapper. The worker file (e.g. stockfish-17-lite-single.js)
// must be served from /engines/<name> in the public folder.

import { Chess } from "chess.js";

import type { EngineLine } from "./wintrchess/types/EngineLine";

const uciEvaluationTypes: Record<string, "centipawn" | "mate" | undefined> = {
  cp: "centipawn",
  mate: "mate",
};

export const STOCKFISH_DEFAULT = "stockfish-17-lite-single.js";

export class Engine {
  private worker: Worker;
  private version: string;
  private position: string;
  private evaluating = false;
  /** Surfaced Worker error, if any. Consulted by callers when evaluate hangs. */
  public lastError: string | null = null;

  constructor(workerFilename: string = STOCKFISH_DEFAULT) {
    const url = `/engines/${workerFilename}`;
    try {
      this.worker = new Worker(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[stockfish] failed to instantiate Worker(${url})`, err);
      throw new Error(`Failed to load Stockfish worker at ${url}: ${msg}`);
    }
    this.version = workerFilename;
    this.position =
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    // Attach the error listener BEFORE any postMessage so a load failure
    // (404 on .js, MIME issue, .wasm fetch error, CSP block) actually surfaces.
    this.worker.addEventListener("error", (event) => {
      const detail =
        (event as ErrorEvent).message ||
        (event as ErrorEvent).error?.toString() ||
        "Unknown worker error";
      this.lastError = detail;
      console.error(`[stockfish] worker error (${url}):`, detail, event);
    });
    this.worker.addEventListener("messageerror", (event) => {
      console.error(`[stockfish] message error`, event);
    });

    this.worker.postMessage("uci");
    this.setPosition(this.position);
  }

  private consumeLogs(
    command: string,
    endCondition: (logMessage: string) => boolean,
    onLogReceived?: (logMessage: string) => void,
  ): Promise<string[]> {
    if (command) this.worker.postMessage(command);

    const worker = this.worker;
    const logMessages: string[] = [];

    return new Promise((res, rej) => {
      function onMessageReceived(event: MessageEvent) {
        const message = String(event.data);
        onLogReceived?.(message);
        logMessages.push(message);

        if (endCondition(message)) {
          worker.removeEventListener("message", onMessageReceived);
          worker.removeEventListener("error", rej);
          res(logMessages);
        }
      }

      this.worker.addEventListener("message", onMessageReceived);
      this.worker.addEventListener("error", rej);
    });
  }

  onMessage(handler: (message: string) => void) {
    this.worker.addEventListener("message", (event) =>
      handler(String(event.data)),
    );
    return this;
  }

  onError(handler: (error: string) => void) {
    this.worker.addEventListener("error", (event) =>
      handler(String(event.error)),
    );
    return this;
  }

  terminate() {
    try {
      this.worker.postMessage("quit");
    } catch {
      // ignore
    }
    this.worker.terminate();
  }

  setOption(option: string, value: string) {
    this.worker.postMessage(`setoption name ${option} value ${value}`);
    return this;
  }

  setLineCount(lines: number) {
    this.setOption("MultiPV", lines.toString());
    return this;
  }

  setThreadCount(threads: number) {
    this.setOption("Threads", threads.toString());
    return this;
  }

  setPosition(fen: string, uciMoves?: string[]) {
    if (uciMoves?.length) {
      this.worker.postMessage(
        `position fen ${fen} moves ${uciMoves.join(" ")}`,
      );

      const board = new Chess(fen);
      for (const uciMove of uciMoves) board.move(uciMove);
      this.position = board.fen();
      return this;
    }

    this.worker.postMessage(`position fen ${fen}`);
    this.position = fen;
    return this;
  }

  async evaluate(options: {
    depth: number;
    timeLimit?: number;
    onEngineLine?: (line: EngineLine) => void;
  }): Promise<EngineLine[]> {
    const engineLines: EngineLine[] = [];
    const maxTimeArgument = options.timeLimit
      ? `movetime ${options.timeLimit}`
      : "";

    this.evaluating = true;

    await this.consumeLogs(
      `go depth ${options.depth} ${maxTimeArgument}`.trim(),
      (log) => log.startsWith("bestmove") || log.includes("depth 0"),
      (log) => {
        if (!log.startsWith("info depth")) return;
        if (log.includes("currmove")) return;

        const depth = parseInt(log.match(/(?<= depth )\d+/)?.[0] || "");
        if (isNaN(depth)) return;

        const index =
          parseInt(log.match(/(?<= multipv )\d+/)?.[0] || "") || 1;

        const scoreMatches = log.match(/ score (cp|mate) (-?\d+)/);
        const evaluationType = uciEvaluationTypes[scoreMatches?.[1] || ""];
        if (evaluationType != "centipawn" && evaluationType != "mate") return;

        let evaluationScore = parseInt(scoreMatches?.[2] || "");
        if (isNaN(evaluationScore)) return;

        // Always express evaluation from White's POV
        if (this.position.includes(" b ")) evaluationScore = -evaluationScore;

        const moveUcis =
          log.match(/ pv (.*)/)?.at(1)?.split(" ") || [];

        const moveSans: string[] = [];
        const board = new Chess(this.position);
        for (const moveUci of moveUcis) {
          try {
            moveSans.push(board.move(moveUci).san);
          } catch {
            // PV from engine may include illegal moves at low depth
            return;
          }
        }

        const newEngineLine: EngineLine = {
          depth,
          index,
          evaluation: { type: evaluationType, value: evaluationScore },
          source: this.version,
          moves: moveUcis.map((moveUci, moveIndex) => ({
            uci: moveUci,
            san: moveSans[moveIndex],
          })),
        };

        engineLines.push(newEngineLine);
        options.onEngineLine?.(newEngineLine);
      },
    );

    this.evaluating = false;
    return engineLines;
  }

  async stopEvaluation() {
    this.worker.postMessage("stop");

    if (this.evaluating) {
      await this.consumeLogs("", (log) => log.includes("bestmove"));
    }

    this.evaluating = false;
  }
}

export default Engine;
