"use client";
import { createContext, useContext } from "react";
export const ScrollToAnswerContext = createContext<((qNum: number) => void) | null>(null);
export function useScrollToAnswer() {
    return useContext(ScrollToAnswerContext);
}
