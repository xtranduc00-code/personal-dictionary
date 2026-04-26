// Coach abstraction.
//
// `generateMoveCoachExplanation(input)` picks the configured backend at
// runtime. Today only the deterministic template backend is wired up; an
// OpenAI-powered backend can be plugged in later by exporting it from
// ./openai-coach.ts and importing here.

import { templateCoach } from "./template-coach";
import type { CoachBackend, MoveCoachInput, MoveCoachOutput } from "./types";

export type { MoveCoachInput, MoveCoachOutput };

let configuredBackend: CoachBackend = templateCoach;

/** Swap the active backend (e.g. an LLM-driven one) at runtime. */
export function setCoachBackend(backend: CoachBackend) {
  configuredBackend = backend;
}

export async function generateMoveCoachExplanation(
  input: MoveCoachInput,
): Promise<MoveCoachOutput> {
  return await configuredBackend(input);
}
