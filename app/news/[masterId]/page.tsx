import type { Metadata } from "next";
import { EngooLessonClient } from "@/components/engoo/engoo-lesson-client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function NewsLessonPage({
  params,
}: {
  params: Promise<{ masterId: string }>;
}) {
  const { masterId } = await params;
  if (!UUID_RE.test(masterId)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-zinc-600">
        <p>Invalid lesson link.</p>
        <a href="/" className="mt-4 inline-block text-sm underline">
          Back to Daily News
        </a>
      </div>
    );
  }
  return <EngooLessonClient masterId={masterId} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ masterId: string }>;
}): Promise<Metadata> {
  const { masterId } = await params;
  return {
    title: "Daily News lesson",
    description: `Engoo lesson ${masterId.slice(0, 8)}…`,
  };
}
