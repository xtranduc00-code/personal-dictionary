import type { Metadata } from "next";
import Link from "next/link";
import { ArticleBrowserHome } from "@/components/articles/article-browser-home";

export const metadata: Metadata = {
  title: "Import reading | Ken Workspace",
  description: "Paste a news URL or plain text to save and read offline.",
};

export default function ReadingImportPage() {
  return (
    <div>
      <div className="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <Link
          href="/news"
          className="text-sm font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
        >
          ← Back to Daily News
        </Link>
      </div>
      <ArticleBrowserHome />
    </div>
  );
}
