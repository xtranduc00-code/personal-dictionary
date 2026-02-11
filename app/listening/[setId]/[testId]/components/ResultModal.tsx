"use client";
import type { IeltsAnswer } from "@/components/ielts-result-modal";
import { IeltsResultModal } from "@/components/ielts-result-modal";
type Props = {
    onClose: () => void;
    correctAnswers: Record<number, IeltsAnswer> | undefined;
    answers: Record<number, string>;
    isCorrect: (qNum: number) => boolean | null;
    onAddFlashcard?: (word: string) => void;
};
export function ResultModal({ onClose, correctAnswers, answers, isCorrect, onAddFlashcard, }: Props) {
    return (<IeltsResultModal onClose={onClose} correctAnswers={correctAnswers} answers={answers} isCorrect={isCorrect} totalCount={40} onAddFlashcard={onAddFlashcard}/>);
}
