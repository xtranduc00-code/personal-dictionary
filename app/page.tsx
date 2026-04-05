import type { Metadata } from "next";
import { DailyNewsHub } from "@/components/engoo/daily-news-hub";

export const metadata: Metadata = {
  title: "Daily News | Ken Workspace",
  description:
    "Engoo-style Daily News and Guardian headlines — read structured lessons and start an AI tutor call with full context.",
};

export default function HomePage() {
  return <DailyNewsHub />;
}
