"use client";

import { createContext, useContext } from "react";
import type {
  BulkCreateFormValues,
  LogEntry,
  ProfilePair,
} from "@/lib/dolphin/types";

export type RunStatus =
  | "idle"
  | "running"
  | "paused"
  | "done"
  | "cancelled"
  | "failed";

export type DolphinState = {
  status: RunStatus;
  results: LogEntry[];
  totalCount: number;
  pauseRemainingMs: number;
  pauseReason: string | null;
  errorMessage: string | null;
};

export type DolphinContextValue = {
  state: DolphinState;
  runBulkCreate: (
    pairs: ProfilePair[],
    form: BulkCreateFormValues,
  ) => Promise<void>;
  cancelRun: () => void;
  resetResults: () => void;
};

export const DolphinContext = createContext<DolphinContextValue | null>(null);

export function useDolphin(): DolphinContextValue {
  const ctx = useContext(DolphinContext);
  if (!ctx) {
    throw new Error("useDolphin must be used within DolphinProvider");
  }
  return ctx;
}
