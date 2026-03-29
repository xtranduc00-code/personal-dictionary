import type { Metadata } from "next";
import { StudyScheduleGrid } from "@/components/study-schedule-grid";

export const metadata: Metadata = {
  title: "Study schedule grid",
  description:
    "Shared hourly grid to plan study slots — rename columns, color cells, export CSV.",
};

export default function StudySchedulePage() {
  return <StudyScheduleGrid />;
}
