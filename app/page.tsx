import type { Metadata } from "next";
import { PortfolioHome } from "@/components/portfolio/portfolio-home";

export const metadata: Metadata = {
  title: "Ken Workspace",
  description:
    "All-in-One Productivity App — portfolio, IELTS tools, Daily News, notes, calendar, and more.",
};

export default function HomePage() {
  return <PortfolioHome />;
}
