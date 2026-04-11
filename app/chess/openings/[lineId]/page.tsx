"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { PracticeBoard, findOpeningById } from "../../opening-trainer";

export default function OpeningBoardPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params?.lineId;
  const lineId = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "";
  const quickStart = lineId ? findOpeningById(lineId) : undefined;

  useEffect(() => {
    if (!quickStart) router.replace("/chess/openings");
  }, [quickStart, router]);

  if (!quickStart) return null;

  return <PracticeBoard quickStart={quickStart} onBack={() => router.push("/chess/openings")} />;
}
