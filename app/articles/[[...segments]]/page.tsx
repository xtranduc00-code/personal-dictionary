import type { Metadata } from "next";
import { ArticleReadView } from "@/components/articles/article-read-view";
import { isSavedArticleId } from "@/lib/saved-articles";

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ segments?: string[] }>;
}) {
  const { segments = [] } = await params;

  if (segments.length === 1 && isSavedArticleId(segments[0])) {
    return <ArticleReadView articleId={segments[0]} />;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center text-zinc-600">
      <p>
        Saved readings use a single ID. Daily News lessons live at{" "}
        <a href="/news" className="underline">
          /news
        </a>
        .
      </p>
      <a href="/news" className="mt-4 inline-block text-sm underline">
        Back to Daily News
      </a>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ segments?: string[] }>;
}): Promise<Metadata> {
  const { segments = [] } = await params;
  return {
    title: "Reading",
    description:
      segments.length > 0
        ? `Reading: ${segments.join("/").slice(0, 80)}`
        : "Reading",
  };
}
