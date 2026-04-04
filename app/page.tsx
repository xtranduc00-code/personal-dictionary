import type { Metadata } from "next";
import { EngooDailyNewsHome } from "@/components/engoo/engoo-daily-news-home";

export const metadata: Metadata = {
  title: "Daily News | Ken Workspace",
  description:
    "Engoo-style Daily News browser — read structured lessons and start an AI tutor call with full context.",
};

export default function HomePage() {
  return <EngooDailyNewsHome />;
}
