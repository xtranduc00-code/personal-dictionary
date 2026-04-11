"use client";

import { useRouter } from "next/navigation";
import { PracticeMode } from "../opening-trainer";

export default function OpeningsListPage() {
  const router = useRouter();
  return (
    <PracticeMode
      onBack={() => router.push("/chess")}
      onSelect={(qs) => router.push(`/chess/openings/${qs.id}`)}
    />
  );
}
