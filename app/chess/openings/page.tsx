"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

const PracticeMode = dynamic(
  () => import("../opening-trainer").then((m) => m.PracticeMode),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    ),
  },
);

export default function OpeningsListPage() {
  const router = useRouter();
  return (
    <PracticeMode
      onBack={() => router.push("/chess")}
      onSelect={(qs) => router.push(`/chess/openings/${qs.id}`)}
    />
  );
}
