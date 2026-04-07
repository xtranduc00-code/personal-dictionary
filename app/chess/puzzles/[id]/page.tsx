"use client";

import { useParams } from "next/navigation";
import { ChessWorkspace } from "../../chess-workspace";

export default function ChessPuzzleByIdPage() {
  const params = useParams();
  const raw = params?.id;
  const id = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  return <ChessWorkspace initialLibraryPuzzleId={id || undefined} />;
}
